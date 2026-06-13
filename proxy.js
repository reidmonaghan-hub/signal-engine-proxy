/**
 * SIGNAL ENGINE — DATA PROXY
 * ----------------------------------------------------------------------------
 * Why this exists:
 *   Browsers block direct calls to data.sec.gov and most disclosure sources
 *   (no CORS headers). A server has no such restriction. This proxy fetches the
 *   data, parses it, and re-serves it to the dashboard with open CORS headers.
 *
 * What it does:
 *   GET /api/insiders?tickers=COIN,HOOD,NDAQ   -> live SEC Form 4 w/ buy|sell
 *   GET /api/congress?tickers=COIN,NVDA        -> Senate (free) + FMP (optional)
 *   GET /api/prices?ticker=COIN&days=400       -> daily OHLC from Stooq (free)
 *   GET /api/health                            -> uptime check
 *
 * Run locally:
 *   node proxy.js              (listens on :8787)
 * Deploy:
 *   Works as-is on Render/Railway/Fly. For Vercel/Netlify, each handler maps
 *   cleanly to a serverless function — split per-route if you prefer.
 *
 * Cost: £0. EDGAR is free (10 req/sec cap, User-Agent required). Senate Stock
 *   Watcher is free. FMP free tier = 250 calls/day (optional, for House data).
 *
 * Honest limits (read these):
 *   - Disclosure data is LAGGED. Congress files up to 45 days after the trade.
 *     This confirms a regime; it does not time an entry. Nothing here predicts.
 *   - House Stock Watcher's free feed died (403) in early 2026. House coverage
 *     now needs FMP (free key) or a paid source. Senate-only still works free.
 * ----------------------------------------------------------------------------
 */

import http from "node:http";

// ---- CONFIG ---------------------------------------------------------------
const PORT = process.env.PORT || 8787;
// SEC REQUIRES a descriptive User-Agent with contact info. Replace this.
const SEC_UA = process.env.SEC_UA || "SignalEngine/1.0 (your-email@example.com)";
// Optional: free key from financialmodelingprep.com for House + richer Senate.
const FMP_KEY = process.env.FMP_KEY || "";

// Fallback ticker -> CIK map, used only if SEC's live directory is unreachable.
// Normally CIKs resolve automatically from company_tickers.json (see below),
// so adding a watchlist name needs NO change here.
const CIK = {
  COIN: "0001679788", HOOD: "0001783879", NDAQ: "0001120193",
  NVDA: "0001045810", MU: "0000723125", ICE: "0001571949",
};

// ---- DYNAMIC TICKER → CIK / ISSUER-NAME RESOLUTION -------------------------
// SEC publishes the full ticker→CIK directory; we cache it 24h. This makes the
// watchlist freely extensible: any listed US ticker just works.
let _dirCache = { at: 0, data: null };
async function tickerDirectory() {
  if (_dirCache.data && Date.now() - _dirCache.at < 24 * 3600 * 1000) return _dirCache.data;
  const j = await (await secGet("https://www.sec.gov/files/company_tickers.json")).json();
  const byTicker = {};
  for (const k of Object.keys(j)) {
    const e = j[k];
    if (e?.ticker) byTicker[e.ticker.toUpperCase()] = { cik: String(e.cik_str).padStart(10, "0"), title: e.title || "" };
  }
  _dirCache = { at: Date.now(), data: byTicker };
  return byTicker;
}
async function resolveCik(ticker) {
  try { const d = await tickerDirectory(); if (d[ticker]?.cik) return d[ticker].cik; } catch (e) { /* fall back */ }
  return CIK[ticker] || null;
}
// 13F infotables name issuers by company NAME. Derive a match pattern from the
// SEC directory title (first two non-suffix words), with hand overrides kept.
const NAME_SUFFIXES = new Set(["inc", "corp", "corporation", "group", "plc", "ltd", "co", "company", "the", "holdings", "incorporated", "limited", "sa", "nv", "ag", "cl", "class"]);
async function issuerRegexFor(ticker) {
  if (ISSUER[ticker]) return ISSUER[ticker];
  try {
    const d = await tickerDirectory();
    const words = (d[ticker]?.title || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !NAME_SUFFIXES.has(w));
    if (!words.length) return null;
    return new RegExp("\\b" + words.slice(0, 2).join("\\s+"), "i");
  } catch (e) { return null; }
}

// ---- TINY UTILITIES -------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function send(res, code, body) {
  cors(res);
  res.writeHead(code);
  res.end(JSON.stringify(body));
}

async function secGet(url) {
  // Respect SEC's 10 req/sec cap by spacing calls at the call sites.
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA, "Accept-Encoding": "gzip" } });
  if (!r.ok) throw new Error(`SEC ${r.status} for ${url}`);
  return r;
}

// ---- EDGAR: FORM 4 WITH BUY/SELL DIRECTION --------------------------------
/**
 * The submissions index tells us a Form 4 exists, but the BUY vs SELL flag and
 * the dollar value live inside the filing's XML (the <transactionCode> and
 * <transactionAcquiredDisposedCode> tags). So we: (1) list recent Form 4s,
 * (2) fetch each filing's XML, (3) parse direction + value. Lightweight regex
 * parse — fine for these tags; swap to fast-xml-parser if you want robustness.
 */
async function fetchInsidersForCik(ticker, cik) {
  const idx = await (await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
  const recent = idx?.filings?.recent;
  if (!recent) return [];

  const events = [];
  for (let i = 0; i < recent.form.length && events.length < 5; i++) {
    if (recent.form[i] !== "4") continue;
    const accNoDash = recent.accessionNumber[i].replace(/-/g, "");
    const cikInt = parseInt(cik, 10);
    const primary = recent.primaryDocument[i];
    const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}`;
    const docUrl = `${base}/${primary}`;

    let direction = "UNKNOWN", value = null, role = "", who = "";
    try {
      await sleep(120); // stay under rate cap
      // The XML form doc is usually the primary; if HTML, derive the .xml sibling.
      const xmlUrl = primary.endsWith(".xml") ? docUrl : `${base}/${primary.replace(/\.html?$/, ".xml")}`;
      const xml = await (await secGet(xmlUrl)).text();

      // Acquired (A) = buy-side; Disposed (D) = sell-side.
      const ad = (xml.match(/<transactionAcquiredDisposedCode>\s*<value>\s*([AD])/i) || [])[1];
      if (ad === "A") direction = "BUY";
      else if (ad === "D") direction = "SELL";

      // Transaction code: P=open-market purchase, S=open-market sale (strongest signals).
      const code = (xml.match(/<transactionCode>\s*([A-Z])/i) || [])[1];
      if (code === "P") direction = "BUY";
      if (code === "S") direction = "SELL";

      const shares = parseFloat((xml.match(/<transactionShares>\s*<value>\s*([\d.]+)/i) || [])[1] || "0");
      const price = parseFloat((xml.match(/<transactionPricePerShare>\s*<value>\s*([\d.]+)/i) || [])[1] || "0");
      if (shares && price) value = Math.round(shares * price);

      who = (xml.match(/<rptOwnerName>\s*([^<]+)</i) || [])[1]?.trim() || "";
      const isDir = /<isDirector>\s*(1|true)/i.test(xml);
      const isOff = /<isOfficer>\s*(1|true)/i.test(xml);
      const title = (xml.match(/<officerTitle>\s*([^<]+)</i) || [])[1]?.trim();
      role = title || (isDir ? "Director" : isOff ? "Officer" : "10% Owner");
    } catch (e) { /* leave UNKNOWN; still surface the event + link */ }

    events.push({
      ticker, cik: cikInt, who, role, direction, value,
      filed: recent.filingDate[i],
      accession: recent.accessionNumber[i],
      doc: docUrl,
    });
  }
  return events;
}

// ---- CLUSTER DETECTION ----------------------------------------------------
// The strongest insider tell: 3+ insiders buying the same name in a short window.
function tagClusters(events) {
  const byTicker = {};
  for (const e of events) {
    if (e.direction !== "BUY") continue;
    (byTicker[e.ticker] ||= []).push(e);
  }
  const clusterTickers = new Set(
    Object.entries(byTicker).filter(([, arr]) => arr.length >= 3).map(([t]) => t)
  );
  return events.map((e) => ({ ...e, cluster: clusterTickers.has(e.ticker) && e.direction === "BUY" }));
}

// ---- 13F: INSTITUTIONAL POSITIONS (QUARTERLY, ~45 DAY LAG) -----------------
/**
 * Reads each fund's two most recent 13F-HR filings from EDGAR, sums shares per
 * issuer, and diffs quarter-over-quarter for watchlist names. HONEST LIMITS:
 * 13F is quarterly and filed up to 45 days after quarter end — this is regime
 * confirmation at its laggiest. It shows long US-equity positions only (no
 * shorts, no derivatives intent). Never read it as a timing signal.
 *
 * Funds tracked (verify any CIK at https://www.sec.gov/cgi-bin/browse-edgar):
 */
const FUNDS = [
  { name: "Berkshire Hathaway", cik: "0001067983" },
  { name: "Bridgewater", cik: "0001350694" },
  { name: "Citadel Advisors", cik: "0001423053" },
  { name: "Renaissance Tech", cik: "0001037389" },
  { name: "ARK Invest", cik: "0001697748" },
];
// Hand overrides for 13F issuer-name matching where the auto-derived pattern
// would be ambiguous. Most tickers resolve automatically via issuerRegexFor.
const ISSUER = {
  COIN: /coinbase/i, HOOD: /robinhood/i, NDAQ: /nasdaq/i,
  ICE: /intercontinental\s*exch/i, NVDA: /nvidia/i, MU: /micron/i,
};

let _13fCache = { at: 0, data: null }; // quarterly data — cache 12h, be kind to EDGAR

function parseInfotable(xml, patterns) {
  // Sum shares + reported value per matched watchlist ticker.
  const out = {};
  const blocks = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/gi) || [];
  for (const b of blocks) {
    const issuer = (b.match(/<(?:\w+:)?nameOfIssuer>\s*([^<]+)/i) || [])[1] || "";
    for (const [tk, re] of Object.entries(patterns)) {
      if (!re || !re.test(issuer)) continue;
      const shares = parseFloat((b.match(/<(?:\w+:)?sshPrnamt>\s*([\d.]+)/i) || [])[1] || "0");
      const value = parseFloat((b.match(/<(?:\w+:)?value>\s*([\d.]+)/i) || [])[1] || "0");
      (out[tk] ||= { shares: 0, value: 0 });
      out[tk].shares += shares; out[tk].value += value;
    }
  }
  return out;
}

async function fetch13fHoldings(cikPadded, accession, patterns) {
  const cikInt = parseInt(cikPadded, 10);
  const accNoDash = accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}`;
  const dir = await (await secGet(`${base}/index.json`)).json();
  const files = (dir?.directory?.item || []).map((f) => f.name);
  // The holdings live in the information-table XML (not primary_doc.xml).
  const info = files.find((f) => /infotable|information/i.test(f) && f.endsWith(".xml"))
    || files.find((f) => f.endsWith(".xml") && !/primary_doc/i.test(f));
  if (!info) return null;
  await sleep(120);
  const xml = await (await secGet(`${base}/${info}`)).text();
  return { holdings: parseInfotable(xml, patterns), doc: `${base}/${info}` };
}

async function fetch13f(tickers) {
  if (_13fCache.data && Date.now() - _13fCache.at < 12 * 3600 * 1000) return _13fCache.data;
  const patterns = {};
  for (const tk of tickers) patterns[tk] = await issuerRegexFor(tk);
  const rows = [];
  for (const fund of FUNDS) {
    try {
      const idx = await (await secGet(`https://data.sec.gov/submissions/CIK${fund.cik}.json`)).json();
      const recent = idx?.filings?.recent;
      if (!recent) continue;
      // Latest two 13F-HR filings = current + prior quarter.
      const picks = [];
      for (let i = 0; i < recent.form.length && picks.length < 2; i++) {
        if (recent.form[i] === "13F-HR") picks.push({ acc: recent.accessionNumber[i], filed: recent.filingDate[i] });
      }
      if (!picks.length) continue;
      await sleep(150);
      const curr = await fetch13fHoldings(fund.cik, picks[0].acc, patterns);
      await sleep(150);
      const prev = picks[1] ? await fetch13fHoldings(fund.cik, picks[1].acc, patterns) : null;
      if (!curr) continue;
      const seen = new Set([...Object.keys(curr.holdings), ...Object.keys(prev?.holdings || {})]);
      for (const tk of seen) {
        const c = curr.holdings[tk], p = prev?.holdings?.[tk];
        let move, chg;
        if (c && !p) { move = "Initiated"; chg = "new"; }
        else if (!c && p) { move = "Exited"; chg = "-100%"; }
        else {
          const pct = p.shares ? Math.round(((c.shares - p.shares) / p.shares) * 100) : 0;
          if (Math.abs(pct) < 1) { move = "Held"; chg = "~flat QoQ"; }
          else { move = pct > 0 ? "Added" : "Trimmed"; chg = `${pct > 0 ? "+" : ""}${pct}% QoQ`; }
        }
        rows.push({ fund: fund.name, ticker: tk, move, chg, shares: c?.shares || 0, value: c?.value || 0, filed: picks[0].filed, doc: curr.doc });
      }
    } catch (e) { /* skip fund — EDGAR hiccup or no 13F */ }
    await sleep(200);
  }
  const data = {
    source: "SEC EDGAR 13F-HR",
    lagNote: "Quarterly; filed up to 45 days after quarter end. Long US-equity positions only — regime confirmation, never timing.",
    count: rows.length, data: rows.sort((a, b) => new Date(b.filed) - new Date(a.filed)),
  };
  _13fCache = { at: Date.now(), data };
  return data;
}

// ---- CONGRESS: SENATE (FREE) + HOUSE VIA FMP (OPTIONAL) --------------------
async function fetchSenateTrades(tickers) {
  // Senate Stock Watcher: free, flat JSON, no key. Large file — we filter.
  const url = "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Senate feed ${r.status}`);
  const all = await r.json();
  const want = new Set(tickers.map((t) => t.toUpperCase()));
  return all
    .filter((t) => t.ticker && want.has(String(t.ticker).toUpperCase()))
    .slice(0, 40)
    .map((t) => ({
      chamber: "Senate",
      who: t.senator,
      ticker: t.ticker,
      action: /purchase/i.test(t.type) ? "BUY" : /sale/i.test(t.type) ? "SELL" : t.type,
      size: t.amount,
      traded: t.transaction_date,
      filed: t.disclosure_date,
    }));
}

async function fetchHouseTrades(tickers) {
  if (!FMP_KEY) return []; // House free feed is dead; needs FMP key.
  const out = [];
  for (const tk of tickers) {
    try {
      const r = await fetch(`https://financialmodelingprep.com/api/v4/house-trading?symbol=${tk}&apikey=${FMP_KEY}`);
      if (!r.ok) continue;
      const rows = await r.json();
      for (const t of (rows || []).slice(0, 8)) {
        out.push({
          chamber: "House",
          who: t.representative,
          ticker: t.symbol,
          action: /purchase/i.test(t.type) ? "BUY" : /sale/i.test(t.type) ? "SELL" : t.type,
          size: t.amount,
          traded: t.transactionDate,
          filed: t.disclosureDate,
        });
      }
    } catch (e) { /* skip ticker */ }
  }
  return out;
}

// ---- PRICES: DAILY OHLC FROM STOOQ (FREE, NO KEY) -------------------------
// Stooq serves CSV at stooq.com/q/d/l/?s=TICKER.US&i=d — no key, no CORS issue
// server-side. We parse it into the {date, close} bars the backtest expects.
async function fetchPrices(ticker, days) {
  // Indices (^vix, ^spx) keep their prefix; US equities get the .us suffix.
  const t = ticker.toLowerCase();
  const sym = t.startsWith("^") ? t : `${t}.us`;
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`);
  if (!r.ok) throw new Error(`Stooq ${r.status}`);
  const csv = await r.text();
  if (!csv || /N\/A/i.test(csv) || !csv.includes("Date")) throw new Error("no price data for " + ticker);
  const rows = csv.trim().split("\n").slice(1); // drop header
  const bars = rows.map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    return { date, open: +open, high: +high, low: +low, close: +close, volume: +volume };
  }).filter((b) => b.close > 0);
  return days ? bars.slice(-days) : bars;
}

// ---- REGIME WARNING LIGHTS (free macro series) -----------------------------
/**
 * Three market-wide stress indicators, all free, all primary-source:
 *   - Yield curve (10y minus 2y Treasury), FRED series T10Y2Y
 *   - High-yield credit spreads (the best free liquidity-stress tell), FRED BAMLH0A0HYM2
 *   - VIX (equity volatility), Stooq
 * HONEST FRAMING: these confirm what regime you are in. They do not predict
 * tops, crashes, or turning points — nothing does. CALM/WATCH/STRESS, never buy/sell.
 * Each indicator degrades independently: one failed fetch shows N/A, not a dead panel.
 */
let _regimeCache = { at: 0, data: null };

async function fredSeries(id, attempt = 1) {
  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
    if (!r.ok) throw new Error(`FRED ${r.status}`);
    const rows = (await r.text()).trim().split("\n").slice(1)
      .map((l) => { const [date, v] = l.split(","); return { date, v: parseFloat(v) }; })
      .filter((x) => !isNaN(x.v));
    if (!rows.length) throw new Error(`FRED ${id}: no data`);
    return rows;
  } catch (e) {
    if (attempt < 3) { await sleep(800 * attempt); return fredSeries(id, attempt + 1); } // transient hiccups happen
    throw e;
  }
}

async function fetchRegime() {
  if (_regimeCache.data && Date.now() - _regimeCache.at < 3600 * 1000) return _regimeCache.data;
  const lights = [];

  try {
    const s = await fredSeries("T10Y2Y");
    const v = s[s.length - 1].v;
    lights.push({
      id: "curve", label: "Yield curve (10y−2y)", value: `${v.toFixed(2)}%`, asOf: s[s.length - 1].date,
      status: v < 0 ? "STRESS" : v < 0.4 ? "WATCH" : "CALM",
      detail: v < 0 ? "Inverted — has historically preceded recessions, with lead times of 6–24 months. A regime fact, not a timer." : v < 0.4 ? "Flat — little term premium; watch for inversion." : "Positively sloped.",
      source: "https://fred.stlouisfed.org/series/T10Y2Y",
    });
  } catch (e) { lights.push({ id: "curve", label: "Yield curve (10y−2y)", value: "—", status: "N/A", detail: "FRED unreachable.", source: "https://fred.stlouisfed.org/series/T10Y2Y" }); }

  try {
    const s = await fredSeries("BAMLH0A0HYM2");
    const v = s[s.length - 1].v;
    const prior = s[Math.max(0, s.length - 43)].v; // ~2 months of observations
    const d = v - prior;
    lights.push({
      id: "credit", label: "High-yield credit spread", value: `${v.toFixed(2)}%`, asOf: s[s.length - 1].date,
      status: v >= 6 ? "STRESS" : v >= 4.5 || d >= 0.75 ? "WATCH" : "CALM",
      detail: d >= 0.75 ? `Widening fast (+${d.toFixed(2)}pp in ~2 months) — credit stress building. The best free liquidity-event early signal.` : v >= 6 ? "Wide — credit markets pricing real distress." : "Tight — credit calm.",
      source: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2",
    });
  } catch (e) { lights.push({ id: "credit", label: "High-yield credit spread", value: "—", status: "N/A", detail: "FRED unreachable.", source: "https://fred.stlouisfed.org/series/BAMLH0A0HYM2" }); }

  try {
    const s = await fredSeries("VIXCLS"); // VIX from FRED too — one reliable source beats two flaky ones
    const v = s[s.length - 1].v;
    lights.push({
      id: "vix", label: "VIX (equity volatility)", value: v.toFixed(1), asOf: s[s.length - 1].date,
      status: v >= 28 ? "STRESS" : v >= 20 ? "WATCH" : "CALM",
      detail: v >= 28 ? "Elevated — markets pricing large moves; expect violent both-way action." : v >= 20 ? "Raised — above long-run average." : "Subdued.",
      source: "https://fred.stlouisfed.org/series/VIXCLS",
    });
  } catch (e) { lights.push({ id: "vix", label: "VIX (equity volatility)", value: "—", status: "N/A", detail: "FRED unreachable.", source: "https://fred.stlouisfed.org/series/VIXCLS" }); }

  const data = {
    source: "FRED (St. Louis Fed) — primary, free",
    note: "Regime confirmation only. None of these predict or time anything; they tell you how much risk the market is already pricing.",
    lights,
  };
  // Don't lock a failure in for a full hour: retry partial results after 5 min.
  const ttl = lights.some((l) => l.status === "N/A") ? 5 * 60 * 1000 : 3600 * 1000;
  _regimeCache = { at: Date.now() - (3600 * 1000 - ttl), data };
  return data;
}

// ---- MACRO INTELLIGENCE: LIQUIDITY CYCLE + DOLLAR (Alden/Zulauf framework) -
/**
 * Lyn Alden's core insight: the single most important macro variable is whether
 * global liquidity (primarily US M2 + Fed balance sheet) is expanding or
 * contracting. When liquidity expands, risk assets across the board rise —
 * the tide lifts boats. When it contracts, correlation goes to 1 on the downside.
 *
 * Felix Zulauf adds: watch the dollar (DXY) as a liquidity multiplier — a
 * falling dollar loosens global financial conditions (EM and commodities benefit);
 * a rising dollar tightens them (dollar-debt stress, credit events).
 *
 * Series:
 *   WALCL  — Fed balance sheet (weekly, FRED)
 *   M2SL   — M2 money supply (monthly, FRED)
 *   DTWEXBGS — trade-weighted dollar index (FRED, more comprehensive than DXY)
 *   T10Y2Y — already in regime route, surfaced here in Alden framing too
 */
let _macroCache = { at: 0, data: null };

async function fredLatestTwo(id) {
  const rows = await fredSeries(id);
  return { latest: rows[rows.length - 1], prior: rows[rows.length - 2], prior3m: rows[Math.max(0, rows.length - 13)] };
}

async function fetchMacro() {
  if (_macroCache.data && Date.now() - _macroCache.at < 3600 * 1000) return _macroCache.data;
  const indicators = [];

  // Fed balance sheet — the primary liquidity spigot
  try {
    const { latest, prior } = await fredLatestTwo("WALCL");
    const chgB = ((latest.v - prior.v) / 1e6).toFixed(2); // billions
    const trend = latest.v > prior.v ? "EXPANDING" : "CONTRACTING";
    indicators.push({
      id: "fed_bs", label: "Fed Balance Sheet", value: `$${(latest.v / 1e6).toFixed(1)}T`,
      trend, chg: `${chgB >= 0 ? "+" : ""}${chgB}B WoW`, asOf: latest.date,
      interpretation: trend === "EXPANDING"
        ? "Alden: the spigot is open. Liquidity expansion is the strongest tailwind for risk assets."
        : "Alden: the spigot is tightening. Contracting balance sheet drains liquidity — all boats lower.",
      source: "https://fred.stlouisfed.org/series/WALCL",
    });
  } catch (e) { indicators.push({ id: "fed_bs", label: "Fed Balance Sheet", value: "—", trend: "N/A", source: "https://fred.stlouisfed.org/series/WALCL" }); }

  // M2 money supply — broader liquidity, monthly
  try {
    const { latest, prior3m } = await fredLatestTwo("M2SL");
    const yoyRows = await fredSeries("M2SL");
    const yoyPrior = yoyRows[Math.max(0, yoyRows.length - 13)];
    const yoy = yoyPrior ? (((latest.v - yoyPrior.v) / yoyPrior.v) * 100).toFixed(1) : null;
    const trend = latest.v > prior3m.v ? "EXPANDING" : "CONTRACTING";
    indicators.push({
      id: "m2", label: "M2 Money Supply", value: `$${(latest.v / 1000).toFixed(1)}T`,
      trend, chg: yoy ? `${yoy >= 0 ? "+" : ""}${yoy}% YoY` : "", asOf: latest.date,
      interpretation: `M2 ${trend.toLowerCase()} YoY. Alden: M2 growth above ~5% tends to support nominal asset prices; below ~2% is a headwind.`,
      source: "https://fred.stlouisfed.org/series/M2SL",
    });
  } catch (e) { indicators.push({ id: "m2", label: "M2 Money Supply", value: "—", trend: "N/A", source: "https://fred.stlouisfed.org/series/M2SL" }); }

  // Trade-weighted dollar — global liquidity multiplier (Zulauf)
  try {
    const { latest, prior3m } = await fredLatestTwo("DTWEXBGS");
    const chgPct = (((latest.v - prior3m.v) / prior3m.v) * 100).toFixed(1);
    const trend = latest.v > prior3m.v ? "STRENGTHENING" : "WEAKENING";
    indicators.push({
      id: "dollar", label: "Trade-weighted Dollar", value: latest.v.toFixed(1),
      trend, chg: `${chgPct >= 0 ? "+" : ""}${chgPct}% (3m)`, asOf: latest.date,
      interpretation: trend === "WEAKENING"
        ? "Zulauf: weakening dollar loosens global financial conditions. EM assets, commodities, and crypto tend to benefit. Positive for tokenisation thesis."
        : "Zulauf: strengthening dollar tightens global conditions — watch for EM stress and dollar-debt pressure. Headwind for commodities and risk.",
      source: "https://fred.stlouisfed.org/series/DTWEXBGS",
    });
  } catch (e) { indicators.push({ id: "dollar", label: "Trade-Weighted Dollar", value: "—", trend: "N/A", source: "https://fred.stlouisfed.org/series/DTWEXBGS" }); }

  // Composite liquidity signal — Alden's key summary
  const bs = indicators.find((i) => i.id === "fed_bs");
  const m2 = indicators.find((i) => i.id === "m2");
  const bsUp = bs?.trend === "EXPANDING";
  const m2Up = m2?.trend === "EXPANDING";
  const liquiditySignal = bsUp && m2Up ? "EXPANDING" : !bsUp && !m2Up ? "CONTRACTING" : "MIXED";
  const liquidityColor = liquiditySignal === "EXPANDING" ? "green" : liquiditySignal === "CONTRACTING" ? "red" : "amber";

  const data = {
    source: "FRED St. Louis Fed — primary, free",
    framework: "Lyn Alden liquidity cycle + Felix Zulauf dollar framework. These are the macro backdrop — regime context for every other signal in the system.",
    liquiditySignal, liquidityColor, indicators,
  };
  const ttl = indicators.some((i) => i.trend === "N/A") ? 5 * 60 * 1000 : 3600 * 1000;
  _macroCache = { at: Date.now() - (3600 * 1000 - ttl), data };
  return data;
}

// ---- NEWS: FILTERED RSS FEED (signal vs noise split) -----------------------
/**
 * Real-time global feed from primary-tier and news-tier RSS sources.
 * Central bank feeds (Fed, ECB, BIS, IMF) are tagged PRIMARY — treated like
 * disclosures, low noise. News wires (Reuters, FT) are tagged NEWS — faster
 * but noisier, framed accordingly. Filtered to watchlist themes + macro keywords.
 * Items are NOT presented as actionable — they're context for the intelligence
 * picture, not triggers.
 */
let _newsCache = { at: 0, data: null };

const RSS_SOURCES = [
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", tier: "PRIMARY" },
  { name: "ECB", url: "https://www.ecb.europa.eu/rss/press.html", tier: "PRIMARY" },
  { name: "BIS", url: "https://www.bis.org/rssfeed.htm", tier: "PRIMARY" },
  { name: "IMF", url: "https://www.imf.org/en/News/rss?language=eng", tier: "PRIMARY" },
  { name: "Reuters Markets", url: "https://feeds.reuters.com/reuters/businessNews", tier: "NEWS" },
  { name: "FT Markets", url: "https://www.ft.com/markets?format=rss", tier: "NEWS" },
];

const MACRO_KEYWORDS = /tokenis|tokeniz|crypto|bitcoin|digital asset|RWA|blockchain|insider|congress|senate|SEC |EDGAR|liquidity|credit spread|yield curve|fed balance|M2|rate cut|rate hike|quantitative|QE|QT|inflation|recession|dollar|DXY|NVDA|nvidia|coinbase|COIN|HOOD|robinhood|nasdaq|NDAQ|blackrock|BLK|circle|CME|broadcom|AMD|micron/i;

function parseRssItems(xml, source) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, 20)) {
    const title = (b.match(/<title>(?:<!\[CDATA\[)?\s*(.*?)\s*(?:\]\]>)?<\/title>/i) || [])[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const link = (b.match(/<link>([^<]+)<\/link>/i) || b.match(/<link[^>]+href="([^"]+)"/i) || [])[1]?.trim();
    const pub = (b.match(/<pubDate>([^<]+)<\/pubDate>/i) || b.match(/<published>([^<]+)<\/published>/i) || b.match(/<updated>([^<]+)<\/updated>/i) || [])[1]?.trim();
    if (!title || !MACRO_KEYWORDS.test(title)) continue;
    items.push({ title, link, pub: pub ? new Date(pub).toISOString() : null, source: source.name, tier: source.tier });
  }
  return items;
}

async function fetchNews() {
  if (_newsCache.data && Date.now() - _newsCache.at < 15 * 60 * 1000) return _newsCache.data; // 15min cache
  const items = [];
  await Promise.all(RSS_SOURCES.map(async (src) => {
    try {
      const r = await fetch(src.url, { headers: { "User-Agent": SEC_UA } });
      if (!r.ok) return;
      const xml = await r.text();
      items.push(...parseRssItems(xml, src));
    } catch (e) { /* skip unreachable source */ }
  }));
  items.sort((a, b) => (b.pub || "").localeCompare(a.pub || ""));
  const data = {
    note: "PRIMARY tier = central bank / regulator statements (low noise). NEWS tier = wire services (faster, noisier — context only, not signals).",
    count: items.length,
    items: items.slice(0, 40),
  };
  _newsCache = { at: Date.now(), data };
  return data;
}

// ---- ROUTER ---------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const tickers = (url.searchParams.get("tickers") || "COIN,HOOD,NDAQ")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  try {
    if (url.pathname === "/api/health") {
      return send(res, 200, { ok: true, time: new Date().toISOString(), fmp: !!FMP_KEY });
    }

    if (url.pathname === "/api/insiders") {
      let all = [];
      for (const tk of tickers) {
        const cik = await resolveCik(tk);
        if (!cik) continue;
        try { all.push(...await fetchInsidersForCik(tk, cik)); } catch (e) { /* skip */ }
        await sleep(150);
      }
      all = tagClusters(all).sort((a, b) => new Date(b.filed) - new Date(a.filed));
      return send(res, 200, { source: "SEC EDGAR Form 4", lagNote: "~2 day filing lag", count: all.length, data: all.slice(0, 12) });
    }

    if (url.pathname === "/api/13f") {
      return send(res, 200, await fetch13f(tickers));
    }

    if (url.pathname === "/api/regime") {
      return send(res, 200, await fetchRegime());
    }

    if (url.pathname === "/api/macro") {
      return send(res, 200, await fetchMacro());
    }

    if (url.pathname === "/api/news") {
      return send(res, 200, await fetchNews());
    }

    if (url.pathname === "/api/congress") {
      const [senate, house] = await Promise.all([
        fetchSenateTrades(tickers).catch(() => []),
        fetchHouseTrades(tickers).catch(() => []),
      ]);
      const data = [...senate, ...house].sort((a, b) => new Date(b.filed || 0) - new Date(a.filed || 0));
      return send(res, 200, {
        source: "Senate Stock Watcher (free) + FMP House" + (FMP_KEY ? "" : " [disabled: no FMP_KEY]"),
        lagNote: "STOCK Act allows up to 45 days from trade to disclosure",
        count: data.length, data: data.slice(0, 25),
      });
    }

    if (url.pathname === "/api/prices") {
      const ticker = url.searchParams.get("ticker") || "COIN";
      const days = parseInt(url.searchParams.get("days") || "0", 10) || null;
      const bars = await fetchPrices(ticker, days);
      return send(res, 200, { source: "Stooq daily OHLC", ticker: ticker.toUpperCase(), count: bars.length, data: bars });
    }

    return send(res, 404, { error: "Unknown route", routes: ["/api/insiders", "/api/congress", "/api/13f", "/api/regime", "/api/macro", "/api/news", "/api/prices", "/api/health"] });
  } catch (err) {
    return send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Signal Engine proxy on http://localhost:${PORT}`);
  console.log(`  /api/insiders?tickers=COIN,HOOD,NDAQ`);
  console.log(`  /api/congress?tickers=COIN,NVDA`);
  console.log(`  /api/prices?ticker=COIN&days=400`);
  console.log(FMP_KEY ? "  FMP key detected — House data enabled." : "  No FMP key — Senate-only (House feed is dead).");
});

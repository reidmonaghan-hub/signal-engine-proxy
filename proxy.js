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
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));

// ---- PWA STATIC ASSETS -------------------------------------------------------
const MANIFEST = JSON.stringify({
  name: "Signal Engine",
  short_name: "Signal·Engine",
  description: "Disclosed smart-money intelligence — not financial advice.",
  start_url: "/",
  display: "standalone",
  background_color: "#0B0E11",
  theme_color: "#0B0E11",
  orientation: "portrait-primary",
  icons: [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
  ],
});
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#0B0E11"/>
  <circle cx="96" cy="96" r="44" fill="none" stroke="#E0A33E" stroke-width="5"/>
  <circle cx="96" cy="96" r="8" fill="#E0A33E"/>
  <line x1="96" y1="16" x2="96" y2="52" stroke="#E0A33E" stroke-width="5" stroke-linecap="round"/>
  <line x1="96" y1="140" x2="96" y2="176" stroke="#E0A33E" stroke-width="5" stroke-linecap="round"/>
  <line x1="16" y1="96" x2="52" y2="96" stroke="#E0A33E" stroke-width="5" stroke-linecap="round"/>
  <line x1="140" y1="96" x2="176" y2="96" stroke="#E0A33E" stroke-width="5" stroke-linecap="round"/>
</svg>`;
const SW_JS = `
const CACHE='se-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))});
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('/api/'))return;
  e.respondWith(fetch(e.request).then(r=>{const cl=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));return r;}).catch(()=>caches.match(e.request)));
});`;

// ---- CONFIG ---------------------------------------------------------------
const PORT = process.env.PORT || 8787;
// SEC REQUIRES a descriptive User-Agent with contact info. Replace this.
const SEC_UA = process.env.SEC_UA || "SignalEngine/1.0 (your-email@example.com)";
// Optional: free key from financialmodelingprep.com for House + richer Senate.
const FMP_KEY = process.env.FMP_KEY || "";
// Optional: free key from alphavantage.co (25 req/day — low, kept as fallback).
const AV_KEY = process.env.AV_KEY || "";
// Preferred price source: free key from twelvedata.com (800 req/day free).
// Sign up at twelvedata.com, add TD_KEY env var on Render.
const TD_KEY = process.env.TD_KEY || "";

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

// ---- INSIDER RESULT CACHE --------------------------------------------------
// Each sync cycle could hit 20 tickers × 5 filings × 1 XML = 100 EDGAR requests.
// Filing lag is 2 days; a 30-minute cache loses nothing meaningful and cuts EDGAR
// load by ~97% across refresh cycles. Cached per ticker.
const _insiderCache = new Map(); // ticker → { at: timestamp, data: events[] }
const INSIDER_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchInsidersForCikCached(ticker, cik) {
  const hit = _insiderCache.get(ticker);
  if (hit && Date.now() - hit.at < INSIDER_TTL) return hit.data;
  const data = await fetchInsidersForCik(ticker, cik);
  _insiderCache.set(ticker, { at: Date.now(), data });
  return data;
}

// ---- CONGRESS RESULT CACHE -------------------------------------------------
// Senate Stock Watcher's S3 is a single point of failure. Cache successful results
// so a transient S3 hiccup doesn't kill the panel for the whole session.
let _congressCache = { at: 0, data: null };
const CONGRESS_TTL = 15 * 60 * 1000; // 15 minutes

// ---- SERVER-SIDE PRICE CACHE -----------------------------------------------
// Protects the Twelve Data 800 req/day free quota. Historical (400-day) fetches
// are cached 30 minutes; short-window fetches 10 minutes. Each ticker+days combo
// is cached independently. The cache lives in memory — a Render restart clears it,
// which is fine: it refills within one request cycle.
const _pxCache = new Map(); // key: "TICKER:days" → { at: timestamp, data: bars[] }
const PX_TTL_SHORT = 10 * 60 * 1000;   // 10 min for recent/short-window
const PX_TTL_LONG  = 30 * 60 * 1000;   // 30 min for historical (400-day backtest)
async function fetchPricesCached(ticker, days) {
  const key = `${ticker}:${days || 0}`;
  const ttl = (!days || days >= 200) ? PX_TTL_LONG : PX_TTL_SHORT;
  const hit = _pxCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await fetchPrices(ticker, days);
  _pxCache.set(key, { at: Date.now(), data });
  return data;
}

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

    let direction = "UNKNOWN", value = null, role = "", who = "", plan10b5 = false;
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

      // Rule 10b5-1 preplanned sale detection. A sale under a 10b5-1 plan was
      // scheduled months in advance — the decision was made under different market
      // conditions. Still informative, but flagged to reduce false-positive distribution warnings.
      if (direction === "SELL") {
        const fn = (xml.match(/<footnoteText>([^<]*)/gi) || []).map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
        plan10b5 = /<Rule10b5-1TransactionIndicator>\s*Y/i.test(xml) || /rule\s*10b5-1|10b5-1\s*plan/i.test(fn);
      }
    } catch (e) { /* leave UNKNOWN; still surface the event + link */ }

    events.push({
      ticker, cik: cikInt, who, role, direction, value, plan10b5,
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
  // Only cache if we got real data. An empty result from a partial EDGAR outage
  // must NOT be cached — it would lock in a blank 13F panel for 12 hours even
  // after EDGAR recovers, because _13fCache.data would be truthy ({count:0, data:[]}).
  if (rows.length > 0) _13fCache = { at: Date.now(), data };
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

// ---- PRICES: DAILY OHLC — Yahoo Finance (primary), Stooq (fallback) --------
// Yahoo Finance: no key, reliable server-side, covers equities + ETFs + indices.
// Stooq: kept as fallback for anything Yahoo doesn't carry.
async function fetchPricesYahoo(ticker, days) {
  const range = days && days <= 365 ? "1y" : "2y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}&includePrePost=false`;
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error("Yahoo: no result");
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const bars = ts.map((t, i) => ({
    date: new Date(t * 1000).toISOString().slice(0, 10),
    open: q.open?.[i] ?? null,
    high: q.high?.[i] ?? null,
    low: q.low?.[i] ?? null,
    close: q.close?.[i] ?? null,
    volume: q.volume?.[i] ?? null,
  })).filter((b) => b.close != null && b.close > 0);
  if (!bars.length) throw new Error("Yahoo: empty bars for " + ticker);
  return days ? bars.slice(-days) : bars;
}

async function fetchPricesStooq(ticker, days) {
  const t = ticker.toLowerCase();
  const sym = t.startsWith("^") ? t : `${t}.us`;
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`);
  if (!r.ok) throw new Error(`Stooq ${r.status}`);
  const csv = await r.text();
  if (!csv || /N\/A/i.test(csv) || !csv.includes("Date")) throw new Error("Stooq: no data for " + ticker);
  const bars = csv.trim().split("\n").slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    return { date, open: +open, high: +high, low: +low, close: +close, volume: +volume };
  }).filter((b) => b.close > 0);
  return days ? bars.slice(-days) : bars;
}

async function fetchPricesAV(ticker, days) {
  if (!AV_KEY) throw new Error("no AV_KEY");
  const size = days && days <= 100 ? "compact" : "full"; // compact = last 100 bars
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=${size}&apikey=${AV_KEY}`;
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!r.ok) throw new Error(`AV ${r.status}`);
  const j = await r.json();
  if (j["Note"] || j["Information"]) throw new Error("AV rate limit hit — 25 req/day on free tier");
  const series = j["Time Series (Daily)"];
  if (!series) throw new Error("AV: no series for " + ticker);
  const bars = Object.entries(series)
    .map(([date, v]) => ({ date, open: +v["1. open"], high: +v["2. high"], low: +v["3. low"], close: +v["4. close"], volume: +v["5. volume"] }))
    .filter((b) => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!bars.length) throw new Error("AV: empty bars for " + ticker);
  return days ? bars.slice(-days) : bars;
}

async function fetchPricesTD(ticker, days) {
  if (!TD_KEY) throw new Error("no TD_KEY");
  const size = Math.min(days || 400, 400);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${size}&apikey=${TD_KEY}`;
  const r = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!r.ok) throw new Error(`TwelveData ${r.status}`);
  const j = await r.json();
  if (j.status === "error") throw new Error(`TwelveData: ${j.message}`);
  const values = j.values;
  if (!values?.length) throw new Error("TwelveData: no data for " + ticker);
  const bars = values
    .map((v) => ({ date: v.datetime.slice(0, 10), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +(v.volume || 0) }))
    .filter((b) => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

async function fetchPrices(ticker, days) {
  if (TD_KEY) return fetchPricesTD(ticker, days);           // 800 req/day free — preferred
  if (AV_KEY) return fetchPricesAV(ticker, days);           // 25 req/day — fallback
  try { return await fetchPricesYahoo(ticker, days); } catch (e) { /* fall through */ }
  return fetchPricesStooq(ticker, days);                     // last resort
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
    const s = await fredSeries("VIXCLS"); // VIX from FRED — reliable, no symbol quirks
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

// ---- 13D/13G ACTIVIST / SIGNIFICANT HOLDER FILINGS -------------------------
/**
 * When anyone acquires 5%+ of a public company's shares they must file on EDGAR:
 *   SC 13D  — filed WITH activist intent (wants to influence management). Strong signal.
 *   SC 13G  — filed as PASSIVE holder (index fund, long-term accumulator). Moderate signal.
 *   /A amendments — material changes to a prior filing (position change, increased stake).
 *
 * We use EDGAR's full-text search (EFTS) to find recent 13D/13G filings mentioning
 * each watchlist company by name. These are public filings and entirely free.
 *
 * HONEST LIMITS: 5%+ threshold means many significant builds happen below the radar
 * until the position is large. Like Form 4 data, this is regime confirmation —
 * evidence that serious money has already accumulated, not that it's accumulating now.
 */
const ACTIVIST_MAP = [
  { ticker: "COIN",  name: "Coinbase" },
  { ticker: "HOOD",  name: "Robinhood" },
  { ticker: "NDAQ",  name: "Nasdaq" },
  { ticker: "ICE",   name: "Intercontinental Exchange" },
  { ticker: "CME",   name: "CME Group" },
  { ticker: "BLK",   name: "BlackRock" },
  { ticker: "BK",    name: "BNY Mellon" },
  { ticker: "CRCL",  name: "Circle" },
  { ticker: "CBOE",  name: "Cboe" },
  { ticker: "MKTX",  name: "MarketAxess" },
  { ticker: "V",     name: "Visa" },
  { ticker: "MA",    name: "Mastercard" },
  { ticker: "PYPL",  name: "PayPal" },
  { ticker: "NVDA",  name: "Nvidia" },
  { ticker: "AMD",   name: "Advanced Micro Devices" },
  { ticker: "AVGO",  name: "Broadcom" },
  { ticker: "MU",    name: "Micron Technology" },
  { ticker: "MSTR",  name: "MicroStrategy" },
  { ticker: "MARA",  name: "Marathon Digital" },
  { ticker: "RIOT",  name: "Riot Platforms" },
];

let _activistCache = { at: 0, data: null };
const ACTIVIST_TTL = 2 * 60 * 60 * 1000; // 2 hours — these filings are rare, no need to hammer EDGAR

async function fetchActivist() {
  if (_activistCache.data && Date.now() - _activistCache.at < ACTIVIST_TTL) return _activistCache.data;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const startDate = cutoff.toISOString().split("T")[0];
  const results = [];

  for (const { ticker, name } of ACTIVIST_MAP) {
    try {
      const q = encodeURIComponent(`"${name}"`);
      const forms = "SC+13D%2CSC+13G%2CSC+13D%2FA%2CSC+13G%2FA";
      const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=${forms}&dateRange=custom&startdt=${startDate}`;
      const r = await fetch(url, { headers: { "User-Agent": SEC_UA, "Accept": "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json();
      const hits = data.hits?.hits || [];
      for (const hit of hits.slice(0, 4)) {
        const s = hit._source || {};
        const formType = s.form_type || "";
        const isActivist = /13D/.test(formType);
        const isAmendment = formType.includes("/A");
        // The filer is the entity that submitted — pull from display_names or entity_name
        const filer = s.display_names?.[0]?.name || s.entity_name || "Unknown";
        results.push({
          ticker,
          company: name,
          filer,
          formType,
          isActivist,
          isAmendment,
          date: s.file_date || null,
          accession: s.accession_no || null,
        });
      }
    } catch (e) { /* skip — EDGAR hiccup or timeout */ }
    await sleep(200); // respect EDGAR rate limits between company searches
  }

  // Sort: activist (13D) before passive (13G), then by date desc
  results.sort((a, b) => {
    if (a.isActivist !== b.isActivist) return a.isActivist ? -1 : 1;
    return (b.date || "").localeCompare(a.date || "");
  });

  const data = {
    source: "SEC EDGAR SC 13D / SC 13G",
    note: "13D = activist (5%+ with intent to influence). 13G = passive holder (5%+ accumulation). Both require a public filing within 10 days of crossing the threshold.",
    lagNote: "10-day filing window after crossing 5% threshold.",
    count: results.length,
    data: results,
  };

  if (results.length > 0) _activistCache = { at: Date.now(), data };
  return data;
}

// ---- ROUTER ---------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const tickers = (url.searchParams.get("tickers") || "COIN,HOOD,NDAQ")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  try {
    // ---- STATIC / PWA ROUTES (serve the app itself) --------------------------
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const htmlPath = join(__dir, "SignalEngine.html");
      if (existsSync(htmlPath)) {
        const html = readFileSync(htmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        return res.end(html);
      }
    }
    if (url.pathname === "/manifest.json") {
      res.writeHead(200, { "Content-Type": "application/manifest+json", "Cache-Control": "max-age=86400" });
      return res.end(MANIFEST);
    }
    if (url.pathname === "/icon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=604800" });
      return res.end(ICON_SVG);
    }
    if (url.pathname === "/sw.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-cache" });
      return res.end(SW_JS);
    }
    // ---- API ROUTES ----------------------------------------------------------
    if (url.pathname === "/api/health") {
      return send(res, 200, {
        ok: true, time: new Date().toISOString(),
        fmp: !!FMP_KEY, av: !!AV_KEY, td: !!TD_KEY,
        caches: {
          insiders: _insiderCache.size,
          congress: !!_congressCache.data,
          f13: !!_13fCache.data,
          regime: !!_regimeCache.data,
          macro: !!_macroCache.data,
          prices: _pxCache.size,
          activist: !!_activistCache.data,
        },
      });
    }

    if (url.pathname === "/api/insiders") {
      let all = [];
      for (const tk of tickers) {
        const cik = await resolveCik(tk);
        if (!cik) continue;
        try { all.push(...await fetchInsidersForCikCached(tk, cik)); } catch (e) { /* skip */ }
        await sleep(50); // reduced — cache absorbs most calls
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
      if (_congressCache.data && Date.now() - _congressCache.at < CONGRESS_TTL) {
        return send(res, 200, _congressCache.data);
      }
      const [senate, house] = await Promise.all([
        fetchSenateTrades(tickers).catch(() => []),
        fetchHouseTrades(tickers).catch(() => []),
      ]);
      const sorted = [...senate, ...house].sort((a, b) => new Date(b.filed || 0) - new Date(a.filed || 0));
      const payload = {
        source: "Senate Stock Watcher (free) + FMP House" + (FMP_KEY ? "" : " [disabled: no FMP_KEY]"),
        lagNote: "STOCK Act allows up to 45 days from trade to disclosure",
        count: sorted.length, data: sorted.slice(0, 25),
      };
      if (sorted.length > 0) _congressCache = { at: Date.now(), data: payload };
      return send(res, 200, payload);
    }

    if (url.pathname === "/api/activist") {
      return send(res, 200, await fetchActivist());
    }

    if (url.pathname === "/api/prices") {
      const ticker = url.searchParams.get("ticker") || "COIN";
      const days = parseInt(url.searchParams.get("days") || "0", 10) || null;
      const bars = await fetchPricesCached(ticker, days);
      const sourceLabel = TD_KEY ? "Twelve Data" : AV_KEY ? "Alpha Vantage" : "Yahoo Finance / Stooq";
      const cached = _pxCache.get(`${ticker}:${days || 0}`);
      const cacheAge = cached ? Math.round((Date.now() - cached.at) / 1000) : 0;
      return send(res, 200, { source: sourceLabel, ticker: ticker.toUpperCase(), count: bars.length, cacheAgeSecs: cacheAge, data: bars });
    }

    return send(res, 404, { error: "Unknown route", routes: ["/api/insiders", "/api/congress", "/api/13f", "/api/activist", "/api/regime", "/api/macro", "/api/news", "/api/prices", "/api/health"] });
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

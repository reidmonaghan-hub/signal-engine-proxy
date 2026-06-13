import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Crosshair, Compass, Target, Layers, Waves, Radio, Landmark, Building2,
  Eye, Activity, Clock, FileText, Shield, Circle, ArrowUpRight, ArrowDownRight,
  Minus, TrendingUp, TrendingDown, Zap, XCircle, MapPin, ListChecks, RefreshCw,
  Wifi, WifiOff, FlaskConical, AlertTriangle, ShieldCheck, ShieldAlert, Repeat,
  Info, Home, ChevronRight, Gauge, Bell, Globe, DollarSign, Newspaper, BarChart2
} from "lucide-react";

/* ============================================================================
   SIGNAL ENGINE — UNIFIED PLATFORM
   One app: a foolproof Summary that tells you what to do, an Intelligence
   board of disclosed smart-money flows, and a Backtest Lab that keeps the
   whole thing honest. Auto-refreshes; goes fully live against a deployed proxy.

   Monitoring + analysis only. Not an auto-trader. Not financial advice.
   ============================================================================ */

// ---------- DESIGN TOKENS ----------
const C = {
  bg: "#0B0E11", panel: "#12171C", panelHi: "#181F26",
  line: "#222B33", lineHi: "#2E3A44",
  ink: "#E6EDF3", inkDim: "#8B97A3", inkFaint: "#5A6671",
  amber: "#E0A33E", green: "#3FB68B", red: "#E0593F",
  blue: "#4A90D9", violet: "#9B7FD4", gold: "#C9A227",
};
const mono = "'JetBrains Mono', ui-monospace, monospace";
const CONF = { high: { label: "HIGH", c: C.green }, medium: { label: "MEDIUM", c: C.amber }, low: { label: "LOW", c: C.inkFaint } };

// ---------- CONFIG: point at your deployed proxy to go live ----------
const PROXY_URL = "https://signal-engine-proxy.onrender.com"; // live proxy on Render — set "" for snapshot mode
const REFRESH_MS = 120000; // auto-refresh cadence (live mode); 12 names = ~15-25s of EDGAR calls per sync, so be kind

// WATCHLIST — five tiers, each with different data availability:
//   equity   → Form 4 insiders + congress + 13F + price (full intelligence)
//   etf      → 13F (institutions hold ETFs) + price — no insider Form 4s
//   leveraged→ price only — flagged in UI; monitor for momentum extremes only
//              (per HOUSE_RULES: leverage stays OFF — these are in here to read
//              the crowd, not to hold. Never size into a leveraged fund.)
//   macro    → price only — regime reads (gold, bonds, dollar)
//
// Insider sync (EDGAR) is equity-only to respect rate limits.
// Add any listed US ticker: proxy resolves CIK automatically.
const WATCHLIST = [
  // ── TOKENISATION CORE (equities, full data) ────────────────────────────
  { ticker: "COIN", name: "Coinbase",      thesis: "tokenisation", type: "equity" },
  { ticker: "HOOD", name: "Robinhood",     thesis: "tokenisation", type: "equity" },
  { ticker: "NDAQ", name: "Nasdaq",        thesis: "tokenisation", type: "equity" },
  { ticker: "ICE",  name: "ICE",           thesis: "tokenisation", type: "equity" },
  { ticker: "CME",  name: "CME Group",     thesis: "tokenisation", type: "equity" },
  { ticker: "BLK",  name: "BlackRock",     thesis: "tokenisation", type: "equity" },
  { ticker: "BK",   name: "BNY Mellon",    thesis: "tokenisation", type: "equity" },
  { ticker: "CRCL", name: "Circle",        thesis: "tokenisation", type: "equity" },
  { ticker: "CBOE", name: "Cboe Global",   thesis: "tokenisation", type: "equity" },
  { ticker: "MKTX", name: "MarketAxess",   thesis: "tokenisation", type: "equity" },
  // ── PAYMENT RAILS (equities — tokenisation disrupts or transforms these) ─
  { ticker: "V",    name: "Visa",          thesis: "tokenisation", type: "equity" },
  { ticker: "MA",   name: "Mastercard",    thesis: "tokenisation", type: "equity" },
  { ticker: "PYPL", name: "PayPal",        thesis: "tokenisation", type: "equity" },
  // ── AI / ROTATION (equities) ───────────────────────────────────────────
  { ticker: "NVDA", name: "Nvidia",        thesis: "rotation",     type: "equity" },
  { ticker: "AMD",  name: "AMD",           thesis: "rotation",     type: "equity" },
  { ticker: "AVGO", name: "Broadcom",      thesis: "rotation",     type: "equity" },
  { ticker: "MU",   name: "Micron",        thesis: "rotation",     type: "equity" },
  // ── BITCOIN-ADJACENT (equities — heavy insider activity, high beta) ────
  { ticker: "MSTR", name: "MicroStrategy", thesis: "crypto",       type: "equity" },
  { ticker: "MARA", name: "Marathon",      thesis: "crypto",       type: "equity" },
  { ticker: "RIOT", name: "Riot Platforms",thesis: "crypto",       type: "equity" },
  // ── CRYPTO / TOKENISATION ETFs (price + 13F, no insider Form 4s) ──────
  { ticker: "IBIT", name: "BlackRock Bitcoin ETF", thesis: "crypto", type: "etf" },
  { ticker: "FBTC", name: "Fidelity Bitcoin ETF",  thesis: "crypto", type: "etf" },
  { ticker: "BKCH", name: "Blockchain ETF",        thesis: "tokenisation", type: "etf" },
  { ticker: "BLOK", name: "Transformational Data", thesis: "tokenisation", type: "etf" },
  // ── SEMICONDUCTOR / AI ETFs ────────────────────────────────────────────
  { ticker: "SOXX", name: "Semiconductor ETF",     thesis: "rotation", type: "etf" },
  { ticker: "SMH",  name: "Semi ETF (VanEck)",     thesis: "rotation", type: "etf" },
  // ── MACRO HEDGES (price, regime reads) ────────────────────────────────
  { ticker: "GLD",  name: "Gold ETF",              thesis: "macro",    type: "macro" },
  { ticker: "TLT",  name: "Long Bond ETF",         thesis: "macro",    type: "macro" },
  { ticker: "UUP",  name: "Dollar ETF",            thesis: "macro",    type: "macro" },
  // ── LEVERAGED (monitor only — crowd/momentum signal, NOT for holding) ──
  { ticker: "SOXL", name: "3× Semiconductor",      thesis: "rotation", type: "leveraged" },
  { ticker: "BITX", name: "2× Bitcoin Strategy",   thesis: "crypto",   type: "leveraged" },
  { ticker: "NVDL", name: "2× Nvidia",             thesis: "rotation", type: "leveraged" },
];

// Derived sub-lists used by different API calls
const EQUITY_TICKERS  = WATCHLIST.filter((w) => w.type === "equity").map((w) => w.ticker);
const ETF_TICKERS     = WATCHLIST.filter((w) => w.type === "etf" || w.type === "macro").map((w) => w.ticker);
const ALL_TICKERS     = WATCHLIST.map((w) => w.ticker);

// ---------- SEED / SNAPSHOT DATA (June 2026 picture) ----------
const SEED_THESES = [
  { id: "tokenisation", name: "Tokenisation Infrastructure", bias: "long-structural", icon: Layers, confidence: "high", score: 74,
    summary: "DTC cleared to mint blockchain 'digital twins' of US equities/Treasuries (H2 2026). TradFi settlement plumbing going on-chain — a multi-year re-rating, not a trade.",
    triggers: [
      { t: "DTC tokenisation platform goes production-live", status: "watching", weight: "high" },
      { t: "Top-20 asset manager launches tokenised product", status: "fired", weight: "high" },
      { t: "On-chain RWA TVL crosses $100B", status: "watching", weight: "med" },
      { t: "Clarity Act clears Senate Banking markup", status: "watching", weight: "med" },
      { t: "Tokenised-equity names show insider buying", status: "watching", weight: "med" },
    ],
    invalidation: "Regulatory reversal or a high-profile tokenised-asset failure freezing institutional commitment.",
    entry: {
      stance: "Accumulate on weakness — structural, not a chase.",
      conditions: ["≥2 disclosure sources still net-buying", "Price pulls back to a prior support / range low", "No invalidation trigger active"],
      avoid: "Buying a vertical spike on news. Structural theses reward patience, not FOMO.",
      style: "Drip-buy (DCA) in 3–4 tranches over weeks, not one lump.",
    } },
  { id: "rotation", name: "Post-SpaceX Liquidity Rotation", bias: "long-dip", icon: Waves, confidence: "medium", score: 58,
    summary: "$75B SpaceX IPO + OpenAI/Anthropic pipeline drains risk-on capital. Quality megacap tech sold for liquidity (not fundamentals) creates oversold rebound entries.",
    triggers: [
      { t: "SpaceX (SPCX) lists & opens above $135 offer", status: "fired", weight: "high" },
      { t: "Megacap AI names down >5% on no company news", status: "watching", weight: "high" },
      { t: "Crypto ETF outflows >$2B/month sustained", status: "fired", weight: "med" },
      { t: "JPMorgan equity+bond flows turn net-negative", status: "clear", weight: "med" },
      { t: "VIX spike >25 into the listing window", status: "watching", weight: "low" },
    ],
    invalidation: "Broad indices make new highs through the IPO with no rotation — thesis void, stand down.",
    entry: {
      stance: "Opportunistic dip-buy — faster, lower-confidence, smaller size.",
      conditions: ["Quality name down >5% on liquidity, not bad news", "Broad-market rotation visibly underway", "VIX elevated but stabilising"],
      avoid: "Catching a falling knife mid-panic. Wait for a stabilisation bar, not the first red candle.",
      style: "Smaller tranches; this is tactical. Take partial profit into strength.",
    } },
  { id: "xrp", name: "XRP Settlement-Rail Re-Rating", bias: "long-structural", icon: Radio, confidence: "medium", score: 61,
    summary: "DTCC patent names XRP a 'Digital Liquidity Token' for cross-ledger settlement. Commodity classification removed the legal overhang. Structural role ≠ guaranteed price.",
    triggers: [
      { t: "DTCC framework formally integrates XRP", status: "watching", weight: "high" },
      { t: "Spot XRP ETF AUM continues climbing", status: "fired", weight: "med" },
      { t: "New bank/RWA partner announces XRPL issuance", status: "fired", weight: "med" },
      { t: "XRPL daily RWA value steps up materially", status: "watching", weight: "med" },
      { t: "Escrow-release supply absorbed by demand", status: "watching", weight: "high" },
    ],
    invalidation: "DTCC selects a competing rail, or escrow supply keeps outpacing real demand.",
    entry: {
      stance: "Watch-and-wait — structural case strong, but supply overhang is real.",
      conditions: ["Concrete DTCC/bank integration news, not rumour", "Volume growth starts pulling price with it", "ETF AUM still climbing"],
      avoid: "Buying purely on 'settlement rail' narrative while escrow supply floods the market. Volume up + price flat is a warning, not a buy.",
      style: "Small core position; add only on confirmed integration milestones.",
    } },
];

const SEED_CONGRESS = [
  { who: "Sen. (Banking)", party: "R", ticker: "NVDA", action: "BUY", size: "$250–500K", filed: "4d", note: "Committee oversees the AI-infra names in the rotation thesis" },
  { who: "Rep. (Fin. Svcs)", party: "D", ticker: "COIN", action: "BUY", size: "$100–250K", filed: "6d", note: "Tokenisation-exposed; filed before Clarity Act news" },
  { who: "Sen. (Ag.)", party: "R", ticker: "ICE", action: "BUY", size: "$50–100K", filed: "9d", note: "Exchange building 24/7 tokenised rails" },
  { who: "Rep.", party: "R", ticker: "MU", action: "SELL", size: "$100–250K", filed: "8d", note: "Counter-signal: trimming chips into the squeeze" },
];
const SEED_INSIDERS = [
  { co: "Robinhood", ticker: "HOOD", role: "Director", action: "BUY", val: "$1.2M", filed: "2d", cluster: true },
  { co: "Coinbase", ticker: "COIN", role: "10% Owner", action: "BUY", val: "$3.4M", filed: "3d", cluster: true },
  { co: "Nasdaq", ticker: "NDAQ", role: "CFO", action: "BUY", val: "$640K", filed: "5d", cluster: false },
  { co: "Micron", ticker: "MU", role: "EVP", action: "SELL", val: "$2.1M", filed: "1d", cluster: false },
];
const SEED_INSTITUTIONAL = [
  { fund: "BlackRock", move: "Added", ticker: "RWA/tokenisation basket", chg: "+18% QoQ" },
  { fund: "Franklin Templeton", move: "Initiated", ticker: "XRPL money-market units", chg: "new" },
  { fund: "Citadel", move: "Trimmed", ticker: "Megacap AI", chg: "-9% QoQ" },
  { fund: "Guggenheim", move: "Added", ticker: "Tokenised Treasuries (XRPL)", chg: "+" },
];
const SEED_ONCHAIN = [
  { label: "XRP whale accumulation", dir: "up", detail: "Net +ve 3 wks; 1.9M tx/day vs lagging price" },
  { label: "Crypto ETF flows", dir: "down", detail: "$2B+ May outflows — IPO liquidity pull" },
  { label: "RLUSD / RWA liquidity on XRPL", dir: "up", detail: "Deepening; supports tokenised settlement" },
  { label: "Listing-co BTC (SpaceX 8,285 BTC)", dir: "flat", detail: "Watch for post-IPO distribution" },
];
const SEED_EVENTS = [
  { date: "Jun 12", title: "SpaceX (SPCX) begins trading", impact: "high", thesis: "rotation" },
  { date: "Jun mid", title: "Nasdaq-100 inclusion (3x weight)", impact: "high", thesis: "rotation" },
  { date: "H2 2026", title: "DTC tokenisation platform production-ready", impact: "high", thesis: "tokenisation" },
  { date: "Mid-26", title: "Archax +$1B RWA onto XRPL", impact: "med", thesis: "xrp" },
  { date: "Pending", title: "Clarity Act — Senate Banking markup", impact: "high", thesis: "tokenisation" },
];

const ACTION_BRIEF = {
  headline: "Disclosed money leans toward tokenisation infrastructure, not the SpaceX trade.",
  plainRead: "The people forced to publish their trades — committee members, company insiders, BlackRock — are accumulating the firms building tokenised-market plumbing (Coinbase, Robinhood, Nasdaq, ICE). The SpaceX rotation is faster, noisier, lower-confidence. Structural beats tactical here.",
  steps: [
    { n: 1, title: "Set up the watchtower — zero money", where: "Trading 212 / IBKR demo · exchange demo", how: "Open free paper accounts. Add COIN, HOOD, NDAQ, ICE, XRP. Observation posts, not positions.", why: "You're researching. Learn the terrain with nothing at risk." },
    { n: 2, title: "Verify the top signal yourself", where: "SEC EDGAR · Capitol Trades (free)", how: "Confirm the insider/congress buys are real and recent. Hunt CLUSTER buys — 3+ insiders, same window.", why: "Never trade a summary, including this one. Primary sources only." },
    { n: 3, title: "Paper-trade 4–6 weeks", where: "Your demo accounts", how: "When a trigger fires, take it in paper. Log entry, size, reason, invalidation. Track discipline, not just profit.", why: "Good signal ≠ good execution. Prove the second before risking the first." },
    { n: 4, title: "Only if paper works: live, small, no leverage", where: "FCA-regulated UK broker / exchange", how: "Size you'd shrug off losing. Drip-buy structural theses. Set invalidation as a hard exit before entry.", why: "Leverage on an unproven system is the fastest way to lose money that matters." },
  ],
  guardrails: [
    "Disclosure data is lagged — it confirms a regime, it does not time an entry.",
    "Every position needs its invalidation line written down before you enter.",
    "If you can't explain the trade in one sentence, you don't understand it.",
    "Position size is the only risk control you fully command. Use it.",
  ],
};

// ---------- LIVE DATA ----------
function daysAgo(d) { const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return isNaN(diff) ? "—" : `${diff}d`; }

async function fetchLiveInsiders() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const tickers = EQUITY_TICKERS.join(","); // equities only — ETFs have no Form 4 insiders
  const r = await fetch(`${PROXY_URL}/api/insiders?tickers=${tickers}`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  if (!j.data?.length) throw new Error("empty");
  return j.data;
}

async function fetchLive13F() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const tickers = ALL_TICKERS.join(","); // institutions hold ETFs too
  const r = await fetch(`${PROXY_URL}/api/13f?tickers=${tickers}`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  if (!j.data?.length) throw new Error("empty");
  return j.data;
}

async function fetchRegime() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const r = await fetch(`${PROXY_URL}/api/regime`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  if (!j.lights?.length) throw new Error("empty");
  return j;
}

async function fetchMacro() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const r = await fetch(`${PROXY_URL}/api/macro`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  return r.json();
}

async function fetchNews() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const r = await fetch(`${PROXY_URL}/api/news`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  return r.json();
}

// ---------- BACKTEST CORE ----------
function btStats(trades) {
  const n = trades.length;
  if (n === 0) return { n: 0, trust: "none" };
  const wins = trades.filter((t) => t.win);
  const hitRate = wins.length / n;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netRet, 0) / wins.length : 0;
  const losses = trades.filter((t) => !t.win);
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.netRet, 0) / losses.length : 0;
  const expectancy = hitRate * avgWin + (1 - hitRate) * avgLoss;
  let eq = 1, peak = 1, maxDD = 0;
  for (const t of trades) { eq *= 1 + t.netRet; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, (eq - peak) / peak); }
  let trust = n < 20 ? "untrustworthy" : n < 50 ? "weak" : n < 100 ? "moderate" : "reasonable";
  return { n, hitRate, falsePos: 1 - hitRate, expectancy, maxDD, trust };
}
function runBacktest(bars, fire, events, opts) {
  const { holdDays = 20, target = 0.08, stop = 0.05, costBps = 10, splitRatio = 0.7 } = opts;
  const splitIdx = Math.floor(bars.length * splitRatio);
  const trades = [];
  for (let i = 20; i < bars.length - 1; i++) {
    if (!fire(bars, i, events)) continue;
    const entry = bars[i].close * (1 + costBps / 10000);
    let exit = null, exitDay = i;
    for (let j = i + 1; j <= Math.min(i + holdDays, bars.length - 1); j++) {
      const ret = (bars[j].close - entry) / entry;
      if (ret >= target) { exit = bars[j].close; exitDay = j; break; }
      if (ret <= -stop) { exit = bars[j].close; exitDay = j; break; }
    }
    if (exit === null) exit = bars[Math.min(i + holdDays, bars.length - 1)].close;
    const netRet = (exit - entry) / entry - costBps / 10000;
    trades.push({ netRet, win: netRet > 0, sample: i < splitIdx ? "in" : "out" });
  }
  return {
    all: btStats(trades), inSample: btStats(trades.filter((t) => t.sample === "in")),
    outSample: btStats(trades.filter((t) => t.sample === "out")),
    equity: trades.reduce((acc, t) => { acc.push((acc.length ? acc[acc.length - 1] : 1) * (1 + t.netRet)); return acc; }, []),
  };
}
function makeSeries(seed, hasEdge) {
  let s = seed; const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const bars = [], events = []; let price = 100; const start = new Date("2024-06-01").getTime();
  for (let d = 0; d < 500; d++) {
    const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
    price *= 1 + (rand() - 0.5) * 0.022;
    if (d % 35 === 0 && d > 20) { events.push({ date, type: "cluster_buy" }); if (hasEdge) for (let k = 1; k <= 14 && d + k < 500; k++) price *= 1.0045; }
    bars.push({ date, close: price });
  }
  return { bars, events };
}
const SIGNAL_FIRE = {
  insiderCluster: (bars, i, events) => events.some((e) => e.date === bars[i].date && e.type === "cluster_buy"),
  smaCross: (bars, i) => { if (i < 20) return false; const sma = bars.slice(i - 20, i).reduce((s, b) => s + b.close, 0) / 20; const prev = bars.slice(i - 21, i - 1).reduce((s, b) => s + b.close, 0) / 20; return bars[i - 1].close <= prev && bars[i].close > sma; },
};
const TRUST_META = {
  untrustworthy: { c: C.red, icon: ShieldAlert, label: "UNTRUSTWORTHY", note: "Too few trades. An anecdote, not evidence. Do not act on it." },
  weak: { c: C.amber, icon: ShieldAlert, label: "WEAK", note: "Suggestive at best. Needs far more data before it earns money." },
  moderate: { c: C.blue, icon: ShieldCheck, label: "MODERATE", note: "Worth attention. Not a guarantee of future behaviour." },
  reasonable: { c: C.green, icon: ShieldCheck, label: "REASONABLE", note: "Decent sample. The future can still diverge." },
  none: { c: C.inkFaint, icon: Info, label: "NO DATA", note: "Signal never fired in this window." },
};

// ---------- UI PRIMITIVES ----------
function StatusDot({ status }) {
  const m = { fired: { c: C.green, l: "FIRED" }, watching: { c: C.amber, l: "WATCHING" }, clear: { c: C.inkFaint, l: "CLEAR" } }[status] || { c: C.inkFaint, l: "CLEAR" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Circle size={8} fill={m.c} color={m.c} /><span style={{ color: m.c, fontSize: 10, letterSpacing: 1, fontWeight: 600 }}>{m.l}</span></span>;
}
function ScoreBar({ score }) {
  const c = score >= 70 ? C.green : score >= 50 ? C.amber : C.inkFaint;
  return <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ flex: 1, height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${score}%`, height: "100%", background: c, transition: "width .6s" }} /></div><span style={{ fontSize: 12, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums", minWidth: 26 }}>{score}</span></div>;
}
function Panel({ title, icon: Icon, accent, children, right }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${C.line}`, background: C.panelHi }}>
        <span style={{ width: 26, height: 26, borderRadius: 5, display: "grid", placeItems: "center", background: `${accent}1A`, border: `1px solid ${accent}33` }}><Icon size={14} color={accent} /></span>
        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: C.ink, textTransform: "uppercase", fontFamily: mono }}>{title}</h2>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </header>
      <div style={{ padding: 16, flex: 1 }}>{children}</div>
    </section>
  );
}

// ============================================================================
export default function SignalEnginePlatform() {
  const [tab, setTab] = useState("summary");
  const [clock, setClock] = useState(new Date());
  const [activeThesis, setActiveThesis] = useState("tokenisation");

  // live data
  const [liveStatus, setLiveStatus] = useState("idle"); // idle|loading|live|blocked
  const [liveInsiders, setLiveInsiders] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const [live13f, setLive13f] = useState(null);
  const [regime, setRegime] = useState(null);
  const [macroData, setMacroData] = useState(null);
  const [newsData, setNewsData] = useState(null);

  // ---- DISTRIBUTION DIVERGENCE (honest stand-in for "manipulation detection") ----
  // Insiders selling hard while the price climbs is the classic distribution
  // pattern. We have both halves of that data, so we flag it — as a warning to
  // INVESTIGATE on EDGAR, never as a sell signal.
  const [divergences, setDivergences] = useState([]);
  const priceCache = useRef({});
  useEffect(() => {
    if (liveStatus !== "live" || !liveInsiders || !PROXY_URL) return;
    let cancelled = false;
    (async () => {
      const byTicker = {};
      for (const e of liveInsiders) (byTicker[e.ticker] ||= []).push(e);
      const out = [];
      for (const [tk, evs] of Object.entries(byTicker)) {
        const sells = evs.filter((e) => e.direction === "SELL");
        const buys = evs.filter((e) => e.direction === "BUY");
        if (sells.length < 2 || buys.length > 0) continue; // heavy one-way selling only
        try {
          if (!priceCache.current[tk]) {
            const r = await fetch(`${PROXY_URL}/api/prices?ticker=${tk}&days=70`);
            priceCache.current[tk] = (await r.json()).data || [];
          }
          const bars = priceCache.current[tk];
          if (bars.length < 40) continue;
          const chg = (bars[bars.length - 1].close - bars[0].close) / bars[0].close;
          if (chg > 0.10) out.push({ ticker: tk, sells: sells.length, sellVal: sells.reduce((s, e) => s + (e.value || 0), 0), chg: Math.round(chg * 100) });
        } catch (e) { /* skip ticker */ }
      }
      if (!cancelled) setDivergences(out);
    })();
    return () => { cancelled = true; };
  }, [liveInsiders, liveStatus]);

  const sync = useCallback(async () => {
    setLiveStatus("loading");
    try {
      const data = await fetchLiveInsiders();
      setLiveInsiders(data); setLiveStatus("live"); setLastSync(new Date());
    } catch (e) { setLiveStatus("blocked"); }
    // 13F + regime are cached server-side; fetched independently so a
    // failure in either never takes down the insider stream.
    try { setLive13f(await fetchLive13F()); } catch (e) { /* keep seed panel */ }
    try { setRegime(await fetchRegime()); } catch (e) { /* panel stays hidden */ }
    try { setMacroData(await fetchMacro()); } catch (e) { /* macro panel hidden */ }
    try { setNewsData(await fetchNews()); } catch (e) { /* news feed hidden */ }
  }, []);

  useEffect(() => { const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id); }, []);
  // auto-refresh in live mode
  useEffect(() => {
    if (!PROXY_URL) return;
    sync();
    const id = setInterval(sync, REFRESH_MS);
    return () => clearInterval(id);
  }, [sync]);

  // ---- CLUSTER-BUY ALERTING (roadmap #2) ----
  // Detection lives in the proxy (3+ insider buys, same name). This surfaces it:
  // an un-missable banner + optional desktop notifications. It is an ALERT to go
  // verify on EDGAR — lagged disclosure confirms a regime, it does not time entries.
  const [notifyPerm, setNotifyPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const seenClusters = useRef(new Set());
  const clusterAlerts = useMemo(() => {
    if (liveStatus !== "live" || !liveInsiders) return [];
    const byTicker = {};
    for (const e of liveInsiders) if (e.cluster && e.direction === "BUY") (byTicker[e.ticker] ||= []).push(e);
    return Object.entries(byTicker).map(([ticker, evs]) => ({
      ticker, count: evs.length,
      latest: evs.map((e) => e.filed).sort().slice(-1)[0],
      totalVal: evs.reduce((s, e) => s + (e.value || 0), 0),
      doc: evs.find((e) => e.doc)?.doc,
    })).sort((a, b) => new Date(b.latest) - new Date(a.latest));
  }, [liveInsiders, liveStatus]);
  useEffect(() => {
    for (const a of clusterAlerts) {
      const key = `${a.ticker}|${a.latest}`;
      if (seenClusters.current.has(key)) continue;
      seenClusters.current.add(key);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`CLUSTER BUY — ${a.ticker}`, {
          body: `${a.count} insiders bought ${a.ticker} (latest filing ${daysAgo(a.latest)} ago). Lagged disclosure — regime confirmation, not a timing trigger. Verify on EDGAR. Not financial advice.`,
        });
      }
    }
  }, [clusterAlerts]);
  const askNotify = () => { if (typeof Notification !== "undefined") Notification.requestPermission().then(setNotifyPerm); };

  const composite = useMemo(() => Math.round(SEED_THESES.reduce((s, t) => s + t.score, 0) / SEED_THESES.length), []);
  const confluence = useMemo(() => {
    const buys = SEED_CONGRESS.filter((c) => c.action === "BUY").length + SEED_INSIDERS.filter((i) => i.action === "BUY").length + SEED_INSTITUTIONAL.filter((i) => /Added|Initiated/.test(i.move)).length;
    const sells = SEED_CONGRESS.filter((c) => c.action === "SELL").length + SEED_INSIDERS.filter((i) => i.action === "SELL").length + SEED_INSTITUTIONAL.filter((i) => i.move === "Trimmed").length;
    return { buys, sells };
  }, []);
  const thesis = SEED_THESES.find((t) => t.id === activeThesis);

  const TABS = [
    { id: "summary", label: "Summary", icon: Home },
    { id: "intel", label: "Intelligence", icon: Eye },
    { id: "macro", label: "Macro", icon: Globe },
    { id: "backtest", label: "Backtest Lab", icon: FlaskConical },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 60 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-thumb { background: ${C.lineHi}; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .live-dot { animation: pulse 2s infinite; }
        @media (prefers-reduced-motion: reduce){ .live-dot{animation:none} }
        @media (max-width:760px){ .grid2{grid-template-columns:1fr!important} .grid3{grid-template-columns:1fr!important} }
      `}</style>

      {/* TOP BAR */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#0B0E11ee", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ padding: "13px 20px", display: "flex", alignItems: "center", gap: 14, maxWidth: 1200, margin: "0 auto" }}>
          <Crosshair size={21} color={C.amber} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2.5, fontFamily: mono }}>SIGNAL<span style={{ color: C.amber }}>·</span>ENGINE</div>
            <div style={{ fontSize: 8.5, color: C.inkFaint, letterSpacing: 1.5 }}>DISCLOSED SMART-MONEY INTELLIGENCE</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8.5, color: C.inkFaint, letterSpacing: 1.5 }}>READINESS</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: composite >= 70 ? C.green : C.amber, fontFamily: mono }}>{composite}<span style={{ fontSize: 10, color: C.inkFaint }}>/100</span></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: `1px solid ${C.line}`, borderRadius: 6 }}>
              {liveStatus === "live" ? <Wifi size={12} color={C.green} /> : <WifiOff size={12} color={C.inkFaint} />}
              <span style={{ fontSize: 9, color: liveStatus === "live" ? C.green : C.inkFaint, fontFamily: mono, letterSpacing: 1 }}>{liveStatus === "live" ? "LIVE" : "SNAPSHOT"}</span>
            </div>
          </div>
        </div>
        {/* TABS */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px", maxWidth: 1200, margin: "0 auto" }}>
          {TABS.map((t) => {
            const Icon = t.icon; const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", cursor: "pointer",
                background: "transparent", border: "none", borderBottom: `2px solid ${on ? C.amber : "transparent"}`,
                color: on ? C.ink : C.inkFaint, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
              }}><Icon size={14} />{t.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 20px" }}>
        {/* CLUSTER-BUY ALERTS — visible on every tab. An alert to verify, never a trigger. */}
        {clusterAlerts.length > 0 && (
          <div style={{ marginBottom: 16, border: `1px solid ${C.amber}66`, background: `${C.amber}10`, borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Bell size={14} color={C.amber} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.amber, fontFamily: mono }}>CLUSTER BUY ALERT — {clusterAlerts.length} WATCHLIST NAME{clusterAlerts.length > 1 ? "S" : ""}</span>
              {notifyPerm === "default" && (
                <button onClick={askNotify} style={{ marginLeft: "auto", cursor: "pointer", background: "transparent", border: `1px solid ${C.amber}66`, color: C.amber, borderRadius: 5, padding: "3px 10px", fontSize: 10, fontFamily: "inherit", fontWeight: 600 }}>Enable desktop notifications</button>
              )}
              {notifyPerm === "granted" && <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: mono }}>NOTIFICATIONS ON</span>}
            </div>
            {clusterAlerts.map((a) => (
              <div key={a.ticker} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: C.ink }}>{a.ticker}</span>
                <span style={{ fontSize: 11, color: C.ink }}>{a.count} insiders bought · latest filing {daysAgo(a.latest)} ago{a.totalVal ? ` · ~$${a.totalVal >= 1e6 ? (a.totalVal / 1e6).toFixed(1) + "M" : Math.round(a.totalVal / 1000) + "K"} total` : ""}</span>
                {a.doc && <a href={a.doc} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: mono }}>VERIFY ON EDGAR ↗</a>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 8 }}>
              Cluster buys are the strongest insider tell — but this is <strong style={{ color: C.amber }}>lagged disclosure</strong>: it confirms a regime, it does not time an entry. Verify on EDGAR, then use the Entry Zone + Position Sizer. Not financial advice.
            </div>
          </div>
        )}

        {/* DISTRIBUTION DIVERGENCE — a warning to investigate, never a sell signal */}
        {divergences.length > 0 && (
          <div style={{ marginBottom: 16, border: `1px solid ${C.red}66`, background: `${C.red}10`, borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={14} color={C.red} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.red, fontFamily: mono }}>DISTRIBUTION WARNING — INSIDERS SELLING INTO STRENGTH</span>
            </div>
            {divergences.map((d) => (
              <div key={d.ticker} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: mono, color: C.ink }}>{d.ticker}</span>
                <span style={{ fontSize: 11, color: C.ink }}>{d.sells} insider sells, zero buys{d.sellVal ? ` (~$${d.sellVal >= 1e6 ? (d.sellVal / 1e6).toFixed(1) + "M" : Math.round(d.sellVal / 1000) + "K"})` : ""} while price is +{d.chg}% over ~3 months</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 8 }}>
              The classic <strong style={{ color: C.red }}>distribution pattern</strong> — smart money handing inventory to momentum buyers. It is a prompt to investigate (verify each Form 4 on EDGAR; option-grant sales are routine noise), <strong style={{ color: C.red }}>not a sell signal</strong>. Not financial advice.
            </div>
          </div>
        )}

        {/* ========================= SUMMARY ========================= */}
        {tab === "summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* REGIME WARNING LIGHTS — market-wide stress, free primary sources */}
            {regime && (
              <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Gauge size={14} color={C.blue} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.blue, fontFamily: mono }}>MARKET REGIME — WARNING LIGHTS</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: mono }}>FRED + STOOQ · HOURLY</span>
                </div>
                <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {regime.lights.map((l) => {
                    const col = l.status === "STRESS" ? C.red : l.status === "WATCH" ? C.amber : l.status === "CALM" ? C.green : C.inkFaint;
                    return (
                      <div key={l.id} style={{ border: `1px solid ${col}44`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: col }} className={l.status !== "CALM" && l.status !== "N/A" ? "live-dot" : undefined} />
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.inkDim }}>{l.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 4px" }}>
                          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: mono, color: C.ink }}>{l.value}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: col, fontFamily: mono }}>{l.status}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.inkFaint, lineHeight: 1.45 }}>{l.detail} {l.source && <a href={l.source} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>src↗</a>}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: C.inkFaint }}>
                  These confirm the regime you're already in — <strong style={{ color: C.blue }}>they predict nothing</strong>. Use them to size risk appetite, not to time anything. Not financial advice.
                </div>
              </section>
            )}
            {/* THE ONE-GLANCE VERDICT */}
            <section style={{ background: `linear-gradient(135deg, ${C.panelHi}, ${C.panel})`, border: `1px solid ${C.green}45`, borderRadius: 10, padding: "22px 22px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <Compass size={17} color={C.green} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: C.green, fontFamily: mono }}>WHAT THE MONEY IS SAYING RIGHT NOW</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35, marginBottom: 12 }}>{ACTION_BRIEF.headline}</div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: C.inkDim }}>{ACTION_BRIEF.plainRead}</p>
              <div style={{ display: "flex", gap: 20, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                <div><div style={{ fontSize: 26, fontWeight: 700, color: C.green, fontFamily: mono }}>{confluence.buys}</div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.4 }}>BUY SIGNALS</div></div>
                <div style={{ width: 1, background: C.line }} />
                <div><div style={{ fontSize: 26, fontWeight: 700, color: C.red, fontFamily: mono }}>{confluence.sells}</div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.4 }}>SELL SIGNALS</div></div>
                <div style={{ width: 1, background: C.line }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.5 }}>Net read: smart money is <strong style={{ color: C.green }}>accumulating tokenisation infrastructure</strong>. Highest-confidence play is structural, not the SpaceX trade.</div></div>
              </div>
            </section>

            {/* DO THIS NOW — 4 steps */}
            <Panel title="Do This Now" icon={ListChecks} accent={C.amber} right={<span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>FOOLPROOF SEQUENCE</span>}>
              <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {ACTION_BRIEF.steps.map((s) => (
                  <div key={s.n} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: 14, background: "#ffffff03", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ width: 23, height: 23, borderRadius: "50%", flexShrink: 0, background: `${C.amber}18`, border: `1px solid ${C.amber}55`, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 12, fontWeight: 700, color: C.amber }}>{s.n}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{s.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}><MapPin size={12} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} /><span style={{ fontSize: 11, color: C.amber, fontWeight: 600, lineHeight: 1.4 }}>{s.where}</span></div>
                    <div style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.5, marginBottom: 7 }}>{s.how}</div>
                    <div style={{ fontSize: 11, color: C.inkFaint, lineHeight: 1.45, marginTop: "auto", paddingTop: 7, borderTop: `1px solid ${C.line}`, fontStyle: "italic" }}>{s.why}</div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* GUARDRAILS */}
            <div style={{ background: `${C.red}0A`, border: `1px solid ${C.red}28`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><Shield size={14} color={C.red} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.red }}>NON-NEGOTIABLE GUARDRAILS</span></div>
              <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 18px" }}>
                {ACTION_BRIEF.guardrails.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><Circle size={5} fill={C.red} color={C.red} style={{ marginTop: 6, flexShrink: 0 }} /><span style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.45 }}>{g}</span></div>
                ))}
              </div>
            </div>

            {/* JUMP-OFFS */}
            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button onClick={() => setTab("intel")} style={{ cursor: "pointer", textAlign: "left", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16, color: "inherit", font: "inherit", display: "flex", alignItems: "center", gap: 12 }}>
                <Eye size={18} color={C.blue} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>See the evidence</div><div style={{ fontSize: 11, color: C.inkFaint }}>Every disclosed flow behind the verdict</div></div><ChevronRight size={16} color={C.inkFaint} />
              </button>
              <button onClick={() => setTab("backtest")} style={{ cursor: "pointer", textAlign: "left", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16, color: "inherit", font: "inherit", display: "flex", alignItems: "center", gap: 12 }}>
                <FlaskConical size={18} color={C.violet} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>Pressure-test a signal</div><div style={{ fontSize: 11, color: C.inkFaint }}>Would it have worked? Honest stats.</div></div><ChevronRight size={16} color={C.inkFaint} />
              </button>
            </div>
          </div>
        )}

        {/* ========================= INTELLIGENCE ========================= */}
        {tab === "intel" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* WATCHLIST OVERVIEW — 32 names, type-coded */}
            <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <ListChecks size={13} color={C.inkFaint} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.inkDim, fontFamily: mono }}>WATCHLIST — {WATCHLIST.length} NAMES</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 9, color: C.inkFaint }}>
                  {[["equity","EQUITY",C.green],["etf","ETF",C.blue],["macro","MACRO",C.violet],["leveraged","LEVGD ⚠",C.red]].map(([t,l,c])=>(
                    <span key={t} style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{width:6,height:6,borderRadius:3,background:c,display:"inline-block"}}/>{ l}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {WATCHLIST.map((w) => {
                  const col = w.type === "equity" ? C.green : w.type === "etf" ? C.blue : w.type === "macro" ? C.violet : C.red;
                  return (
                    <div key={w.ticker} title={`${w.name} · ${w.type} · ${w.thesis}`} style={{ border: `1px solid ${col}44`, background: `${col}10`, borderRadius: 5, padding: "3px 9px", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: mono, color: C.ink }}>{w.ticker}</span>
                      {w.type === "leveraged" && <span style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>⚠</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: C.inkFaint }}>
                <span style={{ color: C.green }}>Equity</span>: full intelligence (Form 4, congress, 13F, price). <span style={{ color: C.blue }}>ETF</span>: 13F + price. <span style={{ color: C.violet }}>Macro</span>: price / regime. <span style={{ color: C.red }}>Leveraged ⚠</span>: price only — crowd/momentum reads, <strong style={{ color: C.red }}>not for holding</strong>.
              </div>
            </section>
            <Panel title="Live Theses" icon={Target} accent={C.amber} right={<span style={{ fontSize: 10, color: C.inkFaint, fontFamily: mono }}>{SEED_THESES.length} ACTIVE</span>}>
              <div className="grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {SEED_THESES.map((t) => {
                  const Icon = t.icon; const on = t.id === activeThesis;
                  return (
                    <button key={t.id} onClick={() => setActiveThesis(t.id)} style={{ textAlign: "left", cursor: "pointer", padding: 14, borderRadius: 7, background: on ? C.panelHi : "transparent", border: `1px solid ${on ? CONF[t.confidence].c + "66" : C.line}`, color: "inherit", font: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}><Icon size={16} color={CONF[t.confidence].c} /><span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: CONF[t.confidence].c }}>{CONF[t.confidence].label}</span></div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.3 }}>{t.name}</div>
                      <ScoreBar score={t.score} />
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title={`Breakdown · ${thesis.name}`} icon={thesis.icon} accent={CONF[thesis.confidence].c} right={<div style={{ width: 140 }}><ScoreBar score={thesis.score} /></div>}>
              <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.6, color: C.inkDim }}>{thesis.summary}</p>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: C.inkFaint, marginBottom: 10, fontFamily: mono }}>TRIGGER MATRIX</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 16 }}>
                {thesis.triggers.map((tr, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", background: i % 2 ? "transparent" : "#ffffff04", borderRadius: 4 }}>
                    <StatusDot status={tr.status} /><span style={{ fontSize: 12.5, color: C.ink, flex: 1 }}>{tr.t}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.inkFaint, border: `1px solid ${C.line}`, padding: "2px 7px", borderRadius: 3 }}>{tr.weight.toUpperCase()} WT</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "12px 14px", background: `${C.red}0C`, border: `1px solid ${C.red}2E`, borderRadius: 6 }}>
                <XCircle size={15} color={C.red} style={{ marginTop: 1, flexShrink: 0 }} />
                <div><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: C.red, marginBottom: 3 }}>INVALIDATION — STAND DOWN IF:</div><div style={{ fontSize: 12.5, color: C.inkDim, lineHeight: 1.5 }}>{thesis.invalidation}</div></div>
              </div>

              {/* ENTRY ZONE — decision support, NOT a price trigger */}
              <div style={{ marginTop: 14, padding: "14px 16px", background: `${C.green}0A`, border: `1px solid ${C.green}30`, borderRadius: 7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Gauge size={15} color={C.green} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.green }}>ENTRY ZONE — WHEN IT'S REASONABLE TO ACT</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 10 }}>{thesis.entry.stance}</div>
                <div style={{ fontSize: 10, letterSpacing: 1.2, color: C.inkFaint, marginBottom: 6 }}>ALL SHOULD BE TRUE BEFORE CONSIDERING ENTRY:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
                  {thesis.entry.conditions.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <Circle size={5} fill={C.green} color={C.green} style={{ marginTop: 6, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: C.inkDim, lineHeight: 1.45 }}>{c}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="grid2">
                  <div style={{ padding: "9px 11px", background: `${C.red}0C`, borderRadius: 5, border: `1px solid ${C.red}25` }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: C.red, marginBottom: 3 }}>AVOID</div>
                    <div style={{ fontSize: 11.5, color: C.inkDim, lineHeight: 1.45 }}>{thesis.entry.avoid}</div>
                  </div>
                  <div style={{ padding: "9px 11px", background: `${C.blue}0C`, borderRadius: 5, border: `1px solid ${C.blue}25` }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: C.blue, marginBottom: 3 }}>HOW TO SIZE IN</div>
                    <div style={{ fontSize: 11.5, color: C.inkDim, lineHeight: 1.45 }}>{thesis.entry.style}</div>
                  </div>
                </div>
              </div>

              {/* POSITION SIZE CALCULATOR */}
              <PositionSizer />
            </Panel>

            <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* CONGRESS */}
              <Panel title="Congressional" icon={Landmark} accent={C.gold} right={<span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>STOCK ACT · ~30d LAG</span>}>
                {SEED_CONGRESS.map((c, i) => (
                  <div key={i} style={{ padding: "10px 2px", borderBottom: i < SEED_CONGRESS.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: c.party === "R" ? C.red : C.blue, border: `1px solid ${(c.party === "R" ? C.red : C.blue)}44`, borderRadius: 3, padding: "1px 5px" }}>{c.party}</span>
                      <span style={{ fontSize: 11.5, color: C.inkDim, flex: 1 }}>{c.who}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.action === "BUY" ? C.green : C.red, display: "flex", alignItems: "center", gap: 2 }}>{c.action === "BUY" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{c.action}</span>
                      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, minWidth: 46, textAlign: "right" }}>{c.ticker}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.inkFaint }}>{c.size} · filed {c.filed} ago</div>
                    <div style={{ fontSize: 11, color: C.inkDim, marginTop: 3, fontStyle: "italic", lineHeight: 1.4 }}>{c.note}</div>
                  </div>
                ))}
              </Panel>

              {/* INSIDERS — live capable */}
              <Panel title="Corporate Insiders" icon={Building2} accent={C.blue} right={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: liveStatus === "live" ? C.green : C.inkFaint, fontFamily: mono }}>{liveStatus === "live" ? "LIVE" : liveStatus === "blocked" ? "SNAPSHOT" : "FORM 4"}</span>
                  <button onClick={sync} disabled={liveStatus === "loading"} style={{ display: "flex", alignItems: "center", gap: 5, cursor: liveStatus === "loading" ? "wait" : "pointer", background: `${C.blue}14`, border: `1px solid ${C.blue}40`, color: C.blue, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, padding: "4px 9px", borderRadius: 4, fontFamily: mono }}>
                    <RefreshCw size={11} style={liveStatus === "loading" ? { animation: "spin 1s linear infinite" } : {}} />{liveStatus === "loading" ? "SYNC" : "SYNC"}
                  </button>
                </div>
              }>
                {(liveStatus === "live" && liveInsiders ? liveInsiders.map((d) => ({ ticker: d.ticker, co: d.ticker, role: d.role || "Insider", action: d.direction, val: d.value ? `$${(d.value / 1000).toFixed(0)}K` : "", filed: daysAgo(d.filed), cluster: d.cluster, doc: d.doc })) : SEED_INSIDERS).map((s, i, arr) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{s.ticker}</span>
                        {s.co && s.co !== s.ticker && <span style={{ fontSize: 11, color: C.inkDim }}>{s.co}</span>}
                        {s.cluster && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: C.amber, background: `${C.amber}18`, border: `1px solid ${C.amber}44`, padding: "1px 6px", borderRadius: 3 }}>CLUSTER</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 3 }}>{s.role} · filed {s.filed} ago</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {s.action && s.action !== "UNKNOWN" && <div style={{ fontSize: 11, fontWeight: 700, color: s.action === "BUY" ? C.green : C.red, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>{s.action === "BUY" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{s.action}</div>}
                      {s.val && <div style={{ fontFamily: mono, fontSize: 11, color: C.inkDim }}>{s.val}</div>}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 9, fontSize: 10.5, color: C.inkFaint, lineHeight: 1.5 }}>
                  {liveStatus === "blocked" ? <><strong style={{ color: C.amber }}>Snapshot.</strong> Deploy the proxy and set PROXY_URL for live Form 4.</> : <><strong style={{ color: C.amber }}>Cluster buys</strong> are the strongest insider tell.</>}
                </div>
              </Panel>

              {/* INSTITUTIONAL — live 13F when the proxy delivers, seed otherwise */}
              <Panel title="Institutional Flows" icon={Eye} accent={C.violet} right={<span style={{ fontSize: 9, color: live13f ? C.green : C.inkFaint, fontFamily: mono }}>{live13f ? "LIVE 13F · ~45d LAG" : "13F · ~45d LAG"}</span>}>
                {(live13f || SEED_INSTITUTIONAL).map((f, i, arr) => {
                  const pos = /Added|Initiated/.test(f.move);
                  const flat = /Held/.test(f.move);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 120 }}>{f.fund}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: flat ? C.inkFaint : pos ? C.green : C.red, minWidth: 58 }}>{f.move.toUpperCase()}</span>
                      <span style={{ fontSize: 11, color: C.inkDim, flex: 1 }}>{f.ticker}{f.filed ? <span style={{ color: C.inkFaint }}> · filed {daysAgo(f.filed)} ago</span> : null}</span>
                      <span style={{ fontFamily: mono, fontSize: 11, color: flat ? C.inkFaint : pos ? C.green : C.red }}>{f.chg}</span>
                      {f.doc && <a href={f.doc} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: C.blue, textDecoration: "none", fontFamily: mono }}>SRC ↗</a>}
                    </div>
                  );
                })}
                {live13f && <div style={{ marginTop: 9, fontSize: 10.5, color: C.inkFaint, lineHeight: 1.5 }}>Quarterly long positions only — the laggiest stream here. <strong style={{ color: C.violet }}>Regime confirmation, never timing.</strong></div>}
              </Panel>

              {/* ON-CHAIN */}
              <Panel title="On-Chain Whales" icon={Activity} accent={C.green} right={<span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>NEAR REAL-TIME</span>}>
                {SEED_ONCHAIN.map((o, i) => {
                  const Icon = o.dir === "up" ? TrendingUp : o.dir === "down" ? TrendingDown : Minus;
                  const c = o.dir === "up" ? C.green : o.dir === "down" ? C.red : C.inkFaint;
                  return (
                    <div key={i} style={{ display: "flex", gap: 11, padding: "11px 2px", alignItems: "flex-start", borderBottom: i < SEED_ONCHAIN.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <Icon size={15} color={c} style={{ marginTop: 1, flexShrink: 0 }} />
                      <div><div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{o.label}</div><div style={{ fontSize: 11, color: C.inkFaint, marginTop: 3, lineHeight: 1.4 }}>{o.detail}</div></div>
                    </div>
                  );
                })}
              </Panel>
            </div>

            {/* EVENT HORIZON */}
            <Panel title="Event Horizon" icon={Clock} accent={C.amber} right={<span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>TRIGGER CALENDAR</span>}>
              {SEED_EVENTS.map((e, i) => {
                const tc = e.thesis === "rotation" ? C.blue : e.thesis === "tokenisation" ? C.violet : C.green;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "11px 2px", alignItems: "center", borderBottom: i < SEED_EVENTS.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.amber, minWidth: 60 }}>{e.date}</span>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: tc, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1, lineHeight: 1.35 }}>{e.title}</span>
                    {e.impact === "high" && <Zap size={13} color={C.amber} fill={`${C.amber}55`} />}
                  </div>
                );
              })}
            </Panel>
          </div>
        )}

        {/* ========================= BACKTEST ========================= */}
        {tab === "macro" && <MacroView macroData={macroData} newsData={newsData} liveStatus={liveStatus} />}
        {tab === "backtest" && <BacktestView />}

      </div>

      <div style={{ textAlign: "center", padding: "0 24px", color: C.inkFaint, fontSize: 11, lineHeight: 1.6, maxWidth: 760, margin: "0 auto" }}>
        Signal Engine is a monitoring and analysis tool — not an automated trader, and not financial advice. Disclosed-trade data is inherently lagged. Verify every figure against primary sources before acting. You make every decision.
      </div>
    </div>
  );
}

// ---------- POSITION SIZER (risk-first, the honest 'how much') ----------
function PositionSizer() {
  const [account, setAccount] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(92);

  const riskAmount = account * (riskPct / 100);
  const perShareRisk = Math.max(entry - stop, 0);
  const shares = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0;
  const positionValue = shares * entry;
  const pctOfAccount = account > 0 ? (positionValue / account) * 100 : 0;
  const stopPct = entry > 0 ? ((entry - stop) / entry) * 100 : 0;
  const oversized = pctOfAccount > 25;

  const field = (label, val, setVal, prefix) => (
    <div style={{ flex: 1, minWidth: 92 }}>
      <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "6px 9px" }}>
        {prefix && <span style={{ fontSize: 12, color: C.inkFaint }}>{prefix}</span>}
        <input type="number" value={val} onChange={(e) => setVal(parseFloat(e.target.value) || 0)}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.ink, fontSize: 13, fontFamily: mono, fontWeight: 600 }} />
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: C.panelHi, border: `1px solid ${C.line}`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <ListChecks size={15} color={C.amber} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.amber }}>POSITION SIZER — RISK FIRST</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {field("ACCOUNT", account, setAccount, "£")}
        {field("RISK %", riskPct, setRiskPct)}
        {field("ENTRY", entry, setEntry, "£")}
        {field("STOP (exit-if-wrong)", stop, setStop, "£")}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${C.line}` }}>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>YOU RISK</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: C.amber }}>£{riskAmount.toFixed(0)}</div><div style={{ fontSize: 10, color: C.inkFaint }}>if stop hit</div></div>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>BUY</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: C.ink }}>{shares} sh</div><div style={{ fontSize: 10, color: C.inkFaint }}>stop {stopPct.toFixed(1)}% away</div></div>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>POSITION</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: mono, color: oversized ? C.red : C.green }}>£{positionValue.toFixed(0)}</div><div style={{ fontSize: 10, color: oversized ? C.red : C.inkFaint }}>{pctOfAccount.toFixed(0)}% of account</div></div>
      </div>
      <div style={{ fontSize: 11, color: oversized ? C.red : C.inkFaint, lineHeight: 1.5, marginTop: 4 }}>
        {oversized
          ? "⚠ This position is a large share of your account. Even with a tight stop, concentration risk is high — consider a wider stop or smaller risk %."
          : "Risk-first sizing: you decide the most you'll lose (risk %), the stop sets the share count — not the other way round. Never size up just because a position 'feels' right."}
      </div>
      <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 8, fontStyle: "italic" }}>
        Illustrative maths only. Not advice. The stop is your invalidation level made concrete — set it where the thesis is proven wrong, then size to it.
      </div>
    </div>
  );
}

// ---------- MACRO INTELLIGENCE VIEW ----------
function MacroView({ macroData, newsData, liveStatus }) {
  const TREND_COL = (t) => t === "EXPANDING" ? C.green : t === "CONTRACTING" ? C.red : t === "WEAKENING" ? C.green : t === "STRENGTHENING" ? C.amber : C.inkFaint;
  const TREND_ICON = (t) => t === "EXPANDING" || t === "WEAKENING" ? <ArrowUpRight size={13} /> : t === "CONTRACTING" || t === "STRENGTHENING" ? <ArrowDownRight size={13} /> : <Minus size={13} />;

  const liqCol = macroData?.liquiditySignal === "EXPANDING" ? C.green : macroData?.liquiditySignal === "CONTRACTING" ? C.red : C.amber;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* FRAMEWORK EXPLAINER */}
      <section style={{ background: C.panel, border: `1px solid ${C.blue}33`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Globe size={14} color={C.blue} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.blue, fontFamily: mono }}>FRAMEWORK — ALDEN / ZULAUF</span>
        </div>
        <p style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.65, margin: 0 }}>
          <strong style={{ color: C.ink }}>Lyn Alden:</strong> the single most important macro variable is whether global liquidity (Fed balance sheet + M2) is <em>expanding or contracting</em>. When it expands, risk assets rise in aggregate — the tide lifts boats. When it contracts, correlations go to 1 on the downside. Tokenisation is a structural trend playing out <em>within</em> a liquidity cycle; the cycle determines the risk environment, not whether the thesis is right.
        </p>
        <p style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.65, margin: "8px 0 0" }}>
          <strong style={{ color: C.ink }}>Felix Zulauf:</strong> watch the dollar as a global liquidity <em>multiplier</em>. A weakening dollar loosens financial conditions worldwide — EM, commodities, and crypto benefit. A strengthening dollar tightens them and creates dollar-debt stress. His 2026 view: potential credit events (watch HY spreads), strong bull run if recession is avoided, bearish long bonds.
        </p>
        <p style={{ fontSize: 11, color: C.inkFaint, lineHeight: 1.55, margin: "8px 0 0" }}>
          Use this tab to read the macro backdrop — it contextualises every signal in the Intelligence tab. Regime confirmation only. Not financial advice.
        </p>
      </section>

      {/* COMPOSITE LIQUIDITY SIGNAL */}
      {macroData && (
        <section style={{ background: `${liqCol}12`, border: `1px solid ${liqCol}44`, borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <BarChart2 size={14} color={liqCol} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: liqCol, fontFamily: mono }}>LIQUIDITY CYCLE — {macroData.liquiditySignal}</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: mono }}>FRED · HOURLY</span>
          </div>
          <div className="grid3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            {macroData.indicators.map((ind) => {
              const col = TREND_COL(ind.trend);
              return (
                <div key={ind.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: C.inkFaint, marginBottom: 4 }}>{ind.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 4 }}>
                    <span style={{ fontSize: 19, fontWeight: 700, fontFamily: mono, color: C.ink }}>{ind.value}</span>
                    <span style={{ fontSize: 10, color: col, fontWeight: 700, fontFamily: mono, display: "flex", alignItems: "center", gap: 2 }}>{TREND_ICON(ind.trend)}{ind.trend}</span>
                  </div>
                  {ind.chg && <div style={{ fontSize: 10, color: C.inkFaint, fontFamily: mono, marginBottom: 6 }}>{ind.chg}</div>}
                  <div style={{ fontSize: 10.5, color: C.inkDim, lineHeight: 1.5 }}>{ind.interpretation} {ind.source && <a href={ind.source} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>src↗</a>}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.inkFaint }}>
            Alden: when Fed BS + M2 both expand, the liquidity tide is rising — strongest macro tailwind for risk. When both contract, risk across <em>all</em> assets faces headwinds regardless of individual thesis quality. <strong style={{ color: liqCol }}>Current composite: {macroData.liquiditySignal}.</strong>
          </div>
        </section>
      )}
      {!macroData && liveStatus === "live" && <div style={{ color: C.inkFaint, fontSize: 12, padding: 12 }}>Loading macro data from FRED…</div>}
      {!macroData && liveStatus !== "live" && <div style={{ color: C.inkFaint, fontSize: 12, padding: 12 }}>Macro data requires the live proxy. Running in snapshot mode.</div>}

      {/* GLOBAL INTELLIGENCE FEED */}
      <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Newspaper size={14} color={C.violet} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.violet, fontFamily: mono }}>GLOBAL INTELLIGENCE FEED</span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: C.inkFaint, fontFamily: mono }}>15 MIN CACHE</span>
        </div>
        {/* Source key */}
        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 3.5, background: C.green, display: "inline-block" }} /> PRIMARY — Fed / ECB / BIS / IMF (low noise, treat like disclosures)
          </span>
          <span style={{ fontSize: 10, color: C.inkFaint, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 3.5, background: C.inkFaint, display: "inline-block" }} /> NEWS — wire services (faster, noisier — context only)
          </span>
        </div>
        {newsData?.items?.length > 0 ? (
          <div>
            {newsData.items.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: i > 0 ? `1px solid ${C.line}` : "none" }}>
                <span style={{ width: 7, height: 7, borderRadius: 3.5, marginTop: 5, flexShrink: 0, background: item.tier === "PRIMARY" ? C.green : C.inkFaint }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>
                    {item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: C.ink, textDecoration: "none" }}>{item.title}</a> : item.title}
                  </div>
                  <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 3, fontFamily: mono }}>
                    {item.source} {item.pub ? `· ${new Date(item.pub).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : liveStatus === "live" ? (
          <div style={{ color: C.inkFaint, fontSize: 12 }}>Loading intelligence feed… (first load fetches 6 sources)</div>
        ) : (
          <div style={{ color: C.inkFaint, fontSize: 12 }}>Global feed requires the live proxy. Running in snapshot mode.</div>
        )}
        <div style={{ marginTop: 12, fontSize: 10, color: C.inkFaint }}>
          Feed filtered to watchlist names + macro keywords. PRIMARY items are central-bank and regulatory statements — treat them with the same weight as a Form 4: primary source, low hype. NEWS items are context, never signals.
        </div>
      </section>
    </div>
  );
}

// ---------- BACKTEST VIEW (inlined) ----------
function BacktestView() {
  const [signal, setSignal] = useState("insiderCluster");
  const [hasEdge, setHasEdge] = useState(true);
  const [seed, setSeed] = useState(42);
  const [realTicker, setRealTicker] = useState("");
  const [realBars, setRealBars] = useState(null);
  const [loadingReal, setLoadingReal] = useState(false);

  async function loadReal(ticker) {
    if (!PROXY_URL || !ticker) return;
    setLoadingReal(true);
    try {
      const r = await fetch(`${PROXY_URL}/api/prices?ticker=${ticker}&days=400`);
      const j = await r.json();
      if (j.data?.length) { setRealBars(j.data); setRealTicker(ticker); }
    } catch (e) { setRealBars(null); }
    setLoadingReal(false);
  }

  const result = useMemo(() => {
    if (realBars) {
      // On real prices we can only run price-based signals honestly (no synthetic events).
      return runBacktest(realBars, SIGNAL_FIRE.smaCross, [], {});
    }
    const { bars, events } = makeSeries(seed, hasEdge);
    return runBacktest(bars, SIGNAL_FIRE[signal], events, {});
  }, [signal, hasEdge, seed, realBars]);
  const a = result.all; const trust = TRUST_META[a.trust] || TRUST_META.none; const TrustIcon = trust.icon;
  const gap = (result.inSample.hitRate != null && result.outSample.hitRate != null) ? Math.abs(result.inSample.hitRate - result.outSample.hitRate) : null;
  const overfit = gap != null && gap > 0.2;
  const pct = (x) => x == null ? "—" : `${(x * 100).toFixed(0)}%`;
  const pctS = (x) => x == null ? "—" : `${(x * 100).toFixed(2)}%`;
  const eq = result.equity;
  const spark = useMemo(() => { if (!eq.length) return ""; const min = Math.min(...eq, 1), max = Math.max(...eq, 1), w = 280, h = 54; return eq.map((v, i) => { const x = (i / (eq.length - 1)) * w; const y = h - ((v - min) / (max - min || 1)) * h; return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" "); }, [eq]);
  const fin = eq.length ? eq[eq.length - 1] : 1;
  const Stat = ({ label, value, color, sub }) => <div style={{ flex: 1, minWidth: 110 }}><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.4, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700, color: color || C.ink, fontFamily: mono }}>{value}</div>{sub && <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 2 }}>{sub}</div>}</div>;
  const Toggle = ({ opts, val, set }) => <div style={{ display: "flex", gap: 1, border: `1px solid ${C.line}`, borderRadius: 5, overflow: "hidden" }}>{opts.map(([k, lbl], idx) => <button key={String(k)} onClick={() => set(k)} style={{ cursor: "pointer", padding: "7px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: val === k ? `${C.violet}22` : "transparent", color: val === k ? C.violet : C.inkDim, border: "none", borderRight: idx === 0 ? `1px solid ${C.line}` : "none" }}>{lbl}</button>)}</div>;

  return (
    <Panel title="Backtest Lab" icon={FlaskConical} accent={C.violet} right={<span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>WOULD THIS SIGNAL HAVE WORKED?</span>}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>SIGNAL</div><Toggle opts={[["insiderCluster", "Insider cluster"], ["smaCross", "Dumb baseline"]]} val={signal} set={setSignal} /></div>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>HISTORY HAS REAL EDGE?</div><Toggle opts={[[true, "Yes"], [false, "No (noise)"]]} val={hasEdge} set={setHasEdge} /></div>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>RESAMPLE</div><button onClick={() => setSeed((s) => s + 7)} style={{ cursor: "pointer", padding: "7px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 5, display: "flex", alignItems: "center", gap: 6 }}><Repeat size={12} /> New draw</button></div>
        {PROXY_URL && (
          <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>REAL PRICES (PROXY)</div>
            <div style={{ display: "flex", gap: 5 }}>
              {ALL_TICKERS.map((tk) => (
                <button key={tk} onClick={() => loadReal(tk)} disabled={loadingReal} style={{ cursor: "pointer", padding: "5px 9px", fontSize: 10, fontWeight: 700, fontFamily: mono, background: realTicker === tk ? `${C.green}22` : "transparent", color: realTicker === tk ? C.green : C.inkDim, border: `1px solid ${realTicker === tk ? C.green + "55" : C.line}`, borderRadius: 5 }}>{tk}</button>
              ))}
              {realBars && <button onClick={() => { setRealBars(null); setRealTicker(""); }} style={{ cursor: "pointer", padding: "7px 10px", fontSize: 10.5, color: C.inkFaint, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 5 }}>synthetic</button>}
            </div>
          </div>
        )}
      </div>

      {realBars && (
        <div style={{ marginBottom: 14, padding: "9px 13px", background: `${C.green}10`, border: `1px solid ${C.green}35`, borderRadius: 6, fontSize: 11.5, color: C.inkDim }}>
          <Wifi size={12} color={C.green} style={{ verticalAlign: "-1px", marginRight: 6 }} />
          Running on <strong style={{ color: C.green }}>real {realTicker} daily history</strong> ({realBars.length} bars, momentum baseline). This is your actual data — the trust guard now means something real.
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 15px", borderRadius: 7, marginBottom: 16, background: `${trust.c}0E`, border: `1px solid ${trust.c}40` }}>
        <TrustIcon size={24} color={trust.c} style={{ flexShrink: 0 }} />
        <div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: trust.c, letterSpacing: 1 }}>{trust.label}</span><span style={{ fontSize: 11, color: C.inkFaint, fontFamily: mono }}>n = {a.n} trades</span></div><div style={{ fontSize: 12, color: C.inkDim, marginTop: 3, lineHeight: 1.45 }}>{trust.note}</div></div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "4px 2px 16px" }}>
        <Stat label="HIT RATE" value={pct(a.hitRate)} color={a.hitRate >= 0.5 ? C.green : C.red} />
        <Stat label="FALSE-POSITIVE" value={pct(a.falsePos)} color={C.amber} sub="fired, lost" />
        <Stat label="EXPECTANCY / TRADE" value={pctS(a.expectancy)} color={a.expectancy > 0 ? C.green : C.red} sub="the number that matters" />
        <Stat label="MAX DRAWDOWN" value={pct(a.maxDD)} color={C.red} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 14px", background: C.panelHi, borderRadius: 7, marginBottom: 16 }}>
        <svg width="280" height="54" style={{ flexShrink: 0 }}><path d={spark} fill="none" stroke={fin >= 1 ? C.green : C.red} strokeWidth="1.6" /></svg>
        <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>£1 BECOMES (this sample, pre-tax)</div><div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: fin >= 1 ? C.green : C.red }}>£{fin.toFixed(2)}</div></div>
      </div>

      <div style={{ padding: "12px 15px", borderRadius: 7, background: overfit ? `${C.red}0C` : `${C.line}55`, border: `1px solid ${overfit ? C.red + "40" : C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>{overfit ? <AlertTriangle size={14} color={C.red} /> : <Activity size={14} color={C.inkDim} />}<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: overfit ? C.red : C.inkDim }}>OVERFIT CHECK — IN vs OUT-OF-SAMPLE</span></div>
        <div style={{ display: "flex", gap: 24 }}>
          <div><span style={{ fontSize: 10, color: C.inkFaint }}>In-sample </span><span style={{ fontFamily: mono, fontWeight: 700 }}>{pct(result.inSample.hitRate)}</span></div>
          <div><span style={{ fontSize: 10, color: C.inkFaint }}>Out-of-sample </span><span style={{ fontFamily: mono, fontWeight: 700 }}>{pct(result.outSample.hitRate)}</span></div>
          <div><span style={{ fontSize: 10, color: C.inkFaint }}>Gap </span><span style={{ fontFamily: mono, fontWeight: 700, color: overfit ? C.red : C.green }}>{gap == null ? "—" : pct(gap)}</span></div>
        </div>
        <div style={{ fontSize: 11.5, color: C.inkDim, marginTop: 8, lineHeight: 1.5 }}>{overfit ? "Large gap — the signal looks better on data it was built on than on fresh data. Classic overfitting. Distrust the headline." : "Gap contained — the signal behaves similarly on unseen data. A basic check against overfitting."}</div>
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.inkFaint, lineHeight: 1.6 }}>
        <Info size={12} style={{ verticalAlign: "-1px", marginRight: 5 }} />
        Set <strong style={{ color: C.inkDim }}>real edge → No (noise)</strong> and hit <strong style={{ color: C.amber }}>New draw</strong> a few times. Watch the "dumb baseline" post a flattering hit rate on pure noise — that illusion is exactly what this Lab exists to puncture. Trust the expectancy and the trust guard, not the headline hit rate. Swap the synthetic generator for real price history (via the proxy) to test your actual signals.
      </div>
    </Panel>
  );
}

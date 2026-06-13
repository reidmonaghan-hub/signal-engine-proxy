import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Crosshair, Compass, Target, Layers, Waves, Radio, Landmark, Building2,
  Eye, Activity, Clock, FileText, Shield, Circle, ArrowUpRight, ArrowDownRight,
  Minus, TrendingUp, TrendingDown, Zap, XCircle, MapPin, ListChecks, RefreshCw,
  Wifi, WifiOff, FlaskConical, AlertTriangle, ShieldCheck, ShieldAlert, Repeat,
  Info, Home, ChevronRight, Gauge, Bell, Globe, DollarSign, Newspaper, BarChart2,
  BookOpen, PlusCircle, CheckCircle2, XOctagon, Users
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

// ---------- PAPER TRADE JOURNAL — localStorage CRUD ----------
const JOURNAL_KEY = "se_journal_v1";
const LAST_VISIT_KEY = "se_last_visit";
function loadJournal() { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]"); } catch { return []; } }
function saveJournal(t) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(t)); } catch {} }
function getLastVisit() { try { return localStorage.getItem(LAST_VISIT_KEY); } catch { return null; } }
function markVisit() { try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch {} }
function journalStats(trades) {
  const n = trades.length;
  const closed = trades.filter((t) => t.status === "closed" && t.result != null);
  const nc = closed.length;
  if (nc === 0) return { n, nc: 0, trust: "none" };
  const wins = closed.filter((t) => t.result > 0);
  const hitRate = wins.length / nc;
  const avgReturn = closed.reduce((s, t) => s + t.result, 0) / nc;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.result, 0) / wins.length : 0;
  const losses = closed.filter((t) => t.result <= 0);
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.result, 0) / losses.length : 0;
  const expectancy = hitRate * avgWin + (1 - hitRate) * avgLoss;
  // R-multiple stats (only trades where rMultiple was computed from close price + stop)
  const withR = closed.filter((t) => t.rMultiple != null);
  const avgR = withR.length ? withR.reduce((s, t) => s + t.rMultiple, 0) / withR.length : null;
  const rWins = withR.filter((t) => t.rMultiple > 0);
  const rLosses = withR.filter((t) => t.rMultiple <= 0);
  const avgRWin = rWins.length ? rWins.reduce((s, t) => s + t.rMultiple, 0) / rWins.length : 0;
  const avgRLoss = rLosses.length ? rLosses.reduce((s, t) => s + t.rMultiple, 0) / rLosses.length : 0;
  const expectancyR = withR.length >= 3
    ? (rWins.length / withR.length) * avgRWin + (rLosses.length / withR.length) * avgRLoss
    : null;
  const trust = nc < 20 ? "untrustworthy" : nc < 50 ? "weak" : nc < 100 ? "moderate" : "reasonable";
  return { n, nc, hitRate, avgReturn, avgWin, avgLoss, expectancy, avgR, expectancyR, trust };
}

// ---------- DYNAMIC VERDICT ENGINE ----------
function computeVerdict(liveInsiders, liveCongress, clusterAlerts, activistData) {
  const insiderBuys = liveInsiders ? liveInsiders.filter((e) => e.direction === "BUY").length : 0;
  const insiderSells = liveInsiders ? liveInsiders.filter((e) => e.direction === "SELL" && !e.plan10b5).length : 0;
  const congressBuys = liveCongress ? liveCongress.filter((c) => c.action === "BUY").length : 0;
  const congressSells = liveCongress ? liveCongress.filter((c) => c.action === "SELL").length : 0;
  // 13D activist filings = strong buy signal (5%+ stake + activist intent); 13G = passive accumulation
  const activist13D = activistData ? activistData.filter((a) => a.isActivist && !a.isAmendment).length : 0;
  const activist13G = activistData ? activistData.filter((a) => !a.isActivist && !a.isAmendment).length : 0;
  const activistBuys = activist13D * 2 + activist13G; // 13D weighted double — activist intent is a stronger signal
  const totalBuys = insiderBuys + congressBuys + activistBuys;
  const totalSells = insiderSells + congressSells;

  // Per-thesis buy/sell counts
  const tBuys = {}, tSells = {};
  const countForSource = (items, actionKey, directionBuy, directionSell, isPreplanned) => {
    for (const e of (items || [])) {
      const w = WATCHLIST.find((w) => w.ticker === e.ticker);
      const thesis = w?.thesis || "other";
      const action = e[actionKey];
      if (action === directionBuy) tBuys[thesis] = (tBuys[thesis] || 0) + 1;
      if (action === directionSell && !(isPreplanned && e.plan10b5)) tSells[thesis] = (tSells[thesis] || 0) + 1;
    }
  };
  countForSource(liveInsiders, "direction", "BUY", "SELL", true);
  countForSource(liveCongress, "action", "BUY", "SELL", false);

  const topThesis = Object.entries(tBuys).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topThesisDef = SEED_THESES.find((t) => t.id === topThesis);

  let direction, headline, detail;
  const clusters = clusterAlerts?.length || 0;

  if (clusters > 0) {
    direction = "cluster";
    const names = clusterAlerts.map((a) => a.ticker).join(", ");
    headline = `Cluster buys detected on ${names} — multiple insiders accumulating simultaneously.`;
    detail = `${clusters} active cluster signal${clusters > 1 ? "s" : ""}. ${totalBuys} total buy disclosures vs ${totalSells} discretionary sell. Cluster buys are the strongest insider tell — verify on EDGAR before acting. This is a lagged disclosure, not a price trigger.`;
  } else if (totalBuys >= 3 && totalBuys > totalSells * 1.5) {
    direction = "accumulation";
    headline = topThesisDef
      ? `Disclosed money is accumulating ${topThesisDef.name} names — ${totalBuys} buy disclosures vs ${totalSells} discretionary sell.`
      : `Net accumulation across the watchlist — ${totalBuys} buy disclosures vs ${totalSells} sell.`;
    detail = topThesisDef
      ? `${topThesisDef.name} leads the buy-side. Congress + insiders both leaning long. Structural conviction, not a short-term trade.`
      : `Multiple disclosure sources confirm net-buying. Cross-reference individual names on EDGAR before acting.`;
  } else if (totalSells > totalBuys * 1.5 && totalSells >= 3) {
    direction = "distribution";
    headline = `Distribution signal — ${totalSells} discretionary insider sells vs ${totalBuys} buys. Insiders reducing exposure into strength.`;
    detail = `Preplanned 10b5-1 sales already excluded from this count — these are discretionary decisions. Investigate each ticker on EDGAR. Not a sell signal; a prompt to review.`;
  } else if (totalBuys > 0 || totalSells > 0) {
    direction = "mixed";
    headline = `Mixed signals — ${totalBuys} buy vs ${totalSells} discretionary sell disclosures. No strong directional consensus yet.`;
    detail = `Monitor for cluster formation. Regime confirmation, not an actionable read. Check back as new Form 4s are filed.`;
  } else {
    direction = "neutral";
    headline = ACTION_BRIEF.headline;
    detail = ACTION_BRIEF.plainRead;
  }
  return { headline, direction, detail, totalBuys, totalSells, tBuys, tSells, topThesis };
}

// ---------- DYNAMIC THESIS SCORE ----------
function computeThesisScore(thesis, clusterAlerts) {
  const W = { high: 30, med: 20, low: 10 };
  let score = 0, max = 0;
  for (const tr of thesis.triggers) {
    const w = W[tr.weight] || 10;
    max += w;
    if (tr.status === "fired") score += w;
    else if (tr.status === "watching") score += w * 0.35;
  }
  const raw = max > 0 ? score / max : 0;
  const base = 15 + Math.round(raw * 65);
  const thesisTickers = new Set(WATCHLIST.filter((w) => w.thesis === thesis.id).map((w) => w.ticker));
  const clusterBoost = (clusterAlerts || []).filter((a) => thesisTickers.has(a.ticker)).length * 6;
  return Math.min(95, base + clusterBoost);
}

// ---------- ERROR BOUNDARY ----------
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error("Signal Engine error:", err, info); }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 28 }}>
          <AlertTriangle size={36} color={C.red} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 8 }}>Render error</div>
          <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 20, lineHeight: 1.6 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => this.setState({ error: null })} style={{ cursor: "pointer", padding: "9px 22px", background: `${C.amber}18`, border: `1px solid ${C.amber}55`, color: C.amber, borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Reload panel</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

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

async function fetchLiveCongress() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const tickers = EQUITY_TICKERS.join(",");
  const r = await fetch(`${PROXY_URL}/api/congress?tickers=${tickers}`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  if (!j.data?.length) throw new Error("empty");
  return j.data; // { chamber, who, ticker, action, size, traded, filed }
}

async function fetchLiveActivist() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const r = await fetch(`${PROXY_URL}/api/activist`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const j = await r.json();
  return j.data || []; // { ticker, company, filer, formType, isActivist, isAmendment, date }
}

async function fetchLiveBriefing() {
  if (!PROXY_URL) throw new Error("no proxy configured");
  const r = await fetch(`${PROXY_URL}/api/briefing`);
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  return r.json(); // { generatedAt, experts, sections, thesisEffects, actionItems, ... }
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
  const [newsError, setNewsError] = useState(null);
  const [liveCongress, setLiveCongress] = useState(null);
  const [activistData, setActivistData] = useState(null);
  const [briefingData, setBriefingData] = useState(null);

  // paper trade journal
  const [journal, setJournal] = useState(() => loadJournal());
  const [logTicker, setLogTicker] = useState(""); // pre-fill trigger from cluster alert banner
  const [autoLog, setAutoLog] = useState(true); // auto-create journal entries on cluster buy
  const [autoLogNote, setAutoLogNote] = useState(null); // brief "auto-logged X" toast
  const lastVisit = useRef(getLastVisit());

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
        // Exclude preplanned 10b5-1 sells — they were scheduled months ago and aren't
        // a current decision. Only discretionary sells count toward the distribution warning.
        const sells = evs.filter((e) => e.direction === "SELL" && !e.plan10b5);
        const buys = evs.filter((e) => e.direction === "BUY");
        if (sells.length < 2 || buys.length > 0) continue; // heavy discretionary selling only
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
    try {
      setNewsError(null);
      const nd = await fetchNews();
      if (nd?.items) setNewsData(nd);
      else setNewsError("Feed returned no items");
    } catch (e) { setNewsError(String(e?.message || e)); }
    try { setLiveCongress(await fetchLiveCongress()); } catch (e) { /* keep seed */ }
    // Activist takes longer (~20 EDGAR calls); fetch independently with 2h cadence
    try { setActivistData(await fetchLiveActivist()); } catch (e) { /* keep null */ }
    // Briefing is a static JSON served from file — very cheap, just grab it
    try { setBriefingData(await fetchLiveBriefing()); } catch (e) { /* keep null */ }
  }, []);

  useEffect(() => { const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { markVisit(); }, []);
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

      // Desktop notification
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`CLUSTER BUY — ${a.ticker}`, {
          body: `${a.count} insiders bought ${a.ticker} (latest filing ${daysAgo(a.latest)} ago). Lagged disclosure — regime confirmation, not a timing trigger. Verify on EDGAR. Not financial advice.`,
        });
      }

      // Auto-log hypothesis to journal
      if (autoLog) {
        const w = WATCHLIST.find((w) => w.ticker === a.ticker);
        const thesisDef = SEED_THESES.find((t) => t.id === w?.thesis);
        const valStr = a.totalVal ? ` (~$${a.totalVal >= 1e6 ? (a.totalVal / 1e6).toFixed(1) + "M" : Math.round(a.totalVal / 1000) + "K"} total)` : "";
        const entry = {
          id: Date.now() + Math.random(),
          ticker: a.ticker,
          thesis: w?.thesis || "",
          hypothesis: `AUTO — Cluster buy: ${a.count} insiders bought ${a.ticker}${valStr}, latest filing ${daysAgo(a.latest)} ago. ${thesisDef ? thesisDef.name + " thesis' accumulation now confirmed by multiple filers." : ""} Set your entry price and stop below, then verify each Form 4 on EDGAR before sizing. Not financial advice.`,
          entry: null,  // user fills in after checking chart
          stop: null,   // user sets invalidation price
          size: null,
          invalidation: thesisDef?.invalidation || "Check EDGAR for context on each filing.",
          opened: new Date().toISOString(),
          status: "open",
          result: null,
          closedAt: null,
          notes: "",
          autoLogged: true,
          doc: a.doc || null,
        };
        setJournal((prev) => {
          // Don't duplicate if same ticker already has an open auto-logged entry from same date
          if (prev.some((t) => t.ticker === a.ticker && t.status === "open" && t.autoLogged)) return prev;
          const updated = [entry, ...prev];
          saveJournal(updated);
          return updated;
        });
        setAutoLogNote(`Hypothesis auto-logged: ${a.ticker} cluster buy`);
        setTimeout(() => setAutoLogNote(null), 5000);

        // Also try to fetch the current price in the background and update the entry
        if (PROXY_URL) {
          fetch(`${PROXY_URL}/api/prices?ticker=${a.ticker}&days=5`)
            .then((r) => r.json())
            .then((j) => {
              const bars = j.data;
              if (!bars?.length) return;
              const px = bars[bars.length - 1].close;
              setJournal((prev) => {
                const updated = prev.map((t) =>
                  t.ticker === a.ticker && t.autoLogged && t.entry === null
                    ? { ...t, entry: parseFloat(px.toFixed(2)) }
                    : t
                );
                saveJournal(updated);
                return updated;
              });
            })
            .catch(() => { /* price fetch optional — silently skip */ });
        }
      }
    }
  }, [clusterAlerts, autoLog]);
  const askNotify = () => { if (typeof Notification !== "undefined") Notification.requestPermission().then(setNotifyPerm); };

  // dynamic verdict — computed from live data when available, falls back to seed narrative
  const liveVerdict = useMemo(
    () => computeVerdict(liveStatus === "live" ? liveInsiders : null, liveStatus === "live" ? liveCongress : null, clusterAlerts, activistData),
    [liveInsiders, liveCongress, clusterAlerts, liveStatus, activistData]
  );

  // dynamic thesis scores — trigger weights + cluster boosts
  const liveScores = useMemo(
    () => Object.fromEntries(SEED_THESES.map((t) => [t.id, computeThesisScore(t, clusterAlerts)])),
    [clusterAlerts]
  );

  // live confidence — shows in top bar
  const liveConfidence = useMemo(() => {
    const scores = Object.values(liveScores);
    let base = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    base = Math.min(95, base + clusterAlerts.length * 3);
    if (regime) {
      const stressCount = regime.lights.filter((l) => l.status === "STRESS").length;
      base = Math.max(15, base - stressCount * 5);
    }
    return base;
  }, [liveScores, clusterAlerts, regime]);

  const thesis = SEED_THESES.find((t) => t.id === activeThesis);

  const TABS = [
    { id: "summary", label: "Summary", icon: Home },
    { id: "intel", label: "Intelligence", icon: Eye },
    { id: "macro", label: "Macro", icon: Globe },
    { id: "brief", label: "Expert Brief", icon: Users },
    { id: "backtest", label: "Backtest Lab", icon: FlaskConical },
    { id: "journal", label: "Journal", icon: BookOpen },
  ];

  return (
    <ErrorBoundary>
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
        @media (max-width:500px){ .tab-lbl{display:none} .top-bar-title{display:none} }
        button,a{-webkit-tap-highlight-color:transparent}
        @supports(padding:max(0px)){
          .safe-bottom{padding-bottom:max(16px,env(safe-area-inset-bottom))}
        }
      `}</style>

      {/* TOP BAR */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#0B0E11ee", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ padding: "13px 20px", display: "flex", alignItems: "center", gap: 14, maxWidth: 1200, margin: "0 auto" }}>
          <Crosshair size={21} color={C.amber} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2.5, fontFamily: mono }}>SIGNAL<span style={{ color: C.amber }}>·</span>ENGINE</div>
            <div className="top-bar-title" style={{ fontSize: 8.5, color: C.inkFaint, letterSpacing: 1.5 }}>DISCLOSED SMART-MONEY INTELLIGENCE</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8.5, color: C.inkFaint, letterSpacing: 1.5 }}>CONFLUENCE</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: liveConfidence >= 70 ? C.green : liveConfidence >= 50 ? C.amber : C.inkFaint, fontFamily: mono }}>{liveConfidence}<span style={{ fontSize: 10, color: C.inkFaint }}>/100</span></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: `1px solid ${liveStatus === "live" ? C.green + "55" : C.amber + "44"}`, borderRadius: 6, background: liveStatus === "live" ? `${C.green}0A` : `${C.amber}0A` }}>
              {liveStatus === "live" ? <Wifi size={12} color={C.green} className="live-dot" /> : liveStatus === "loading" ? <RefreshCw size={12} color={C.amber} style={{ animation: "spin 1s linear infinite" }} /> : <WifiOff size={12} color={C.amber} />}
              <span style={{ fontSize: 9, color: liveStatus === "live" ? C.green : C.amber, fontFamily: mono, letterSpacing: 1, fontWeight: 700 }}>{liveStatus === "live" ? "LIVE" : liveStatus === "loading" ? "SYNCING" : "SNAPSHOT"}</span>
            </div>
          </div>
        </div>
        {/* SNAPSHOT WARNING BANNER — unmissable when proxy is unreachable */}
        {liveStatus === "blocked" && (
          <div style={{ background: `${C.amber}18`, borderTop: `1px solid ${C.amber}33`, padding: "8px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={13} color={C.amber} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, fontFamily: mono, letterSpacing: 1.2 }}>SNAPSHOT MODE</span>
            <span style={{ fontSize: 11, color: C.inkDim }}>The data panels below show a <strong style={{ color: C.amber }}>June 2026 example picture</strong> — not live disclosures. Proxy unreachable. Check <a href="https://signal-engine-proxy.onrender.com/api/health" target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>proxy health ↗</a></span>
          </div>
        )}
        {/* AUTO-LOG TOAST */}
        {autoLogNote && (
          <div style={{ background: `${C.green}18`, borderTop: `1px solid ${C.green}33`, padding: "7px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={12} color={C.green} />
            <span style={{ fontSize: 11, color: C.green, fontFamily: mono, fontWeight: 700, letterSpacing: 1 }}>{autoLogNote} — check the Journal tab to set your stop and size.</span>
          </div>
        )}
        {/* TABS */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px", maxWidth: 1200, margin: "0 auto" }}>
          {TABS.map((t) => {
            const Icon = t.icon; const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", cursor: "pointer",
                background: "transparent", border: "none", borderBottom: `2px solid ${on ? C.amber : "transparent"}`,
                color: on ? C.ink : C.inkFaint, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                minWidth: 44, justifyContent: "center",
              }}><Icon size={14} /><span className="tab-lbl">{t.label}</span></button>
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
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  {a.doc && <a href={a.doc} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: mono }}>VERIFY ON EDGAR ↗</a>}
                  <button onClick={() => { setLogTicker(a.ticker); setTab("journal"); }} style={{ cursor: "pointer", background: `${C.amber}18`, border: `1px solid ${C.amber}55`, color: C.amber, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, padding: "3px 9px", borderRadius: 4, fontFamily: mono, display: "flex", alignItems: "center", gap: 5 }}>
                    <BookOpen size={10} />LOG HYPOTHESIS
                  </button>
                </div>
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
            {/* THE ONE-GLANCE VERDICT — computed live from disclosures */}
            {(() => {
              const vdCol = liveVerdict.direction === "cluster" ? C.amber : liveVerdict.direction === "accumulation" ? C.green : liveVerdict.direction === "distribution" ? C.red : C.inkDim;
              const vdBorder = `1px solid ${vdCol}45`;
              return (
                <section style={{ background: `linear-gradient(135deg, ${C.panelHi}, ${C.panel})`, border: vdBorder, borderRadius: 10, padding: "22px 22px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                    <Compass size={17} color={vdCol} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: vdCol, fontFamily: mono }}>WHAT THE MONEY IS SAYING RIGHT NOW</span>
                    {liveStatus === "live" && <span style={{ marginLeft: "auto", fontSize: 9, color: C.green, fontFamily: mono, letterSpacing: 1 }}>LIVE DATA</span>}
                    {liveStatus !== "live" && <span style={{ marginLeft: "auto", fontSize: 9, color: C.amber, fontFamily: mono, letterSpacing: 1 }}>SNAPSHOT</span>}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35, marginBottom: 12 }}>{liveVerdict.headline}</div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: C.inkDim }}>{liveVerdict.detail}</p>
                  <div style={{ display: "flex", gap: 20, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                    <div><div style={{ fontSize: 26, fontWeight: 700, color: C.green, fontFamily: mono }}>{liveVerdict.totalBuys || "—"}</div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.4 }}>BUY SIGNALS</div></div>
                    <div style={{ width: 1, background: C.line }} />
                    <div><div style={{ fontSize: 26, fontWeight: 700, color: C.red, fontFamily: mono }}>{liveVerdict.totalSells || "—"}</div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.4 }}>SELL SIGNALS</div></div>
                    <div style={{ width: 1, background: C.line }} />
                    <div style={{ flex: 1 }}>
                      {liveVerdict.direction === "cluster" && <div style={{ fontSize: 11, color: C.amber, lineHeight: 1.5 }}>Cluster buys are the strongest publicly-disclosed insider signal. These are <strong>primary source</strong> disclosures — confirm on EDGAR. Not financial advice.</div>}
                      {liveVerdict.direction === "accumulation" && <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.5 }}>Net buy read: disclosed smart money is accumulating. <strong style={{ color: C.green }}>Structural, not a trade.</strong> Lagged data confirms a regime, never times an entry.</div>}
                      {liveVerdict.direction === "distribution" && <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.5 }}>Net sell read: insiders are reducing exposure. <strong style={{ color: C.red }}>Not a sell signal</strong> — a prompt to investigate. Verify each filing on EDGAR.</div>}
                      {(liveVerdict.direction === "mixed" || liveVerdict.direction === "neutral") && <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.5 }}>No strong directional consensus. Monitor for cluster formation as new Form 4s are filed.</div>}
                    </div>
                  </div>
                </section>
              );
            })()}

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
                      <ScoreBar score={liveScores[t.id] ?? t.score} />
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title={`Breakdown · ${thesis.name}`} icon={thesis.icon} accent={CONF[thesis.confidence].c} right={
              <div style={{ textAlign: "right" }}>
                <div style={{ width: 160 }}><ScoreBar score={liveScores[thesis.id] ?? thesis.score} /></div>
                <div style={{ fontSize: 9, color: C.inkFaint, marginTop: 3 }}>Trigger-weight + cluster score — not a price signal</div>
              </div>
            }>
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
              {/* CONGRESS — live from proxy when available, seed fallback */}
              <Panel title="Congressional" icon={Landmark} accent={C.gold} right={
                <span style={{ fontSize: 9, color: liveCongress ? C.green : C.inkFaint, fontFamily: mono }}>
                  {liveCongress ? "LIVE · STOCK ACT ~45d LAG" : "SNAPSHOT · STOCK ACT ~45d LAG"}
                </span>
              }>
                {liveCongress ? liveCongress.slice(0, 8).map((c, i, arr) => (
                  <div key={i} style={{ padding: "10px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      {c.chamber && <span style={{ fontSize: 9, fontWeight: 700, color: C.inkFaint, border: `1px solid ${C.line}`, borderRadius: 3, padding: "1px 5px" }}>{c.chamber.slice(0,3).toUpperCase()}</span>}
                      <span style={{ fontSize: 11.5, color: C.inkDim, flex: 1 }}>{c.who}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.action === "BUY" ? C.green : C.red, display: "flex", alignItems: "center", gap: 2 }}>{c.action === "BUY" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{c.action}</span>
                      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, minWidth: 46, textAlign: "right" }}>{c.ticker}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.inkFaint }}>{c.size}{c.filed ? ` · filed ${daysAgo(c.filed)} ago` : ""}{c.traded ? ` · traded ${daysAgo(c.traded)} ago` : ""}</div>
                  </div>
                )) : SEED_CONGRESS.map((c, i) => (
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
                {!liveCongress && <div style={{ marginTop: 9, fontSize: 10, color: C.amber }}>Snapshot data — proxy will load live Senate/House trades on next sync.</div>}
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
                {(liveStatus === "live" && liveInsiders ? liveInsiders.map((d) => ({
                  ticker: d.ticker, co: d.ticker, role: d.role || "Insider",
                  action: d.direction, val: d.value ? `$${d.value >= 1e6 ? (d.value/1e6).toFixed(1)+"M" : Math.round(d.value/1000)+"K"}` : "",
                  filed: daysAgo(d.filed), cluster: d.cluster, plan10b5: d.plan10b5, doc: d.doc,
                })) : SEED_INSIDERS).map((s, i, arr) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{s.ticker}</span>
                        {s.cluster && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: C.amber, background: `${C.amber}18`, border: `1px solid ${C.amber}44`, padding: "1px 6px", borderRadius: 3 }}>CLUSTER</span>}
                        {s.plan10b5 && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: C.inkFaint, background: `${C.line}`, border: `1px solid ${C.line}`, padding: "1px 6px", borderRadius: 3 }} title="Filed under a pre-scheduled Rule 10b5-1 plan — decided months ago, weaker signal">PREPLANNED</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 3 }}>{s.role} · filed {s.filed} ago</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {s.action && s.action !== "UNKNOWN" && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: s.action === "BUY" ? C.green : s.plan10b5 ? C.inkFaint : C.red, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                          {s.action === "BUY" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{s.action}
                        </div>
                      )}
                      {s.val && <div style={{ fontFamily: mono, fontSize: 11, color: C.inkDim }}>{s.val}</div>}
                      {s.doc && <a href={s.doc} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: C.blue, textDecoration: "none", fontFamily: mono }}>EDGAR ↗</a>}
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
              <Panel title="On-Chain Whales" icon={Activity} accent={C.green} right={<span style={{ fontSize: 9, color: C.amber, fontFamily: mono }}>ILLUSTRATIVE — UPDATE MANUALLY</span>}>
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
                <div style={{ marginTop: 10, padding: "8px 10px", background: `${C.amber}0A`, border: `1px solid ${C.amber}22`, borderRadius: 5, fontSize: 10.5, color: C.inkFaint, lineHeight: 1.5 }}>
                  These are manually-maintained research notes, not a live feed. Verify on-chain data at <a href="https://xrpscan.com" target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>XRPScan</a>, <a href="https://bitinfocharts.com" target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: "none" }}>BitInfoCharts</a>, or your exchange's ETF flow data.
                </div>
              </Panel>
            </div>

            {/* ACTIVIST / SIGNIFICANT HOLDER FILINGS — SC 13D / 13G */}
            <Panel
              title="Activist & Significant Holders"
              icon={Target}
              accent={C.violet}
              right={
                <span style={{ fontSize: 9, color: activistData ? C.green : C.inkFaint, fontFamily: mono }}>
                  {activistData ? `LIVE · SC 13D/13G · 10d LAG · ${activistData.length} FILINGS` : "LOADING…"}
                </span>
              }
            >
              {!activistData && (
                <div style={{ color: C.inkFaint, fontSize: 12, padding: "8px 0" }}>Scanning EDGAR for recent 13D/13G filings in crypto / AI / fintech…</div>
              )}
              {activistData && activistData.length === 0 && (
                <div style={{ color: C.inkFaint, fontSize: 12, padding: "8px 0" }}>No 13D/13G filings found in crypto/AI/fintech themes in the last 60 days — no activist pressure visible right now.</div>
              )}
              {activistData && activistData.slice(0, 12).map((a, i, arr) => {
                const accentCol = a.isActivist ? C.violet : C.blue;
                const themeCol = a.theme === "crypto" ? C.amber : a.theme === "tokenisation" ? C.violet : a.theme === "AI/chips" ? C.blue : C.green;
                return (
                  <div key={i} style={{ padding: "11px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: accentCol, background: `${accentCol}15`, border: `1px solid ${accentCol}40`, padding: "2px 7px", borderRadius: 3 }}>{a.formType}</span>
                      {a.isActivist && !a.isAmendment && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.violet, background: `${C.violet}18`, border: `1px solid ${C.violet}44`, padding: "2px 6px", borderRadius: 3 }}>ACTIVIST</span>
                      )}
                      {a.isAmendment && (
                        <span style={{ fontSize: 9, color: C.inkFaint, background: C.panelHi, border: `1px solid ${C.line}`, padding: "2px 6px", borderRadius: 3 }}>AMEND</span>
                      )}
                      <span style={{ fontSize: 9, color: themeCol, background: `${themeCol}12`, border: `1px solid ${themeCol}30`, padding: "2px 6px", borderRadius: 3 }}>{a.theme}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: C.inkFaint, fontFamily: mono }}>{a.date ? daysAgo(a.date) + "d ago" : "—"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.4 }}>
                      <strong style={{ color: C.ink }}>{a.filer}</strong>
                      {" "}{a.isActivist ? <span style={{ color: C.violet }}>filed SC 13D — activist, 5%+ with intent to influence</span> : <span style={{ color: C.blue }}>filed SC 13G — passive, 5%+ accumulation</span>}
                      {a.target && a.target !== a.filer && <span style={{ color: C.inkFaint }}> · target: {a.target}</span>}
                    </div>
                  </div>
                );
              })}
              {activistData && activistData.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 10.5, color: C.inkFaint, lineHeight: 1.5 }}>
                  Searching all of EDGAR for 13D/13G filings mentioning crypto, AI, fintech themes — last 60 days only. Fresh signal, not limited to your watchlist. <strong style={{ color: C.inkDim }}>13D = activist</strong> (intent to influence). <strong style={{ color: C.inkDim }}>13G = passive</strong> (accumulation). Not financial advice.
                </div>
              )}
            </Panel>

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

        {/* ========================= BACKTEST / MACRO / JOURNAL ========================= */}
        {tab === "macro" && <MacroView macroData={macroData} newsData={newsData} newsError={newsError} liveStatus={liveStatus} />}
        {tab === "brief" && <BriefView briefingData={briefingData} />}
        {tab === "backtest" && <BacktestView />}
        {tab === "journal" && <TradeJournalView journal={journal} setJournal={setJournal} logTicker={logTicker} setLogTicker={setLogTicker} clusterAlerts={clusterAlerts} autoLog={autoLog} setAutoLog={setAutoLog} />}

      </div>

      <div style={{ textAlign: "center", padding: "0 24px", color: C.inkFaint, fontSize: 11, lineHeight: 1.6, maxWidth: 760, margin: "0 auto" }}>
        Signal Engine is a monitoring and analysis tool — not an automated trader, and not financial advice. Disclosed-trade data is inherently lagged. Verify every figure against primary sources before acting. You make every decision.
      </div>
    </div>
    </ErrorBoundary>
  );
}

// ---------- EXPERT BRIEF VIEW ----------
function BriefView({ briefingData }) {
  if (!briefingData || !briefingData.experts?.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "32px 20px", textAlign: "center" }}>
          <Users size={32} color={C.inkFaint} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: C.inkDim, marginBottom: 6 }}>Expert briefing not loaded yet</div>
          <div style={{ fontSize: 12, color: C.inkFaint }}>The weekly expert report generates every Monday at 8am. Hit Sync to check for an update.</div>
        </section>
      </div>
    );
  }

  const { experts, guestExperts = [], sections = [], thesisEffects = [], actionItems = [], generatedAt, nextBriefing, weekLabel, nextInviteNote } = briefingData;
  const allExperts = [...experts, ...guestExperts];
  const expertById = Object.fromEntries(allExperts.map((e) => [e.id, e]));

  const EFFECT_COL = (e) => e === "BULLISH" ? C.green : e === "BEARISH" ? C.red : C.amber;
  const EFFECT_ICON = (e) => e === "BULLISH" ? <ArrowUpRight size={12} /> : e === "BEARISH" ? <ArrowDownRight size={12} /> : <Minus size={12} />;
  const PILL_COL = (p) => {
    if (/early|signal|conviction/.test(p)) return C.green;
    if (/geo|risk|regulatory/.test(p)) return C.red;
    if (/watch/.test(p)) return C.amber;
    return C.violet;
  };

  const AVATAR_COLS = ["#9B7FD4", "#3FB68B", "#4A90D9", "#E0A33E", "#E0593F"];
  const avatarCol = (idx) => AVATAR_COLS[idx % AVATAR_COLS.length];

  const ACTION_ICON = (type) => type === "watch" ? <Eye size={11} /> : <FileText size={11} />;
  const ACTION_COL = (type) => type === "watch" ? C.amber : C.blue;

  const genDate = generatedAt ? new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  const nextDate = nextBriefing ? new Date(nextBriefing).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* HEADER */}
      <section style={{ background: C.panel, border: `1px solid ${C.violet}33`, borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Users size={14} color={C.violet} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.violet, fontFamily: mono }}>EXPERT INTELLIGENCE BRIEFING</span>
          {weekLabel && <span style={{ marginLeft: "auto", fontSize: 11, color: C.inkFaint, fontFamily: mono }}>{weekLabel}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          {allExperts.map((exp, i) => (
            <div key={exp.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.panelHi, borderRadius: 7, padding: "10px 12px", border: `1px solid ${C.line}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${avatarCol(i)}22`, border: `1px solid ${avatarCol(i)}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: avatarCol(i), flexShrink: 0 }}>{exp.initials}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{exp.name}</div>
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>{exp.role}</div>
                {exp.focus && <div style={{ fontSize: 10, color: C.inkFaint, marginTop: 3, fontStyle: "italic" }}>{exp.focus}</div>}
                {guestExperts.includes(exp) && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.amber, marginTop: 4 }}>GUEST</div>}
              </div>
            </div>
          ))}
        </div>
        {genDate && (
          <div style={{ marginTop: 10, fontSize: 11, color: C.inkFaint }}>
            Generated {genDate}{nextDate ? <span> · Next briefing {nextDate}</span> : null}
          </div>
        )}
      </section>

      {/* DISCUSSION */}
      {sections.map((sec, si) => (
        <section key={si} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: C.panelHi, borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.inkFaint, textTransform: "uppercase", fontFamily: mono }}>{sec.heading}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {sec.turns.map((turn, ti) => {
              const exp = expertById[turn.expert];
              const expIdx = allExperts.findIndex((e) => e.id === turn.expert);
              const ac = avatarCol(expIdx >= 0 ? expIdx : ti);
              return (
                <div key={ti} style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${ac}22`, border: `1px solid ${ac}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: ac, flexShrink: 0, marginTop: 2 }}>{exp?.initials || "?"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.inkFaint, marginBottom: 4, fontFamily: mono }}>{exp?.name || turn.expert}</div>
                    <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.65 }}>{turn.text}</div>
                    {turn.pills?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                        {turn.pills.map((p, pi) => (
                          <span key={pi} style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${PILL_COL(p)}18`, border: `1px solid ${PILL_COL(p)}44`, color: PILL_COL(p), fontFamily: mono, letterSpacing: 0.5 }}>{p.toUpperCase()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* THESIS EFFECTS */}
      {thesisEffects.length > 0 && (
        <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: C.panelHi, borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.inkFaint, textTransform: "uppercase", fontFamily: mono }}>Thesis Effects This Week</span>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {thesisEffects.map((te, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingBottom: i < thesisEffects.length - 1 ? 10 : 0, borderBottom: i < thesisEffects.length - 1 ? `1px solid ${C.line}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 90, paddingTop: 1 }}>
                  <span style={{ color: EFFECT_COL(te.effect) }}>{EFFECT_ICON(te.effect)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: EFFECT_COL(te.effect), fontFamily: mono, letterSpacing: 0.5 }}>{te.effect}</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{te.label}</div>
                  <div style={{ fontSize: 11.5, color: C.inkDim, lineHeight: 1.55 }}>{te.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ACTION ITEMS */}
      {actionItems.length > 0 && (
        <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: C.panelHi, borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.inkFaint, textTransform: "uppercase", fontFamily: mono }}>What to Watch / Research This Week</span>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {actionItems.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: `${ACTION_COL(a.type)}18`, border: `1px solid ${ACTION_COL(a.type)}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, color: ACTION_COL(a.type) }}>{ACTION_ICON(a.type)}</div>
                <div style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.55, flex: 1 }}>{a.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NEXT INVITE NOTE */}
      {nextInviteNote && (
        <section style={{ background: `${C.amber}0D`, border: `1px solid ${C.amber}33`, borderRadius: 8, padding: "11px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Bell size={13} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 11.5, color: C.inkDim, lineHeight: 1.55 }}><strong style={{ color: C.amber }}>Next briefing:</strong> {nextInviteNote}</div>
        </section>
      )}

      {/* HOUSE RULES FOOTER */}
      <div style={{ fontSize: 11, color: C.inkFaint, lineHeight: 1.55, padding: "6px 2px" }}>
        Expert commentary represents analytical perspectives drawn from publicly available macro and disclosure data. <strong style={{ color: C.inkFaint }}>Not financial advice.</strong> Signal Engine does not place orders, use leverage, or predict prices. All entries are condition-based; all positions sized by risk from the stop.
      </div>
    </div>
  );
}

// ---------- PAPER TRADE JOURNAL VIEW ----------
function TradeJournalView({ journal, setJournal, logTicker, setLogTicker, clusterAlerts, autoLog, setAutoLog }) {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  // Form state
  const [fTicker, setFTicker] = useState(logTicker || "");
  const [fThesis, setFThesis] = useState("");
  const [fHypothesis, setFHypothesis] = useState("");
  const [fEntry, setFEntry] = useState("");
  const [fStop, setFStop] = useState("");
  const [fSize, setFSize] = useState("");
  const [fInvalidation, setFInvalidation] = useState("");

  // Sync logTicker pre-fill when it changes (e.g. from cluster alert button)
  React.useEffect(() => {
    if (logTicker) {
      setFTicker(logTicker);
      const w = WATCHLIST.find((w) => w.ticker === logTicker);
      if (w) setFThesis(w.thesis || "");
      setShowForm(true);
      setLogTicker(""); // consume it
    }
  }, [logTicker, setLogTicker]);

  function submitTrade() {
    if (!fTicker || !fHypothesis) return;
    const trade = {
      id: Date.now(),
      ticker: fTicker.toUpperCase().trim(),
      thesis: fThesis,
      hypothesis: fHypothesis,
      entry: parseFloat(fEntry) || null,
      stop: parseFloat(fStop) || null,
      size: parseFloat(fSize) || null,
      invalidation: fInvalidation,
      opened: new Date().toISOString(),
      status: "open",
      result: null, // % gain/loss when closed
      closedAt: null,
      notes: "",
    };
    const updated = [trade, ...journal];
    setJournal(updated);
    saveJournal(updated);
    // Reset form
    setFTicker(""); setFThesis(""); setFHypothesis(""); setFEntry(""); setFStop(""); setFSize(""); setFInvalidation("");
    setShowForm(false);
  }

  function closeTrade(id, closePrice) {
    const cp = parseFloat(closePrice);
    if (!cp || isNaN(cp)) return;
    const updated = journal.map((t) => {
      if (t.id !== id) return t;
      const resultPct = t.entry ? ((cp - t.entry) / t.entry) * 100 : 0;
      const rMultiple = (t.entry && t.stop && t.entry !== t.stop)
        ? (cp - t.entry) / (t.entry - t.stop)
        : null;
      return { ...t, status: "closed", closePrice: cp, result: resultPct, rMultiple, closedAt: new Date().toISOString() };
    });
    setJournal(updated);
    saveJournal(updated);
  }

  function deleteTrade(id) {
    const updated = journal.filter((t) => t.id !== id);
    setJournal(updated);
    saveJournal(updated);
  }

  const stats = journalStats(journal);
  const TrustMeta = TRUST_META[stats.trust] || TRUST_META.none;
  const TrustIcon = TrustMeta.icon;

  const visible = journal.filter((t) => filterStatus === "all" || t.status === filterStatus);

  const pct = (x) => x == null ? "—" : `${(x * 100).toFixed(0)}%`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* EXPLAINER */}
      <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BookOpen size={14} color={C.amber} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.amber, fontFamily: mono }}>PAPER TRADE JOURNAL</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: C.inkFaint, fontFamily: mono }}>AUTO-LOG CLUSTERS</span>
            <button onClick={() => setAutoLog((v) => !v)} style={{
              cursor: "pointer", width: 38, height: 20, borderRadius: 10, border: "none", outline: "none",
              background: autoLog ? C.green : C.line, position: "relative", transition: "background .2s",
            }}>
              <span style={{
                position: "absolute", top: 3, left: autoLog ? 20 : 3, width: 14, height: 14, borderRadius: 7,
                background: "#fff", transition: "left .2s",
              }} />
            </button>
            <span style={{ fontSize: 9, fontWeight: 700, color: autoLog ? C.green : C.inkFaint, fontFamily: mono }}>{autoLog ? "ON" : "OFF"}</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: C.inkDim, lineHeight: 1.65 }}>
          Log hypothesis trades here <em>before</em> touching real money. The rule is simple: paper-trade a signal for 4–6 weeks and track your discipline, not just your profit. Only if the paper record is honest and profitable do you consider going live — small, no leverage.
        </p>
        <div style={{ marginTop: 10, fontSize: 11, color: C.inkFaint }}>Each entry: the ticker, the thesis, why you're entering, where you're wrong (your stop = your invalidation made concrete), and the result. Not financial advice.</div>
      </section>

      {/* PERFORMANCE STATS */}
      {stats.nc > 0 && (
        <section style={{ background: `${TrustMeta.c}0D`, border: `1px solid ${TrustMeta.c}40`, borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <TrustIcon size={16} color={TrustMeta.c} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: TrustMeta.c, fontFamily: mono }}>{TrustMeta.label} — {stats.nc} CLOSED PAPER TRADES</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>HIT RATE</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: stats.hitRate >= 0.5 ? C.green : C.red }}>{pct(stats.hitRate)}</div></div>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>AVG RETURN</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: stats.avgReturn > 0 ? C.green : C.red }}>{stats.avgReturn != null ? `${(stats.avgReturn).toFixed(1)}%` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>EXPECTANCY %</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: stats.expectancy > 0 ? C.green : C.red }}>{stats.expectancy != null ? `${(stats.expectancy).toFixed(2)}%` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>AVG R</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: stats.avgR == null ? C.inkFaint : stats.avgR > 0 ? C.green : C.red }}>{stats.avgR != null ? `${stats.avgR.toFixed(2)}R` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>EXPECTANCY R</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: stats.expectancyR == null ? C.inkFaint : stats.expectancyR > 0 ? C.green : C.red }}>{stats.expectancyR != null ? `${stats.expectancyR.toFixed(2)}R` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2 }}>OPEN</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: C.ink }}>{stats.n - stats.nc}</div></div>
          </div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: C.inkFaint, lineHeight: 1.6 }}>
            <strong style={{ color: C.inkDim }}>R = risk units.</strong> If you risk £100 per trade, +2R = +£200 profit; −1R = −£100 loss. Expectancy R = average R earned per trade across the system. Positive = edge exists. Needs close price + stop logged to compute.
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: TrustMeta.c }}>{TrustMeta.note}</div>
        </section>
      )}

      {/* ADD NEW HYPOTHESIS */}
      <section style={{ background: C.panel, border: `1px solid ${showForm ? C.amber + "55" : C.line}`, borderRadius: 10, overflow: "hidden" }}>
        <button onClick={() => setShowForm((v) => !v)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, color: "inherit", font: "inherit", textAlign: "left" }}>
          <PlusCircle size={15} color={C.amber} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: 1.2 }}>LOG NEW HYPOTHESIS</span>
          <span style={{ marginLeft: "auto", fontSize: 18, color: C.amber, fontFamily: mono }}>{showForm ? "−" : "+"}</span>
        </button>
        {showForm && (
          <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${C.line}` }}>
            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1: ticker + thesis */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 4 }}>TICKER *</div>
                  <input value={fTicker} onChange={(e) => setFTicker(e.target.value.toUpperCase())} placeholder="e.g. COIN" style={{ width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 10px", color: C.ink, fontSize: 13, fontFamily: mono, outline: "none" }} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 4 }}>THESIS</div>
                  <select value={fThesis} onChange={(e) => setFThesis(e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 10px", color: fThesis ? C.ink : C.inkFaint, fontSize: 12, fontFamily: "inherit", outline: "none" }}>
                    <option value="">— select —</option>
                    {[...new Set(WATCHLIST.map((w) => w.thesis))].map((th) => <option key={th} value={th}>{th}</option>)}
                  </select>
                </div>
              </div>

              {/* Hypothesis text */}
              <div>
                <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 4 }}>HYPOTHESIS — explain the trade in one sentence *</div>
                <textarea value={fHypothesis} onChange={(e) => setFHypothesis(e.target.value)} placeholder="e.g. Cluster buy from 3 COIN insiders confirms tokenisation accumulation — taking a paper position at support." rows={2} style={{ width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 10px", color: C.ink, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
              </div>

              {/* Numbers row */}
              <div style={{ display: "flex", gap: 10 }}>
                {[["ENTRY PRICE", fEntry, setFEntry], ["STOP (exit-if-wrong)", fStop, setFStop], ["SIZE (shares / units)", fSize, setFSize]].map(([lbl, val, set]) => (
                  <div key={lbl} style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 4 }}>{lbl}</div>
                    <input type="number" value={val} onChange={(e) => set(e.target.value)} style={{ width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 10px", color: C.ink, fontSize: 12, fontFamily: mono, outline: "none" }} />
                  </div>
                ))}
              </div>

              {/* Invalidation */}
              <div>
                <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 4 }}>INVALIDATION — what would prove this thesis wrong?</div>
                <input value={fInvalidation} onChange={(e) => setFInvalidation(e.target.value)} placeholder="e.g. Broad indices make new highs through the IPO with no rotation visible" style={{ width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, padding: "7px 10px", color: C.ink, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                <button onClick={() => setShowForm(false)} style={{ cursor: "pointer", background: "transparent", border: `1px solid ${C.line}`, color: C.inkFaint, borderRadius: 5, padding: "8px 16px", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>Cancel</button>
                <button onClick={submitTrade} disabled={!fTicker || !fHypothesis} style={{ cursor: fTicker && fHypothesis ? "pointer" : "not-allowed", background: fTicker && fHypothesis ? `${C.amber}22` : C.line, border: `1px solid ${fTicker && fHypothesis ? C.amber + "66" : C.line}`, color: fTicker && fHypothesis ? C.amber : C.inkFaint, borderRadius: 5, padding: "8px 18px", fontSize: 11, fontWeight: 700, fontFamily: "inherit", letterSpacing: 1 }}>LOG TRADE</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* FILTER */}
      {journal.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.inkFaint, marginRight: 4 }}>SHOW:</span>
          {[["all", "All"], ["open", "Open"], ["closed", "Closed"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)} style={{ cursor: "pointer", padding: "5px 12px", fontSize: 10, fontWeight: 600, background: filterStatus === v ? `${C.amber}20` : "transparent", border: `1px solid ${filterStatus === v ? C.amber + "55" : C.line}`, color: filterStatus === v ? C.amber : C.inkFaint, borderRadius: 4, fontFamily: "inherit" }}>{l}</button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 10, color: C.inkFaint }}>{journal.length} entr{journal.length === 1 ? "y" : "ies"}</span>
        </div>
      )}

      {/* TRADE LIST */}
      {visible.length === 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "32px 24px", textAlign: "center", color: C.inkFaint, fontSize: 13 }}>
          {journal.length === 0
            ? "No hypothesis trades yet. When a cluster buy fires above, hit 'Log hypothesis' to pre-fill a trade here."
            : `No ${filterStatus} trades.`}
        </div>
      )}

      {visible.map((trade) => (
        <TradeRow key={trade.id} trade={trade} closeTrade={closeTrade} deleteTrade={deleteTrade} />
      ))}

      {/* HOUSE RULES REMINDER */}
      <div style={{ background: `${C.amber}0A`, border: `1px solid ${C.amber}28`, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}><Shield size={13} color={C.amber} /><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, color: C.amber }}>PAPER-FIRST SEQUENCING</span></div>
        <div style={{ fontSize: 11, color: C.inkFaint, lineHeight: 1.6 }}>
          <strong style={{ color: C.ink }}>Watchtower → Verify → Paper-trade 4–6 weeks → Only then live, small, unleveraged.</strong> No feature in this system places orders. Execution always stays with you. Not financial advice.
        </div>
      </div>
    </div>
  );
}

// ---------- TRADE ROW — own state for close-price input (fixes hooks-in-loop) ----------
function TradeRow({ trade, closeTrade, deleteTrade }) {
  const [closePrice, setClosePrice] = useState("");
  const isOpen = trade.status === "open";
  const resultCol = trade.result == null ? C.inkFaint : trade.result > 0 ? C.green : C.red;
  const thesisDef = SEED_THESES.find((t) => t.id === trade.thesis);
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";
  // Compute preview R-multiple in real time as user types close price
  const previewR = (() => {
    const cp = parseFloat(closePrice);
    if (!cp || !trade.entry || !trade.stop || trade.entry === trade.stop) return null;
    return ((cp - trade.entry) / (trade.entry - trade.stop)).toFixed(2);
  })();

  return (
    <section style={{ background: C.panel, border: `1px solid ${trade.autoLogged && isOpen ? C.green + "55" : isOpen ? C.amber + "33" : trade.result > 0 ? C.green + "25" : trade.result < 0 ? C.red + "25" : C.line}`, borderRadius: 10, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: C.ink }}>{trade.ticker}</span>
        {trade.autoLogged && isOpen && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.green, background: `${C.green}15`, border: `1px solid ${C.green}44`, padding: "2px 7px", borderRadius: 3 }}>AUTO-LOGGED</span>
        )}
        {isOpen ? (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: C.amber, background: `${C.amber}15`, border: `1px solid ${C.amber}44`, padding: "2px 7px", borderRadius: 3 }}>OPEN PAPER</span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: resultCol, background: `${resultCol}12`, border: `1px solid ${resultCol}40`, padding: "2px 7px", borderRadius: 3 }}>
            CLOSED · {trade.result != null ? `${trade.result > 0 ? "+" : ""}${trade.result.toFixed(1)}%` : "—"}
            {trade.rMultiple != null && <> · <span style={{ color: trade.rMultiple > 0 ? C.green : C.red }}>{trade.rMultiple > 0 ? "+" : ""}{trade.rMultiple.toFixed(2)}R</span></>}
          </span>
        )}
        {thesisDef && <span style={{ fontSize: 10, color: C.inkFaint, marginLeft: 4 }}>{thesisDef.name}</span>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.inkFaint }}>{fmtDate(trade.opened)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkDim, lineHeight: 1.5, marginBottom: 8 }}>{trade.hypothesis}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: C.inkFaint, marginBottom: 8 }}>
        {trade.entry && <span>Entry: <strong style={{ color: C.ink, fontFamily: mono }}>{trade.entry}</strong></span>}
        {trade.stop && <span>Stop: <strong style={{ color: C.red, fontFamily: mono }}>{trade.stop}</strong></span>}
        {trade.size && <span>Size: <strong style={{ color: C.ink, fontFamily: mono }}>{trade.size}</strong></span>}
        {trade.closePrice && !isOpen && <span>Closed at: <strong style={{ color: C.ink, fontFamily: mono }}>{trade.closePrice}</strong></span>}
      </div>
      {trade.autoLogged && isOpen && (trade.stop == null || trade.size == null) && (
        <div style={{ fontSize: 11, color: C.green, marginBottom: 10, padding: "8px 11px", background: `${C.green}0D`, border: `1px solid ${C.green}35`, borderRadius: 5, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={11} color={C.amber} />
          <span>Auto-logged from live cluster signal.{trade.entry ? ` Entry price fetched: ${trade.entry}.` : " Entry price not yet fetched."} <strong style={{ color: C.amber }}>Set your stop and size before this counts as a paper trade.</strong></span>
        </div>
      )}
      {trade.invalidation && (
        <div style={{ fontSize: 11, color: C.inkFaint, fontStyle: "italic", marginBottom: 10, padding: "7px 10px", background: `${C.red}09`, border: `1px solid ${C.red}20`, borderRadius: 5 }}>
          <XOctagon size={10} color={C.red} style={{ verticalAlign: "-1px", marginRight: 5 }} />
          Stand down if: {trade.invalidation}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {isOpen && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.1 }}>CLOSE PRICE</div>
              <input type="number" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder="e.g. 245.50" style={{ width: 110, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 4, padding: "5px 8px", color: C.ink, fontSize: 11, fontFamily: mono, outline: "none" }} />
            </div>
            {previewR != null && (
              <div style={{ fontSize: 11, fontFamily: mono, color: parseFloat(previewR) > 0 ? C.green : C.red, alignSelf: "flex-end", paddingBottom: 5 }}>
                → {parseFloat(previewR) > 0 ? "+" : ""}{previewR}R
              </div>
            )}
            <button onClick={() => { closeTrade(trade.id, closePrice); setClosePrice(""); }} disabled={!closePrice} style={{ cursor: closePrice ? "pointer" : "not-allowed", padding: "5px 12px", fontSize: 10, fontWeight: 700, fontFamily: "inherit", background: `${C.green}18`, border: `1px solid ${C.green}44`, color: closePrice ? C.green : C.inkFaint, borderRadius: 4, alignSelf: "flex-end", marginBottom: 1 }}>
              <CheckCircle2 size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Close
            </button>
          </>
        )}
        <button onClick={() => deleteTrade(trade.id)} style={{ marginLeft: "auto", cursor: "pointer", padding: "4px 10px", fontSize: 9.5, fontWeight: 600, fontFamily: "inherit", background: "transparent", border: `1px solid ${C.line}`, color: C.inkFaint, borderRadius: 4 }}>Delete</button>
      </div>
    </section>
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
function MacroView({ macroData, newsData, newsError, liveStatus }) {
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
        ) : newsError ? (
          <div style={{ color: C.amber, fontSize: 12 }}>Feed error: {newsError}. The proxy fetches 6 external RSS sources — one may be slow. It will retry on the next sync.</div>
        ) : liveStatus === "live" ? (
          <div style={{ color: C.inkFaint, fontSize: 12 }}>Loading intelligence feed… (fetching 6 sources, may take 10–20s)</div>
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
  const [priceErr, setPriceErr] = useState(null);

  async function loadReal(ticker) {
    if (!PROXY_URL || !ticker) return;
    setLoadingReal(true); setPriceErr(null); setRealBars(null); setRealTicker(ticker);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000); // 20s timeout
      const r = await fetch(`${PROXY_URL}/api/prices?ticker=${ticker}&days=400`, { signal: ctrl.signal });
      clearTimeout(timer);
      const j = await r.json();
      if (j.data?.length) { setRealBars(j.data); setPriceErr(null); }
      else setPriceErr(`No price data for ${ticker} — not all tickers are available from the price source.`);
    } catch (e) {
      setPriceErr(e.name === "AbortError" ? `Timed out loading ${ticker} — try again.` : `Error: ${e.message}`);
    }
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
      {realBars && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: `${C.violet}12`, border: `1px solid ${C.violet}33`, borderRadius: 6, fontSize: 11, color: C.inkDim }}>
          Running on <strong style={{ color: C.green }}>{realBars.length} days of real {realTicker} prices</strong> — SMA baseline only (insider cluster signal needs real disclosure dates). Press <strong>synthetic</strong> below to use the signal/edge/draw controls.
        </div>
      )}
      {/* Synthetic controls — greyed when real prices are loaded (they're irrelevant in that mode) */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14, opacity: realBars ? 0.3 : 1, pointerEvents: realBars ? "none" : "auto", transition: "opacity .2s" }}>
        <div>
          <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>SIGNAL</div>
          <Toggle opts={[["insiderCluster", "Insider cluster"], ["smaCross", "Dumb baseline"]]} val={signal} set={setSignal} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>HISTORY HAS REAL EDGE?</div>
          <Toggle opts={[[true, "Yes — signal has predictive power"], [false, "No (pure noise)"]]} val={hasEdge} set={setHasEdge} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 5 }}>RESAMPLE</div>
          <button onClick={() => setSeed((s) => s + 7)} style={{ cursor: "pointer", padding: "7px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 5, display: "flex", alignItems: "center", gap: 6 }}>
            <Repeat size={12} /> New draw
          </button>
        </div>
      </div>

      {/* Real price source — ALWAYS interactive, never locked behind the greyed zone */}
      {PROXY_URL && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: C.panelHi, borderRadius: 7, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 9, color: C.inkFaint, letterSpacing: 1.2, marginBottom: 8 }}>
            REAL PRICES — select a ticker to run the backtest on actual market data
            {realBars && <span style={{ marginLeft: 10, color: C.green }}>▸ {realTicker} loaded ({realBars.length} days)</span>}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            {WATCHLIST.filter((w) => w.type === "equity" || w.type === "etf").map((w) => (
              <button key={w.ticker} onClick={() => loadReal(w.ticker)} disabled={loadingReal}
                title={w.name}
                style={{
                  cursor: loadingReal ? "wait" : "pointer",
                  padding: "5px 9px", fontSize: 10, fontWeight: 700, fontFamily: mono,
                  background: realTicker === w.ticker && realBars ? `${C.green}22` : realTicker === w.ticker && loadingReal ? `${C.amber}15` : "transparent",
                  color: realTicker === w.ticker && realBars ? C.green : realTicker === w.ticker && loadingReal ? C.amber : C.inkDim,
                  border: `1px solid ${realTicker === w.ticker && realBars ? C.green + "55" : realTicker === w.ticker && loadingReal ? C.amber + "55" : C.line}`,
                  borderRadius: 5,
                }}>
                {loadingReal && realTicker === w.ticker ? "…" : w.ticker}
              </button>
            ))}
            {/* Synthetic button is OUTSIDE the greyed controls div — always clickable */}
            {realBars && (
              <button onClick={() => { setRealBars(null); setRealTicker(""); setPriceErr(null); }}
                style={{ cursor: "pointer", padding: "5px 12px", fontSize: 10, fontWeight: 700, color: C.amber, background: `${C.amber}12`, border: `1px solid ${C.amber}44`, borderRadius: 5 }}>
                ← synthetic
              </button>
            )}
          </div>
          {loadingReal && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.amber }}>
              <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} />
              Loading {realTicker} price history from proxy… (5–10 seconds, proxy may be warming up)
            </div>
          )}
          {!loadingReal && priceErr && <div style={{ marginTop: 6, fontSize: 10, color: C.amber }}>{priceErr}</div>}
        </div>
      )}

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

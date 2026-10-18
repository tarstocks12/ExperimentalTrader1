import {
  Candle,
  calcEMA,
  calcWMA,
  calcWaveTrend
} from "./pine-math.js";
import { DEFAULT_PERSONAL_SYMBOLS, FNO_SYMBOLS_LIST } from "../data/watchlists.js";

export interface HistoricalPickRecord {
  rank: number;
  symbol: string;
  prediction: "BULL" | "BEAR";
  actualOutcome: boolean;
  pnlPercent: number;
  signalScore?: number;
  indicators: {
    hmaFired: boolean;
    stFired: boolean;
    wtFired: boolean;
    tsiFired: boolean;
    htfFired: boolean;
  };
}

export interface HistoricalAuditDayEntry {
  date: string;
  signalDate?: string;
  type: "Trend" | "Reversal";
  isGenuineWalkForward?: boolean;
  bullishPicks: HistoricalPickRecord[];
  bearishPicks: HistoricalPickRecord[];
}

export const INITIAL_MWUA_WEIGHTS = {
  trend: {
    hmaWeight: 20,
    stWeight: 20,
    wtBase: 15,
    wtZero: 5,
    wtExtreme: 5,
    tsiBase: 15,
    tsiZero: 5,
    htfWt: 10,
    htfSt: 10,
    htfHma: 10,
    htfGc: 10,
    crossBonus: 10
  },
  reversal: {
    wtDeep: 20,
    wtSevere: 20,
    wtCross: 30,
    tsiDeep: 15,
    tsiSevere: 15,
    tsiCross: 20,
    stFlip: 15,
    hmaShift: 20,
    htfDiv: 15,
    baseMomentum: 15
  }
};

const INDEX_SCALE_MAP: Record<string, number> = {
  NIFTY: 100,
  BANKNIFTY: 100,
  CNXFINANCE: 1000,
  FINNIFTY: 1000,
  NIFTY_MID_SELECT: 100,
  MIDCPNIFTY: 100,
  NIFTYNXT50: 100
};

export function getAuditScaleFactor(symbol: string): number {
  const clean = symbol.replace(/1!$/, "").trim().toUpperCase();
  return INDEX_SCALE_MAP[clean] || 1;
}

export function getAuditYahooTicker(symbol: string): string {
  let clean = symbol.replace(/1!$/, "").trim().toUpperCase();
  if (clean === "NIFTY") return "NIFTYBEES.NS";
  if (clean === "BANKNIFTY") return "BANKBEES.NS";
  if (clean === "CNXFINANCE" || clean === "FINNIFTY") return "BFSI.NS";
  if (clean === "NIFTY_MID_SELECT" || clean === "MIDCPNIFTY") return "MID150BEES.NS";
  if (clean === "NIFTYNXT50") return "JUNIORBEES.NS";
  clean = clean.replace(/_/g, "-");
  return `${clean}.NS`;
}

function calcHMASeries(src: number[], len: number): number[] {
  const halfLen = Math.floor(len / 2);
  const sqrtLen = Math.round(Math.sqrt(len));
  const wmaHalf = calcWMA(src, halfLen || 1);
  const wmaFull = calcWMA(src, len);
  const diff: number[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    diff[i] = 2 * wmaHalf[i] - wmaFull[i];
  }
  return calcWMA(diff, sqrtLen || 1);
}

function calcRawTsiSeries(closePrices: number[]): { rawTsi: number[]; rawTsiSig: number[] } {
  const n = closePrices.length;
  const pc: number[] = [0];
  const apc: number[] = [0];
  for (let i = 1; i < n; i++) {
    const diff = (closePrices[i] ?? 0) - (closePrices[i - 1] ?? 0);
    pc.push(diff);
    apc.push(Math.abs(diff));
  }
  const pcEmaLong = calcEMA(pc, 25);
  const pcEmaDouble = calcEMA(pcEmaLong, 13);
  const apcEmaLong = calcEMA(apc, 25);
  const apcEmaDouble = calcEMA(apcEmaLong, 13);
  const rawTsi: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const denom = apcEmaDouble[i] ?? 0;
    rawTsi[i] = denom === 0 ? 0 : 100 * ((pcEmaDouble[i] ?? 0) / denom);
  }
  const rawTsiSig = calcEMA(rawTsi, 13);
  return { rawTsi, rawTsiSig };
}

function calcSupertrendDirSeries(candles: Candle[], atrPeriod = 10, factor = 3.0): { dir: number[]; os_val: number[] } {
  const n = candles.length;
  if (n === 0) return { dir: [], os_val: [] };

  const tr: number[] = new Array(n);
  const hl2: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const closePrev = i > 0 ? candles[i - 1].close : candles[i].close;
    hl2[i] = (high + low) / 2;
    tr[i] = Math.max(high - low, Math.abs(high - closePrev), Math.abs(low - closePrev));
  }

  const atr: number[] = new Array(n);
  let sumTR = 0;
  for (let i = 0; i < n; i++) {
    if (i < atrPeriod) {
      sumTR += tr[i];
      atr[i] = sumTR / (i + 1);
    } else {
      atr[i] = (atr[i - 1] * (atrPeriod - 1) + tr[i]) / atrPeriod;
    }
  }

  const upperBand: number[] = new Array(n);
  const lowerBand: number[] = new Array(n);
  const os_val: number[] = new Array(n);
  const dir: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const src = candles[i].close;
    const bandWidth = atr[i] * factor;
    const up = hl2[i] + bandWidth;
    const dn = hl2[i] - bandWidth;

    if (i === 0) {
      upperBand[0] = up;
      lowerBand[0] = dn;
      os_val[0] = src > upperBand[0] ? 1 : 0;
      dir[0] = os_val[0] === 1 ? 1 : -1;
      continue;
    }

    const srcPrev = candles[i - 1].close;
    const upperPrev = upperBand[i - 1];
    const lowerPrev = lowerBand[i - 1];

    upperBand[i] = srcPrev < upperPrev ? Math.min(up, upperPrev) : up;
    lowerBand[i] = srcPrev > lowerPrev ? Math.max(dn, lowerPrev) : dn;

    if (src > upperBand[i]) {
      os_val[i] = 1;
    } else if (src < lowerBand[i]) {
      os_val[i] = 0;
    } else {
      os_val[i] = os_val[i - 1];
    }
    dir[i] = os_val[i] === 1 ? 1 : -1;
  }

  return { dir, os_val };
}

interface PrecomputedSymbolSeries {
  symbol: string;
  dailyCandles: Candle[];
  dateIndexMap: Map<string, number>;
  wt1: number[];
  wt2: number[];
  hmaOpen: number[];
  hmaClose: number[];
  stDir: number[];
  scaledTsi: number[];
  scaledTsiSig: number[];
  weeklyCandles: Candle[];
  wWt1: number[];
  wWt2: number[];
  wHmaOpen: number[];
  wHmaClose: number[];
  wStDir: number[];
  wRawTsi: number[];
  wRawTsiSig: number[];
}

async function fetchYahooCandlesForAudit(symbol: string, interval: "1d" | "1wk", range: string): Promise<Candle[]> {
  const ticker = getAuditYahooTicker(symbol);
  const scaleFactor = getAuditScaleFactor(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!res.ok) return [];

  const data: any = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i] ?? 0;
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({
      time: timestamps[i] * 1000,
      open: o * scaleFactor,
      high: h * scaleFactor,
      low: l * scaleFactor,
      close: c * scaleFactor,
      volume: v
    });
  }
  return candles;
}

function formatDateIST(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ms));
}

async function precomputeSymbol(symbol: string): Promise<PrecomputedSymbolSeries | null> {
  try {
    const [dailyCandles, weeklyCandles] = await Promise.all([
      fetchYahooCandlesForAudit(symbol, "1d", "1y"),
      fetchYahooCandlesForAudit(symbol, "1wk", "3y")
    ]);

    if (dailyCandles.length < 65 || weeklyCandles.length < 15) {
      return null;
    }

    const n = dailyCandles.length;
    const opens = dailyCandles.map(c => c.open);
    const highs = dailyCandles.map(c => c.high);
    const lows = dailyCandles.map(c => c.low);
    const closes = dailyCandles.map(c => c.close);

    const dateIndexMap = new Map<string, number>();
    dailyCandles.forEach((c, idx) => {
      dateIndexMap.set(formatDateIST(c.time), idx);
    });

    const wt = calcWaveTrend(highs, lows, closes, 7, 18);
    const hmaOpen = calcHMASeries(opens, 21);
    const hmaClose = calcHMASeries(closes, 21);
    const st = calcSupertrendDirSeries(dailyCandles, 10, 3.0);
    const { rawTsi, rawTsiSig } = calcRawTsiSeries(closes);

    const scaledTsi: number[] = new Array(n);
    const scaledTsiSig: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const startIdx = Math.max(0, i - 100 + 1);
      let tsiMax = -Infinity, tsiMin = Infinity, wtMax = -Infinity, wtMin = Infinity;
      for (let j = startIdx; j <= i; j++) {
        const rT = rawTsi[j] ?? 0;
        const w1 = wt.wt1[j] ?? 0;
        if (rT > tsiMax) tsiMax = rT;
        if (rT < tsiMin) tsiMin = rT;
        if (w1 > wtMax) wtMax = w1;
        if (w1 < wtMin) wtMin = w1;
      }
      const tsiRange = (tsiMax - tsiMin) === 0 ? 1 : (tsiMax - tsiMin);
      const wtRange = (wtMax - wtMin) === 0 ? 1 : (wtMax - wtMin);
      const ratio = wtRange / tsiRange;
      scaledTsi[i] = (rawTsi[i] ?? 0) * ratio;
      scaledTsiSig[i] = (rawTsiSig[i] ?? 0) * ratio;
    }

    const wOpens = weeklyCandles.map(c => c.open);
    const wHighs = weeklyCandles.map(c => c.high);
    const wLows = weeklyCandles.map(c => c.low);
    const wCloses = weeklyCandles.map(c => c.close);

    const wWt = calcWaveTrend(wHighs, wLows, wCloses, 7, 18);
    const wHmaOpen = calcHMASeries(wOpens, 21);
    const wHmaClose = calcHMASeries(wCloses, 21);
    const wSt = calcSupertrendDirSeries(weeklyCandles, 10, 3.0);
    const { rawTsi: wRawTsi, rawTsiSig: wRawTsiSig } = calcRawTsiSeries(wCloses);

    return {
      symbol,
      dailyCandles,
      dateIndexMap,
      wt1: wt.wt1,
      wt2: wt.wt2,
      hmaOpen,
      hmaClose,
      stDir: st.dir,
      scaledTsi,
      scaledTsiSig,
      weeklyCandles,
      wWt1: wWt.wt1,
      wWt2: wWt.wt2,
      wHmaOpen,
      wHmaClose,
      wStDir: wSt.dir,
      wRawTsi,
      wRawTsiSig
    };
  } catch {
    return null;
  }
}

/**
 * Evaluates a symbol's exact indicator state at daily bar index `idx` (strictly using data <= `idx`).
 */
function evaluateSymbolAtBarIndex(
  s: PrecomputedSymbolSeries,
  idx: number,
  weights: typeof INITIAL_MWUA_WEIGHTS
) {
  const wt1 = s.wt1[idx] ?? 0;
  const wt2 = s.wt2[idx] ?? 0;
  const isBull = wt1 > wt2;
  const isBear = wt1 < wt2;

  let barsSinceCross = 1;
  for (let k = idx - 1; k >= 0; k--) {
    const stateAtK = (s.wt1[k] ?? 0) > (s.wt2[k] ?? 0);
    if (stateAtK === isBull) barsSinceCross++;
    else break;
  }

  const isStBull = s.stDir[idx] === 1;
  const isStBear = s.stDir[idx] === -1;

  const hmaIsBull = (s.hmaClose[idx] ?? 0) > (s.hmaOpen[idx] ?? 0);
  const hmaIsBear = (s.hmaClose[idx] ?? 0) < (s.hmaOpen[idx] ?? 0);

  const scaledTsi = s.scaledTsi[idx] ?? 0;
  const scaledTsiSig = s.scaledTsiSig[idx] ?? 0;
  const isTsiBull = scaledTsi > scaledTsiSig;
  const isTsiBear = scaledTsi < scaledTsiSig;

  // Map weekly HTF strictly up to dailyCandles[idx].time (zero lookahead bias)
  const dailyTime = s.dailyCandles[idx].time;
  let wIdx = 0;
  for (let w = 0; w < s.weeklyCandles.length; w++) {
    if (s.weeklyCandles[w].time <= dailyTime) {
      wIdx = w;
    } else {
      break;
    }
  }

  const screenerH1b = (s.wWt1[wIdx] ?? 0) > (s.wWt2[wIdx] ?? 0);
  const screenerH1s = (s.wWt1[wIdx] ?? 0) < (s.wWt2[wIdx] ?? 0);
  const isStHtf1Bull = s.wStDir[wIdx] === 1;
  const isStHtf1Bear = s.wStDir[wIdx] === -1;
  const screenerHmaHtf1b = (s.wHmaClose[wIdx] ?? 0) > (s.wHmaOpen[wIdx] ?? 0);
  const screenerHmaHtf1s = (s.wHmaClose[wIdx] ?? 0) < (s.wHmaOpen[wIdx] ?? 0);
  const screenerGcb = (s.wRawTsi[wIdx] ?? 0) > (s.wRawTsiSig[wIdx] ?? 0);
  const screenerGcs = (s.wRawTsi[wIdx] ?? 0) < (s.wRawTsiSig[wIdx] ?? 0);

  let bull = 0;
  let bear = 0;
  let revBull = 0;
  let revBear = 0;

  // Exact MWUA Trend Scoring
  if (isBull) bull += weights.trend.wtBase;
  if (isBear) bear += weights.trend.wtBase;
  if (wt1 > 0) bull += weights.trend.wtZero;
  if (wt1 > 40) bull += weights.trend.wtExtreme;
  if (wt1 < 0) bear += weights.trend.wtZero;
  if (wt1 < -40) bear += weights.trend.wtExtreme;

  if (isStBull) bull += weights.trend.stWeight;
  if (isStBear) bear += weights.trend.stWeight;

  if (hmaIsBull) bull += weights.trend.hmaWeight;
  if (hmaIsBear) bear += weights.trend.hmaWeight;

  if (isTsiBull) bull += weights.trend.tsiBase;
  if (isTsiBear) bear += weights.trend.tsiBase;
  if (scaledTsi > 0) bull += weights.trend.tsiZero;
  if (scaledTsi < 0) bear += weights.trend.tsiZero;

  if (screenerH1b) bull += weights.trend.htfWt;
  if (screenerH1s) bear += weights.trend.htfWt;
  if (isStHtf1Bull) bull += weights.trend.htfSt;
  if (isStHtf1Bear) bear += weights.trend.htfSt;
  if (screenerHmaHtf1b) bull += weights.trend.htfHma;
  if (screenerHmaHtf1s) bear += weights.trend.htfHma;
  if (screenerGcb) bull += weights.trend.htfGc;
  if (screenerGcs) bear += weights.trend.htfGc;

  if (isBull && barsSinceCross < 3) bull += weights.trend.crossBonus;
  if (isBear && barsSinceCross < 3) bear += weights.trend.crossBonus;

  // Exact MWUA Reversal Scoring
  if (wt1 < -40) revBull += weights.reversal.wtDeep;
  if (wt1 < -50) revBull += weights.reversal.wtSevere;
  if (isBull && wt1 < -30) revBull += weights.reversal.wtCross;
  if (wt1 > 40) revBear += weights.reversal.wtDeep;
  if (wt1 > 50) revBear += weights.reversal.wtSevere;
  if (isBear && wt1 > 30) revBear += weights.reversal.wtCross;

  if (isStBull && barsSinceCross < 5 && wt1 < 0) revBull += weights.reversal.stFlip;
  if (isStBear && barsSinceCross < 5 && wt1 > 0) revBear += weights.reversal.stFlip;

  if (hmaIsBull && wt1 < -20) revBull += weights.reversal.hmaShift;
  if (hmaIsBear && wt1 > 20) revBear += weights.reversal.hmaShift;

  if (scaledTsi < -40) revBull += weights.reversal.tsiDeep;
  if (scaledTsi < -50) revBull += weights.reversal.tsiSevere;
  if (isTsiBull && scaledTsi < -30) revBull += weights.reversal.tsiCross;
  if (scaledTsi > 40) revBear += weights.reversal.tsiDeep;
  if (scaledTsi > 50) revBear += weights.reversal.tsiSevere;
  if (isTsiBear && scaledTsi > 30) revBear += weights.reversal.tsiCross;

  if (screenerH1b && isBull && wt1 < 0) revBull += weights.reversal.htfDiv;
  if (screenerH1s && isBear && wt1 > 0) revBear += weights.reversal.htfDiv;

  // Deterministic tie-breaker based on oscillator magnitude so Top 10 ranking is 100% deterministic
  const bullTieBreaker = Math.min(0.99, Math.max(0, (wt1 + 100) / 250));
  const bearTieBreaker = Math.min(0.99, Math.max(0, (100 - wt1) / 250));
  const revBullTieBreaker = Math.min(0.99, Math.max(0, Math.abs(Math.min(0, wt1)) / 100));
  const revBearTieBreaker = Math.min(0.99, Math.max(0, Math.max(0, wt1) / 100));

  return {
    symbol: s.symbol,
    bullScore: bull + bullTieBreaker,
    bearScore: bear + bearTieBreaker,
    reversalBullScore: revBull + revBullTieBreaker,
    reversalBearScore: revBear + revBearTieBreaker,
    bullIndicators: {
      hmaFired: hmaIsBull,
      stFired: isStBull,
      wtFired: isBull,
      tsiFired: isTsiBull,
      htfFired: screenerH1b || isStHtf1Bull || screenerHmaHtf1b
    },
    bearIndicators: {
      hmaFired: hmaIsBear,
      stFired: isStBear,
      wtFired: isBear,
      tsiFired: isTsiBear,
      htfFired: screenerH1s || isStHtf1Bear || screenerHmaHtf1s
    }
  };
}

function updateWeightsFromDayEntry(
  weights: typeof INITIAL_MWUA_WEIGHTS,
  entry: HistoricalAuditDayEntry,
  learningRate = 0.08
) {
  const stats = {
    hma: { f: 0, e: 0 },
    st: { f: 0, e: 0 },
    wt: { f: 0, e: 0 },
    tsi: { f: 0, e: 0 },
    htf: { f: 0, e: 0 }
  };
  const allPicks = [...entry.bullishPicks, ...entry.bearishPicks];
  for (const pick of allPicks) {
    const isWrong = !pick.actualOutcome;
    if (pick.indicators.hmaFired) { stats.hma.f++; if (isWrong) stats.hma.e++; }
    if (pick.indicators.stFired) { stats.st.f++; if (isWrong) stats.st.e++; }
    if (pick.indicators.wtFired) { stats.wt.f++; if (isWrong) stats.wt.e++; }
    if (pick.indicators.tsiFired) { stats.tsi.f++; if (isWrong) stats.tsi.e++; }
    if (pick.indicators.htfFired) { stats.htf.f++; if (isWrong) stats.htf.e++; }
  }

  const getMult = (f: number, e: number) => Math.exp(-learningRate * (f > 0 ? e / f : 0));
  const mults = {
    hma: getMult(stats.hma.f, stats.hma.e),
    st: getMult(stats.st.f, stats.st.e),
    wt: getMult(stats.wt.f, stats.wt.e),
    tsi: getMult(stats.tsi.f, stats.tsi.e),
    htf: getMult(stats.htf.f, stats.htf.e)
  };

  if (entry.type === "Trend") {
    weights.trend.hmaWeight *= mults.hma;
    weights.trend.stWeight *= mults.st;
    weights.trend.wtBase *= mults.wt;
    weights.trend.wtZero *= mults.wt;
    weights.trend.wtExtreme *= mults.wt;
    weights.trend.tsiBase *= mults.tsi;
    weights.trend.tsiZero *= mults.tsi;
    weights.trend.htfWt *= mults.htf;
    weights.trend.htfSt *= mults.htf;
    weights.trend.htfHma *= mults.htf;
    weights.trend.htfGc *= mults.htf;

    const sum = Object.values(weights.trend).reduce((a, b) => a + b, 0) || 135;
    const ratio = 135 / sum;
    for (const k of Object.keys(weights.trend) as (keyof typeof weights.trend)[]) {
      weights.trend[k] = Math.round(weights.trend[k] * ratio);
    }
  } else {
    weights.reversal.wtDeep *= mults.wt;
    weights.reversal.wtSevere *= mults.wt;
    weights.reversal.wtCross *= mults.wt;
    weights.reversal.tsiDeep *= mults.tsi;
    weights.reversal.tsiSevere *= mults.tsi;
    weights.reversal.tsiCross *= mults.tsi;
    weights.reversal.stFlip *= mults.st;
    weights.reversal.hmaShift *= mults.hma;
    weights.reversal.htfDiv *= mults.htf;

    const sum = Object.values(weights.reversal).reduce((a, b) => a + b, 0) || 185;
    const ratio = 185 / sum;
    for (const k of Object.keys(weights.reversal) as (keyof typeof weights.reversal)[]) {
      weights.reversal[k] = Math.round(weights.reversal[k] * ratio);
    }
  }
}

/**
 * Generates or incrementally updates genuine walk-forward 50-Day Audit Log entries
 * using real Yahoo Finance OHLCV candles and exact Pine Script indicator math.
 */
export async function computeGenuineWalkForwardAudit(
  candidateSymbols?: string[],
  existingEntries: HistoricalAuditDayEntry[] = [],
  targetDaysCount = 50
): Promise<HistoricalAuditDayEntry[]> {
  const rawUniverse =
    candidateSymbols && candidateSymbols.length >= 20
      ? candidateSymbols.slice(0, 65)
      : DEFAULT_PERSONAL_SYMBOLS.slice(0, 65);

  const precomputedList: PrecomputedSymbolSeries[] = [];
  const batchSize = 15;
  for (let i = 0; i < rawUniverse.length; i += batchSize) {
    const chunk = rawUniverse.slice(i, i + batchSize);
    const res = await Promise.all(chunk.map(sym => precomputeSymbol(sym)));
    for (const item of res) {
      if (item) precomputedList.push(item);
    }
  }

  if (precomputedList.length === 0) {
    return existingEntries;
  }

  // Build canonical sorted list of trading dates from the most liquid benchmark symbol (e.g. RELIANCE or first valid)
  const refSeries =
    precomputedList.find(p => p.symbol === "RELIANCE") ||
    precomputedList.find(p => p.symbol === "HDFCBANK") ||
    precomputedList[0];

  const allDates = refSeries.dailyCandles.map(c => formatDateIST(c.time));
  const sliceStart = Math.max(40, allDates.length - (targetDaysCount + 1));
  const windowDates = allDates.slice(sliceStart);

  // Index existing verified walk-forward entries so they are permanently retained across updates
  const existingMap = new Map<string, HistoricalAuditDayEntry>();
  for (const entry of existingEntries) {
    if (entry && entry.date && entry.type && entry.isGenuineWalkForward) {
      existingMap.set(`${entry.date}_${entry.type}`, entry);
    }
  }

  const weights: typeof INITIAL_MWUA_WEIGHTS = JSON.parse(JSON.stringify(INITIAL_MWUA_WEIGHTS));
  const outputEntries: HistoricalAuditDayEntry[] = [];

  for (let i = 0; i < windowDates.length - 1; i++) {
    const signalDate = windowDates[i];
    const outcomeDate = windowDates[i + 1];

    const existingTrend = existingMap.get(`${outcomeDate}_Trend`);
    const existingRev = existingMap.get(`${outcomeDate}_Reversal`);

    if (existingTrend && existingRev) {
      outputEntries.push(existingTrend);
      outputEntries.push(existingRev);
      updateWeightsFromDayEntry(weights, existingTrend);
      updateWeightsFromDayEntry(weights, existingRev);
      continue;
    }

    // Evaluate all symbols on `signalDate` (day T) and compute actual return on `outcomeDate` (day T+1)
    const dayEvaluations: Array<
      ReturnType<typeof evaluateSymbolAtBarIndex> & { actualNextDayReturnPct: number }
    > = [];

    for (const s of precomputedList) {
      const idxT = s.dateIndexMap.get(signalDate);
      const idxNext = s.dateIndexMap.get(outcomeDate);
      if (idxT === undefined || idxNext === undefined || idxT < 30) continue;

      const closeT = s.dailyCandles[idxT]?.close;
      const closeNext = s.dailyCandles[idxNext]?.close;
      if (!closeT || !closeNext) continue;

      const actualNextDayReturnPct = ((closeNext - closeT) / closeT) * 100;
      const evalAtT = evaluateSymbolAtBarIndex(s, idxT, weights);
      dayEvaluations.push({
        ...evalAtT,
        actualNextDayReturnPct
      });
    }

    if (dayEvaluations.length < 5) continue;

    const buildPickList = (
      sorted: typeof dayEvaluations,
      pred: "BULL" | "BEAR",
      mode: "Trend" | "Reversal"
    ): HistoricalPickRecord[] => {
      return sorted.slice(0, 10).map((item, idx) => {
        const pnl = Number(item.actualNextDayReturnPct.toFixed(2));
        const isWin = pred === "BULL" ? pnl > 0 : pnl < 0;
        const rawScore =
          mode === "Trend"
            ? pred === "BULL"
              ? Math.round(item.bullScore)
              : Math.round(item.bearScore)
            : pred === "BULL"
            ? Math.round(item.reversalBullScore)
            : Math.round(item.reversalBearScore);

        return {
          rank: idx + 1,
          symbol: item.symbol,
          prediction: pred,
          actualOutcome: isWin,
          pnlPercent: pnl,
          signalScore: rawScore,
          indicators: pred === "BULL" ? item.bullIndicators : item.bearIndicators
        };
      });
    };

    const trendBullSorted = [...dayEvaluations].sort((a, b) => b.bullScore - a.bullScore);
    const trendBearSorted = [...dayEvaluations].sort((a, b) => b.bearScore - a.bearScore);
    const revBullSorted = [...dayEvaluations].sort((a, b) => b.reversalBullScore - a.reversalBullScore);
    const revBearSorted = [...dayEvaluations].sort((a, b) => b.reversalBearScore - a.reversalBearScore);

    const trendEntry: HistoricalAuditDayEntry = existingTrend || {
      date: outcomeDate,
      signalDate,
      type: "Trend",
      isGenuineWalkForward: true,
      bullishPicks: buildPickList(trendBullSorted, "BULL", "Trend"),
      bearishPicks: buildPickList(trendBearSorted, "BEAR", "Trend")
    };

    const revEntry: HistoricalAuditDayEntry = existingRev || {
      date: outcomeDate,
      signalDate,
      type: "Reversal",
      isGenuineWalkForward: true,
      bullishPicks: buildPickList(revBullSorted, "BULL", "Reversal"),
      bearishPicks: buildPickList(revBearSorted, "BEAR", "Reversal")
    };

    outputEntries.push(trendEntry);
    outputEntries.push(revEntry);

    updateWeightsFromDayEntry(weights, trendEntry);
    updateWeightsFromDayEntry(weights, revEntry);
  }

  // Also preserve any manually finalized EOD entries whose date is newer than windowDates
  for (const [key, entry] of existingMap.entries()) {
    const alreadyIncluded = outputEntries.some(o => `${o.date}_${o.type}` === key);
    if (!alreadyIncluded) {
      outputEntries.push(entry);
    }
  }

  outputEntries.sort((a, b) => a.date.localeCompare(b.date));
  return outputEntries;
}

/**
 * Merges multiple audit log arrays (e.g., compiled baseline + disk archive + client vault)
 * deduplicating by `${date}_${type}` while strictly preferring genuine walk-forward records
 * over legacy placeholder records.
 */
export function mergeVerifiedAuditLogs(
  ...sources: (HistoricalAuditDayEntry[] | undefined | null)[]
): HistoricalAuditDayEntry[] {
  const merged = new Map<string, HistoricalAuditDayEntry>();

  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const entry of src) {
      if (!entry || !entry.date || !entry.type) continue;
      // Only accept entries that are marked genuine walk-forward (reject legacy random seed)
      if (!entry.isGenuineWalkForward) continue;

      const key = `${entry.date}_${entry.type}`;
      const existing = merged.get(key);
      if (!existing || (entry.bullishPicks?.length || 0) >= (existing.bullishPicks?.length || 0)) {
        merged.set(key, entry);
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

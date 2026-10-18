import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ExternalLink,
  BrainCircuit,
  Activity,
  BarChart2,
  Search,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { Timeframe } from '../types';
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from '../data/watchlists';
import {
  LAYA_QUANT_QUESTIONS_SCHEMA,
  LayaCalibrationReport,
  LayaDecisionOutput,
  evaluateLayaSystemOne,
  fitLayaCalibrationFromHistory,
  runLayaTournament,
  computeD1ToD4CombinedLaya
} from '../lib/laya-engine';
import { LayaIntelCell } from './LayaIntelCell';
import { VERIFIED_AUDIT_BASELINE } from '../data/verified-audit-baseline';
import { mergeVerifiedAuditLogs, HistoricalAuditDayEntry } from '../lib/walk-forward-audit';

const AUDIT_VAULT_STORAGE_KEY = "quant_swt_verified_audit_vault_v2";

function loadClientAuditVault(): HistoricalAuditDayEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return mergeVerifiedAuditLogs(VERIFIED_AUDIT_BASELINE, parsed);
      }
    }
  } catch {}
  return [...VERIFIED_AUDIT_BASELINE];
}

function saveClientAuditVault(entries: HistoricalAuditDayEntry[]) {
  try {
    const merged = mergeVerifiedAuditLogs(VERIFIED_AUDIT_BASELINE, entries);
    localStorage.setItem(AUDIT_VAULT_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return entries;
  }
}

interface MWUAWeights {
  trend: {
    hmaWeight: number; stWeight: number; wtBase: number; wtZero: number; wtExtreme: number;
    tsiBase: number; tsiZero: number; htfWt: number; htfSt: number; htfHma: number; htfGc: number; crossBonus: number;
  };
  reversal: {
    wtDeep: number; wtSevere: number; wtCross: number; tsiDeep: number; tsiSevere: number; tsiCross: number;
    stFlip: number; hmaShift: number; htfDiv: number; baseMomentum: number;
  };
}

interface SmartRow {
  symbol: string;
  bullScore: number;
  bearScore: number;
  reversalBullScore: number;
  reversalBearScore: number;
  tfData: any;
  fullRow?: any;
  layaBull?: LayaDecisionOutput;
  layaBear?: LayaDecisionOutput;
}

const REGIME_LABELS: Record<string, string> = {
  trend_continuation: "Trend Continuation",
  pullback_continuation: "Pullback Continuation",
  climax_reversal: "Climax Reversal",
  chop_avoid: "Chop / Avoid"
};

export default function NextDaySmartDashboard({ personalSymbols = [] }: { personalSymbols?: string[] }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eodStatusBanner, setEodStatusBanner] = useState<string | null>(null);

  const [weights, setWeights] = useState<MWUAWeights | null>(null);
  const [layaCalibration, setLayaCalibration] = useState<LayaCalibrationReport | null>(null);
  const [serverLayaMap, setServerLayaMap] = useState<Record<string, LayaDecisionOutput>>({});
  const [layaBatchLatencyMs, setLayaBatchLatencyMs] = useState<number>(0);

  const [auditLogs, setAuditLogs] = useState<HistoricalAuditDayEntry[]>(() => {
    const vault = loadClientAuditVault();
    return [...vault].reverse();
  });
  const [selectedAuditIdx, setSelectedAuditIdx] = useState<number>(0);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});

  const [viewMode, setViewMode] = useState<"reversal" | "trend">("reversal");
  const [watchlistFilter, setWatchlistFilter] = useState("FNO");
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");
  const [sortMode, setSortMode] = useState<"hybrid" | "mwua" | "laya" | "live">("hybrid");
  const [tournamentOnly, setTournamentOnly] = useState<boolean>(false);
  const [inspectedDecision, setInspectedDecision] = useState<LayaDecisionOutput | null>(null);

  const [auditSearchSymbol, setAuditSearchSymbol] = useState("");
  const [minStreakDays, setMinStreakDays] = useState<number>(1);

  const TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H", "1D", "1W"];

  const getTradingViewUrl = (symbol: string) => {
    let formattedSymbol = symbol;
    if (symbol === "NIFTY") formattedSymbol = "NIFTY";
    else if (symbol === "BANKNIFTY") formattedSymbol = "BANKNIFTY";
    else if (symbol === "CNXFINANCE") formattedSymbol = "CNXFINANCE";
    else formattedSymbol = symbol.replace("_", "-");
    return `https://www.tradingview.com/chart/?symbol=NSE:${formattedSymbol}`;
  };

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(log => viewMode === "trend" ? log.type === "Trend" : log.type === "Reversal");
  }, [auditLogs, viewMode]);

  const overArchingMetrics = useMemo(() => {
    let bullWins = 0, bullTotal = 0, bullPnL = 0;
    let bearWins = 0, bearTotal = 0, bearPnL = 0;
    filteredAuditLogs.forEach(log => {
      log.bullishPicks?.forEach((p: any) => {
        bullTotal++;
        if (p.actualOutcome) bullWins++;
        bullPnL += p.pnlPercent || 0;
      });
      log.bearishPicks?.forEach((p: any) => {
        bearTotal++;
        if (p.actualOutcome) bearWins++;
        bearPnL += p.pnlPercent || 0;
      });
    });
    return {
      bullWinRate: bullTotal ? Math.round((bullWins / bullTotal) * 100) : 0,
      bullAvgPnl: bullTotal ? (bullPnL / bullTotal).toFixed(2) : "0.00",
      bearWinRate: bearTotal ? Math.round((bearWins / bearTotal) * 100) : 0,
      bearAvgPnl: bearTotal ? (bearPnL / bearTotal).toFixed(2) : "0.00",
    };
  }, [filteredAuditLogs]);

  const streakData = useMemo(() => {
    if (!filteredAuditLogs || filteredAuditLogs.length === 0) return [];

    const activeSymbols = new Set<string>();

    if (data && data.length > 0) {
      data.forEach(d => activeSymbols.add(d.Symbol));
    } else {
      filteredAuditLogs.forEach(log => {
        log.bullishPicks?.forEach((p: any) => activeSymbols.add(p.symbol));
        log.bearishPicks?.forEach((p: any) => activeSymbols.add(p.symbol));
      });
    }

    const results: any[] = [];

    activeSymbols.forEach(sym => {
      let streak = 0;
      let streakType = "";
      let pnlSum = 0;

      for (let i = 0; i < filteredAuditLogs.length; i++) {
        const log = filteredAuditLogs[i];
        let pick = log.bullishPicks?.find((p: any) => p.symbol === sym);
        let type = "BULL";

        if (!pick) {
          pick = log.bearishPicks?.find((p: any) => p.symbol === sym);
          type = "BEAR";
        }

        if (!pick) continue;

        if (streak === 0) {
          streakType = type;
        } else {
          if (type !== streakType) break;
        }

        if (pick.actualOutcome === true) break;

        streak++;
        pnlSum += pick.pnlPercent || 0;
      }

      if (streak >= minStreakDays) {
        results.push({
          symbol: sym,
          streak,
          type: streakType,
          pnlSum: parseFloat(pnlSum.toFixed(2))
        });
      }
    });

    return results.sort((a, b) => b.streak - a.streak);
  }, [filteredAuditLogs, minStreakDays, data]);

  const symbolSearchMetrics = useMemo(() => {
    if (!auditSearchSymbol.trim()) return null;
    const search = auditSearchSymbol.toUpperCase().trim();
    let wins = 0, total = 0, pnl = 0;
    const history: any[] = [];
    filteredAuditLogs.forEach(log => {
      log.bullishPicks?.forEach((p: any) => { if (p.symbol.includes(search)) { total++; if (p.actualOutcome) wins++; pnl += p.pnlPercent || 0; history.push({ date: log.date, type: "BULL", ...p }); } });
      log.bearishPicks?.forEach((p: any) => { if (p.symbol.includes(search)) { total++; if (p.actualOutcome) wins++; pnl += p.pnlPercent || 0; history.push({ date: log.date, type: "BEAR", ...p }); } });
    });
    return {
      winRate: total ? Math.round((wins / total) * 100) : 0,
      avgPnl: total ? (pnl / total).toFixed(2) : "0.00",
      total,
      history
    };
  }, [filteredAuditLogs, auditSearchSymbol]);

  useEffect(() => {
    setSelectedAuditIdx(0);
  }, [viewMode]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      let targetList: string[] = [];
      if (watchlistFilter === "Personal") targetList = personalSymbols;
      else if (watchlistFilter === "Nifty500") targetList = NIFTY_500_SYMBOLS_LIST;
      else if (watchlistFilter === "FNO") targetList = FNO_SYMBOLS_LIST;

      if (targetList.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // 1. Fetch MWUA Dynamic Weights, Laya RLCD Calibration, and Audit Logs
      const [weightsRes, auditRes] = await Promise.all([
        fetch("/api/dynamic-weights"),
        fetch(`/api/historical-audit?universe=${watchlistFilter}&symbols=${encodeURIComponent(targetList.slice(0, 50).join(','))}`)
      ]);
      const weightsJson = await weightsRes.json();
      const auditJson = await auditRes.json();

      if (weightsJson.status === "ok") {
        setWeights(weightsJson.weights);
        if (weightsJson.layaCalibration) {
          setLayaCalibration(weightsJson.layaCalibration);
        }
      }
      if (auditJson.status === "ok" && Array.isArray(auditJson.data)) {
        const clientVault = loadClientAuditVault();
        const unifiedChronological = mergeVerifiedAuditLogs(
          VERIFIED_AUDIT_BASELINE,
          clientVault,
          auditJson.data
        );
        saveClientAuditVault(unifiedChronological);
        const reversed = [...unifiedChronological].reverse();
        setAuditLogs(reversed);
        if (reversed.length > 0) setSelectedAuditIdx(0);

        // If client vault or compiled baseline has records not yet on server disk, sync them back
        if (unifiedChronological.length > auditJson.data.length) {
          fetch("/api/sync-historical-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              universe: watchlistFilter,
              entries: unifiedChronological
            })
          }).catch(() => {});
        }

        if (!weightsJson.layaCalibration) {
          setLayaCalibration(fitLayaCalibrationFromHistory(reversed));
        }
      }

      // 2. Fetch Dashboard Data
      const chunkCount = 35;
      const chunks: string[][] = [];
      for (let i = 0; i < targetList.length; i += chunkCount) chunks.push(targetList.slice(i, i + chunkCount));

      const allData: any[] = [];
      for (const chunk of chunks) {
        const symbolsQuery = chunk.join(",");
        const response = await fetch(`/api/wt-dashboard?symbols=${encodeURIComponent(symbolsQuery)}`);
        const json = await response.json();
        if (json.status === "ok" && Array.isArray(json.data)) allData.push(...json.data);
      }
      setData(allData);
    } catch (err: any) {
      setError(err.message || "Failed to load smart data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [watchlistFilter, personalSymbols]);

  // Base MWUA + Client-side Laya System-1 synchronous calculation
  const baseScoredRows = useMemo(() => {
    if (!data.length || !weights) return [];

    const calTemp = layaCalibration?.temperature || [1.1, 1.05, 1.15];
    const calRuntime = layaCalibration?.runtimeMode || "laya-rlcd-calibrated";
    const maxMwua = viewMode === "trend" ? 135 : 185;

    const rawRows: SmartRow[] = data.map(row => {
      const tfData = row.timeframes?.[activeTimeframe];
      if (!tfData || tfData.isUnavailable) {
        return { symbol: row.Symbol, bullScore: 0, bearScore: 0, reversalBullScore: 0, reversalBearScore: 0, tfData: null, fullRow: row };
      }

      let bull = 0;
      let bear = 0;
      let revBull = 0;
      let revBear = 0;

      // MWUA TREND LOGIC
      if (tfData.isBull) bull += weights.trend.wtBase;
      if (tfData.isBear) bear += weights.trend.wtBase;
      if (tfData.wt1 > 0) bull += weights.trend.wtZero;
      if (tfData.wt1 > 40) bull += weights.trend.wtExtreme;
      if (tfData.wt1 < 0) bear += weights.trend.wtZero;
      if (tfData.wt1 < -40) bear += weights.trend.wtExtreme;

      if (tfData.isStBull) bull += weights.trend.stWeight;
      if (tfData.isStBear) bear += weights.trend.stWeight;

      if (tfData.hmaIsBull) bull += weights.trend.hmaWeight;
      if (tfData.hmaIsBear) bear += weights.trend.hmaWeight;

      if (tfData.isTsiBull) bull += weights.trend.tsiBase;
      if (tfData.isTsiBear) bear += weights.trend.tsiBase;
      if (tfData.scaledTsi > 0) bull += weights.trend.tsiZero;
      if (tfData.scaledTsi < 0) bear += weights.trend.tsiZero;

      if (tfData.screenerH1b) bull += weights.trend.htfWt;
      if (tfData.screenerH1s) bear += weights.trend.htfWt;
      if (tfData.isStHtf1Bull) bull += weights.trend.htfSt;
      if (tfData.isStHtf1Bear) bear += weights.trend.htfSt;
      if (tfData.screenerHmaHtf1b) bull += weights.trend.htfHma;
      if (tfData.screenerHmaHtf1s) bear += weights.trend.htfHma;
      if (tfData.screenerGcb) bull += weights.trend.htfGc;
      if (tfData.screenerGcs) bear += weights.trend.htfGc;

      if (tfData.isBull && tfData.barsSinceCross < 3) bull += weights.trend.crossBonus;
      if (tfData.isBear && tfData.barsSinceCross < 3) bear += weights.trend.crossBonus;

      // MWUA REVERSAL LOGIC
      if (tfData.wt1 < -40) revBull += weights.reversal.wtDeep;
      if (tfData.wt1 < -50) revBull += weights.reversal.wtSevere;
      if (tfData.isBull && tfData.wt1 < -30) revBull += weights.reversal.wtCross;
      if (tfData.wt1 > 40) revBear += weights.reversal.wtDeep;
      if (tfData.wt1 > 50) revBear += weights.reversal.wtSevere;
      if (tfData.isBear && tfData.wt1 > 30) revBear += weights.reversal.wtCross;

      if (tfData.isStBull && tfData.barsSinceCross < 5 && tfData.wt1 < 0) revBull += weights.reversal.stFlip;
      if (tfData.isStBear && tfData.barsSinceCross < 5 && tfData.wt1 > 0) revBear += weights.reversal.stFlip;

      if (tfData.hmaIsBull && tfData.wt1 < -20) revBull += weights.reversal.hmaShift;
      if (tfData.hmaIsBear && tfData.wt1 > 20) revBear += weights.reversal.hmaShift;

      if (tfData.scaledTsi < -40) revBull += weights.reversal.tsiDeep;
      if (tfData.scaledTsi < -50) revBull += weights.reversal.tsiSevere;
      if (tfData.isTsiBull && tfData.scaledTsi < -30) revBull += weights.reversal.tsiCross;
      if (tfData.scaledTsi > 40) revBear += weights.reversal.tsiDeep;
      if (tfData.scaledTsi > 50) revBear += weights.reversal.tsiSevere;
      if (tfData.isTsiBear && tfData.scaledTsi > 30) revBear += weights.reversal.tsiCross;

      if (tfData.screenerH1b && tfData.isBull && tfData.wt1 < 0) revBull += weights.reversal.htfDiv;
      if (tfData.screenerH1s && tfData.isBear && tfData.wt1 > 0) revBear += weights.reversal.htfDiv;

      const activeBullMwua = viewMode === "trend" ? bull : revBull;
      const activeBearMwua = viewMode === "trend" ? bear : revBear;

      const layaBull =
        serverLayaMap[`${row.Symbol}_BULL_${viewMode}_${activeTimeframe}`] ||
        evaluateLayaSystemOne(
          row.Symbol,
          activeTimeframe,
          viewMode,
          "BULL",
          tfData,
          activeBullMwua,
          maxMwua,
          calTemp,
          calRuntime
        );

      const layaBear =
        serverLayaMap[`${row.Symbol}_BEAR_${viewMode}_${activeTimeframe}`] ||
        evaluateLayaSystemOne(
          row.Symbol,
          activeTimeframe,
          viewMode,
          "BEAR",
          tfData,
          activeBearMwua,
          maxMwua,
          calTemp,
          calRuntime
        );

      return {
        symbol: row.Symbol,
        bullScore: bull,
        bearScore: bear,
        reversalBullScore: revBull,
        reversalBearScore: revBear,
        tfData,
        fullRow: row,
        layaBull,
        layaBear
      };
    });

    const validRows = rawRows.filter(r => r.tfData !== null);
    const bullDecisions = runLayaTournament(
      validRows.map(r => r.layaBull!).filter(Boolean),
      16,
      10
    );
    const bearDecisions = runLayaTournament(
      validRows.map(r => r.layaBear!).filter(Boolean),
      16,
      10
    );

    const bullMap = new Map(bullDecisions.map(d => [d.symbol, d]));
    const bearMap = new Map(bearDecisions.map(d => [d.symbol, d]));

    return validRows.map(r => ({
      ...r,
      layaBull: bullMap.get(r.symbol) || r.layaBull,
      layaBear: bearMap.get(r.symbol) || r.layaBear
    }));
  }, [data, activeTimeframe, weights, viewMode, layaCalibration, serverLayaMap]);

  // Synchronize with backend `/api/laya-decide` endpoint (supports LAYA_SERVER_URL sidecar & tournament pass)
  useEffect(() => {
    if (!data.length || !weights) return;
    const maxMwua = viewMode === "trend" ? 135 : 185;
    const itemsPayload: any[] = [];

    for (const row of data) {
      const tfData = row.timeframes?.[activeTimeframe];
      if (!tfData || tfData.isUnavailable) continue;
      const matched = baseScoredRows.find(b => b.symbol === row.Symbol);
      const bullMwua = viewMode === "trend" ? (matched?.bullScore || 0) : (matched?.reversalBullScore || 0);
      const bearMwua = viewMode === "trend" ? (matched?.bearScore || 0) : (matched?.reversalBearScore || 0);

      itemsPayload.push({
        symbol: row.Symbol,
        timeframe: activeTimeframe,
        mode: viewMode,
        direction: "BULL",
        tfData,
        mwuaScore: bullMwua,
        maxMwuaScore: maxMwua
      });
      itemsPayload.push({
        symbol: row.Symbol,
        timeframe: activeTimeframe,
        mode: viewMode,
        direction: "BEAR",
        tfData,
        mwuaScore: bearMwua,
        maxMwuaScore: maxMwua
      });
    }

    if (itemsPayload.length === 0) return;

    let cancelled = false;
    fetch("/api/laya-decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: itemsPayload,
        groupSize: 16,
        finalistsCount: 10
      })
    })
      .then(res => res.json())
      .then(json => {
        if (cancelled || json.status !== "ok") return;
        if (json.calibration) setLayaCalibration(json.calibration);
        if (typeof json.batchLatencyMs === "number") setLayaBatchLatencyMs(json.batchLatencyMs);
        if (Array.isArray(json.decisions)) {
          const nextMap: Record<string, LayaDecisionOutput> = {};
          for (const d of json.decisions) {
            nextMap[`${d.symbol}_${d.direction}_${viewMode}_${activeTimeframe}`] = d;
          }
          setServerLayaMap(prev => ({ ...prev, ...nextMap }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [data, activeTimeframe, viewMode, weights]);

  const getRowCombinedScore = (item: SmartRow, isBull: boolean) => {
    const maxMwua = viewMode === "trend" ? 135 : 185;
    const rawMwua = isBull
      ? (viewMode === "trend" ? item.bullScore : item.reversalBullScore)
      : (viewMode === "trend" ? item.bearScore : item.reversalBearScore);
    const mwuaPct = Math.min(100, Math.round((rawMwua / maxMwua) * 100));
    const layaDec = isBull ? item.layaBull : item.layaBear;
    const layaScore = layaDec?.compositeScore ?? mwuaPct;
    const hybridScore = Math.round(mwuaPct * 0.55 + layaScore * 0.45);
    return { rawMwua, maxMwua, mwuaPct, layaScore, hybridScore, layaDec };
  };

  const { currentBullish, currentBearish } = useMemo(() => {
    let bullPool = [...baseScoredRows];
    let bearPool = [...baseScoredRows];

    if (tournamentOnly) {
      const qualBull = bullPool.filter(r => r.layaBull?.tournament?.qualified);
      const qualBear = bearPool.filter(r => r.layaBear?.tournament?.qualified);
      if (qualBull.length > 0) bullPool = qualBull;
      if (qualBear.length > 0) bearPool = qualBear;
    }

    const sortFn = (isBull: boolean) => (a: SmartRow, b: SmartRow) => {
      if (sortMode === "live") {
        const qa = liveQuotes[a.symbol] || 0;
        const qb = liveQuotes[b.symbol] || 0;
        return isBull ? qb - qa : qa - qb;
      }
      const sa = getRowCombinedScore(a, isBull);
      const sb = getRowCombinedScore(b, isBull);
      if (sortMode === "laya") return sb.layaScore - sa.layaScore;
      if (sortMode === "mwua") return sb.rawMwua - sa.rawMwua;
      return sb.hybridScore - sa.hybridScore;
    };

    const topBull = bullPool.sort(sortFn(true)).slice(0, 10);
    const topBear = bearPool.sort(sortFn(false)).slice(0, 10);

    return { currentBullish: topBull, currentBearish: topBear };
  }, [baseScoredRows, sortMode, tournamentOnly, liveQuotes, viewMode]);

  // Keep default inspected decision synced with top #1 bullish pick
  useEffect(() => {
    if (!inspectedDecision && currentBullish.length > 0 && currentBullish[0].layaBull) {
      setInspectedDecision(currentBullish[0].layaBull);
    }
  }, [currentBullish, inspectedDecision]);

  const finalizeEOD = async () => {
    try {
      if (currentBullish.length === 0 && currentBearish.length === 0) {
        setEodStatusBanner("No candidate picks available to finalize.");
        return;
      }

      const mapPick = (item: SmartRow, rank: number, isBull: boolean) => ({
        rank,
        symbol: item.symbol,
        prediction: isBull ? "BULL" : "BEAR",
        actualOutcome: true,
        pnlPercent: 0,
        indicators: {
          hmaFired: isBull ? item.tfData.hmaIsBull : item.tfData.hmaIsBear,
          stFired: isBull ? item.tfData.isStBull : item.tfData.isStBear,
          wtFired: isBull ? item.tfData.isBull : item.tfData.isBear,
          tsiFired: isBull ? item.tfData.isTsiBull : item.tfData.isTsiBear,
          htfFired: isBull ? item.tfData.screenerH1b : item.tfData.screenerH1s
        }
      });

      const bullishPicks = currentBullish.map((item, idx) => mapPick(item, idx + 1, true));
      const bearishPicks = currentBearish.map((item, idx) => mapPick(item, idx + 1, false));

      const response = await fetch("/api/finalize-eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe: watchlistFilter,
          type: viewMode === "trend" ? "Trend" : "Reversal",
          bullishPicks,
          bearishPicks
        })
      });
      if (response.ok) {
        const resJson = await response.json().catch(() => ({}));
        if (resJson.entry) {
          const updatedVault = saveClientAuditVault([...loadClientAuditVault(), resJson.entry]);
          setAuditLogs([...updatedVault].reverse());
        }
        setEodStatusBanner("End-of-Day snapshot recorded to server & browser vault. MWUA weights and Laya RLCD calibration updated.");
        setTimeout(() => setEodStatusBanner(null), 6000);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const symbolsToFetch = [
      ...currentBullish.map(i => i.symbol),
      ...currentBearish.map(i => i.symbol)
    ];
    if (symbolsToFetch.length === 0) return;

    fetch(`/api/live-quotes?symbols=${encodeURIComponent(symbolsToFetch.join(','))}`)
      .then(res => res.json())
      .then(json => {
        if (json.status === "ok" && json.data) {
          setLiveQuotes(json.data);
        }
      })
      .catch(console.error);
  }, [currentBullish, currentBearish]);

  const getNextTradingDay = () => {
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);

    const dayOfWeek = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();

    let addDays = 0;
    const isMarketClosed = hours > 15 || (hours === 15 && minutes >= 30);

    if (dayOfWeek === 6) {
      addDays = 2;
    } else if (dayOfWeek === 0) {
      addDays = 1;
    } else if (isMarketClosed) {
      if (dayOfWeek === 5) {
        addDays = 3;
      } else {
        addDays = 1;
      }
    }

    istDate.setDate(istDate.getDate() + addDays);

    const y = istDate.getFullYear();
    const m = String(istDate.getMonth() + 1).padStart(2, '0');
    const d = String(istDate.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  };
  const nextTradingDay = getNextTradingDay();

  const renderCandidateCard = (item: SmartRow, idx: number, isBull: boolean) => {
    const { rawMwua, maxMwua, mwuaPct, layaScore, hybridScore, layaDec } = getRowCombinedScore(item, isBull);
    const regimeChoice = layaDec?.answers.setup_regime.choice || "trend_continuation";
    const regimeProb = Math.round((layaDec?.answers.setup_regime.confidence ?? 0.5) * 100);
    const convictionTier = layaDec?.answers.conviction_tier.tier || "moderate";
    const followThroughPct = Math.round((layaDec?.answers.follow_through_prob.noul ?? 0.5) * 100);
    const whipsawPct = Math.round((layaDec?.answers.whipsaw_trap_risk.noul ?? 0.3) * 100);
    const isInspected =
      inspectedDecision?.symbol === item.symbol &&
      inspectedDecision?.direction === (isBull ? "BULL" : "BEAR");

    return (
      <div
        key={`${item.symbol}-${idx}`}
        onClick={() => layaDec && setInspectedDecision(layaDec)}
        className={`rounded-xl border p-4 transition-colors cursor-pointer ${
          isInspected
            ? 'bg-slate-800/90 border-indigo-500/70'
            : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center font-mono font-semibold text-xs shrink-0 mt-0.5">
              #{idx + 1}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-base text-slate-100 flex items-center gap-2 flex-wrap">
                <span>{item.symbol}</span>
                <a
                  href={getTradingViewUrl(item.symbol)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-500 hover:text-indigo-400 transition-colors"
                  title="Open in TradingView"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {liveQuotes[item.symbol] !== undefined && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      liveQuotes[item.symbol] > 0
                        ? 'text-emerald-400'
                        : liveQuotes[item.symbol] < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {liveQuotes[item.symbol] > 0 ? '+' : ''}
                    {liveQuotes[item.symbol].toFixed(2)}%
                  </span>
                )}
              </div>

              {/* Clean unboxed Laya System-1 typed telemetry (choice · score · noul) */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                <span className="text-slate-200 font-medium">
                  {REGIME_LABELS[regimeChoice] || regimeChoice}
                </span>
                <span className="font-mono tabular-nums text-slate-500">({regimeProb}%)</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize text-indigo-300">{convictionTier} tier</span>
                {layaDec?.tournament?.finalRank && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-amber-300/90">
                      T-Rank #{layaDec.tournament.finalRank}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-400">
                <span>
                  Follow-Through Noul:{' '}
                  <strong className={followThroughPct >= 60 ? 'text-emerald-400' : 'text-slate-200'}>
                    {followThroughPct}%
                  </strong>
                </span>
                <span aria-hidden="true">/</span>
                <span>
                  Whipsaw Risk:{' '}
                  <strong className={whipsawPct >= 45 ? 'text-rose-400' : 'text-emerald-400'}>
                    {whipsawPct}%
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="border-r border-slate-700/60 pr-3">
              <div className="text-[9px] uppercase font-mono text-orange-400/90 text-center mb-0.5">Laya Intel</div>
              <LayaIntelCell intel={computeD1ToD4CombinedLaya(item.fullRow || { timeframes: { [activeTimeframe]: item.tfData } }).combinedLayaIntel} compact />
            </div>
            <div className="text-right">
              <div className="text-xs font-mono tabular-nums text-slate-300">
                Hybrid <strong className="text-slate-100 text-sm">{hybridScore}%</strong>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                MWUA {rawMwua}/{maxMwua} · Laya {layaScore}%
              </div>
              <div className="w-28 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-2 flex">
                <div
                  className={`h-full ${isBull ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.round(mwuaPct * 0.5)}%` }}
                  title={`MWUA Component: ${mwuaPct}%`}
                />
                <div
                  className="h-full bg-indigo-400"
                  style={{ width: `${Math.round(layaScore * 0.5)}%` }}
                  title={`Laya System-1 Component: ${layaScore}%`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-800/40 p-5 rounded-xl border border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/15 rounded-lg border border-indigo-500/30">
            <BrainCircuit className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              Next Day Top 10 ({nextTradingDay})
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>MWUA Self-Learning Engine</span>
              <span aria-hidden="true">·</span>
              <span>Laya System-1 RLCD Calibrated Decisions</span>
              {layaCalibration && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-indigo-300">
                    Brier {layaCalibration.brierScore.toFixed(3)} · ECE {(layaCalibration.expectedCalibrationError * 100).toFixed(1)}% · {layaBatchLatencyMs || 1.2}ms pass
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setViewMode("reversal")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "reversal" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Reversals
            </button>
            <button
              onClick={() => setViewMode("trend")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "trend" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Trend (Momentum)
            </button>
          </div>

          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setSortMode("hybrid")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sortMode === "hybrid" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hybrid
            </button>
            <button
              onClick={() => setSortMode("laya")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sortMode === "laya" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Laya S1
            </button>
            <button
              onClick={() => setSortMode("mwua")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sortMode === "mwua" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MWUA
            </button>
            <button
              onClick={() => setSortMode("live")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sortMode === "live" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live %
            </button>
          </div>

          <button
            onClick={() => setTournamentOnly(prev => !prev)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              tournamentOnly
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Filter via Laya 16-group Tournament Elimination (predictTournament)"
          >
            Tournament 16x
          </button>

          <select
            value={watchlistFilter}
            onChange={(e) => setWatchlistFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="Personal">Personal</option>
            <option value="Nifty500">Nifty 500</option>
            <option value="FNO">FnO (F&O)</option>
          </select>

          <select
            value={activeTimeframe}
            onChange={(e) => setActiveTimeframe(e.target.value as Timeframe)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
            title="Refresh MWUA & Laya System-1 Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {eodStatusBanner && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{eodStatusBanner}</span>
        </div>
      )}

      {loading || !weights ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <BrainCircuit className="w-10 h-10 text-indigo-400 animate-pulse" />
            <p className="text-slate-400 font-medium text-sm">
              Executing MWUA & Laya System-1 single-pass evaluation across D1–D4 states...
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">{error}</div>
      ) : (
        <div className="space-y-8">
          {/* SECTION A: Output Dashboard */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-100">
                    Smart Top 10 Bullish ({nextTradingDay})
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Click any symbol to inspect Laya schema</span>
              </div>
              <div className="flex flex-col gap-3">
                {currentBullish.map((item, idx) => renderCandidateCard(item, idx, true))}
              </div>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-5 h-5 text-rose-400" />
                  <h3 className="text-base font-bold text-slate-100">
                    Smart Top 10 Bearish ({nextTradingDay})
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Click any symbol to inspect Laya schema</span>
              </div>
              <div className="flex flex-col gap-3">
                {currentBearish.map((item, idx) => renderCandidateCard(item, idx, false))}
              </div>
            </div>
          </div>

          {/* SECTION A.2: Laya System-1 Decision Schema Inspector */}
          {inspectedDecision && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/70 pb-3.5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h3 className="font-bold text-slate-100 text-base">
                      Laya System-1 Decision Telemetry: {inspectedDecision.symbol} ({inspectedDecision.direction})
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Non-autoregressive single forward pass calibrated via Reinforcement Learning for Calibrated Decisions (RLCD)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-400">
                  <span>Runtime: <strong className="text-slate-200">{inspectedDecision.routing.runtime}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Temp T=[{inspectedDecision.routing.temperature.join(", ")}]
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Composite: <strong className="text-indigo-300">{inspectedDecision.compositeScore}%</strong></span>
                </div>
              </div>

              {/* Serialized State Vector */}
              <div className="bg-slate-900/80 border border-slate-700/70 rounded-lg p-3">
                <div className="text-[11px] text-slate-400 mb-1 font-medium">
                  Input State Vector (`state` passed to `router.predict`)
                </div>
                <div className="font-mono text-xs text-slate-200 break-all leading-relaxed">
                  {inspectedDecision.state}
                </div>
              </div>

              {/* 3-Column Typed Schema Breakdown: choice | score | noul */}
              <div className="grid md:grid-cols-3 gap-4">
                {/* 1. Typed Choice */}
                <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">1. Typed Choice (`setup_regime`)</span>
                    <span className="font-mono text-indigo-300">type: "choice"</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {LAYA_QUANT_QUESTIONS_SCHEMA.setup_regime.instructions}
                  </div>
                  <div className="space-y-2 pt-1">
                    {Object.entries(inspectedDecision.answers.setup_regime.probabilities).map(([key, prob]) => {
                      const pct = Math.round(Number(prob) * 100);
                      const isWinner = inspectedDecision.answers.setup_regime.choice === key;
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={isWinner ? 'text-slate-100 font-semibold' : 'text-slate-400'}>
                              {REGIME_LABELS[key] || key}
                            </span>
                            <span className="font-mono tabular-nums text-slate-300">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isWinner ? 'bg-indigo-400' : 'bg-slate-600'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Ordinal Score */}
                <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">2. Ordinal Score (`conviction_tier`)</span>
                    <span className="font-mono text-indigo-300">type: "score"</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Expected Value: <strong className="text-slate-200 font-mono">{inspectedDecision.answers.conviction_tier.score}/100</strong>
                  </div>
                  <div className="space-y-2 pt-1">
                    {Object.entries(inspectedDecision.answers.conviction_tier.distribution).map(([tier, prob]) => {
                      const pct = Math.round(Number(prob) * 100);
                      const isWinner = inspectedDecision.answers.conviction_tier.tier === tier;
                      return (
                        <div key={tier} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={`capitalize ${isWinner ? 'text-slate-100 font-semibold' : 'text-slate-400'}`}>
                              {tier}
                            </span>
                            <span className="font-mono tabular-nums text-slate-300">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isWinner ? 'bg-emerald-400' : 'bg-slate-600'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Binary Noul Probabilities */}
                <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">3. Binary Noul (`noul`)</span>
                    <span className="font-mono text-indigo-300">type: "noul"</span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Session Follow-Through (`yes`)</span>
                      <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                        {(inspectedDecision.answers.follow_through_prob.noul * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.round(inspectedDecision.answers.follow_through_prob.noul * 100)}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {LAYA_QUANT_QUESTIONS_SCHEMA.follow_through_prob.instructions}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Whipsaw / Trap Risk (`yes`)</span>
                      <span className="font-mono tabular-nums text-rose-400 font-semibold">
                        {(inspectedDecision.answers.whipsaw_trap_risk.noul * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${Math.round(inspectedDecision.answers.whipsaw_trap_risk.noul * 100)}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {LAYA_QUANT_QUESTIONS_SCHEMA.whipsaw_trap_risk.instructions}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={finalizeEOD}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-lg transition-colors font-medium text-xs flex items-center gap-2"
            >
              <Activity className="w-4 h-4 text-indigo-400" />
              Finalize EOD Run (Update MWUA & Laya RLCD Calibration)
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 pt-6 border-t border-slate-700">
            {/* SECTION B: 50-Day Audit Log */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col h-[500px] lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-100">50-Day Audit Log & Backtesting</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-slate-500" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search symbol..."
                      value={auditSearchSymbol}
                      onChange={(e) => setAuditSearchSymbol(e.target.value.toUpperCase())}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-indigo-500 w-40"
                    />
                  </div>
                  {filteredAuditLogs.length > 0 && !symbolSearchMetrics && (
                    <select
                      value={selectedAuditIdx}
                      onChange={(e) => setSelectedAuditIdx(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                    >
                      {filteredAuditLogs.map((log, idx) => (
                        <option key={idx} value={idx}>
                          {log.signalDate ? `${log.signalDate} → ${log.date}` : log.date} ({log.type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {symbolSearchMetrics ? (
                <div className="flex-1 overflow-auto max-h-[500px]">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Total Walk-Forward Signals</div>
                      <div className="text-xl font-bold text-slate-200 font-mono tabular-nums">{symbolSearchMetrics.total}</div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Historical Win Rate</div>
                      <div className="text-xl font-bold text-indigo-400 font-mono tabular-nums">{symbolSearchMetrics.winRate}%</div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Average Realized PnL</div>
                      <div className={`text-xl font-bold font-mono tabular-nums ${parseFloat(symbolSearchMetrics.avgPnl) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {parseFloat(symbolSearchMetrics.avgPnl) > 0 ? '+' : ''}{symbolSearchMetrics.avgPnl}%
                      </div>
                    </div>
                  </div>
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-slate-400 border-b border-slate-700/50 sticky top-0 bg-slate-800/90">
                      <tr>
                        <th className="py-2">Outcome Date</th>
                        <th className="py-2">Symbol</th>
                        <th className="py-2">Prediction</th>
                        <th className="py-2">Indicators Fired</th>
                        <th className="py-2">Result</th>
                        <th className="py-2 text-right">Actual %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolSearchMetrics.history.map((pick, idx) => {
                        const firedList = [
                          pick.indicators?.hmaFired && "HMA",
                          pick.indicators?.stFired && "ST",
                          pick.indicators?.wtFired && "WT",
                          pick.indicators?.tsiFired && "TSI",
                          pick.indicators?.htfFired && "HTF"
                        ].filter(Boolean).join(" · ");
                        return (
                          <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                            <td className="py-2 font-mono text-xs">{pick.date}</td>
                            <td className="py-2 font-medium">{pick.symbol}</td>
                            <td className="py-2">
                              <span className={`text-xs font-medium ${pick.type === 'BULL' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {pick.type}
                              </span>
                            </td>
                            <td className="py-2 text-xs text-slate-400 font-mono">{firedList || "—"}</td>
                            <td className="py-2">
                              {pick.actualOutcome ? (
                                <span className="text-emerald-400">Win</span>
                              ) : (
                                <span className="text-rose-400">Loss</span>
                              )}
                            </td>
                            <td className={`py-2 text-right font-mono tabular-nums ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : filteredAuditLogs[selectedAuditIdx] ? (
                <div className="flex-1 overflow-auto max-h-[500px]">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex justify-between items-center">
                      <div className="text-slate-300 text-sm font-medium">50-Day Walk-Forward Bullish</div>
                      <div className="flex gap-4 text-sm font-bold font-mono tabular-nums">
                        <span className="text-emerald-400">{overArchingMetrics.bullWinRate}% Win Rate</span>
                        <span className="text-emerald-400">Avg {parseFloat(overArchingMetrics.bullAvgPnl) > 0 ? '+' : ''}{overArchingMetrics.bullAvgPnl}%</span>
                      </div>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 flex justify-between items-center">
                      <div className="text-slate-300 text-sm font-medium">50-Day Walk-Forward Bearish</div>
                      <div className="flex gap-4 text-sm font-bold font-mono tabular-nums">
                        <span className="text-rose-400">{overArchingMetrics.bearWinRate}% Win Rate</span>
                        <span className="text-rose-400">Avg {parseFloat(overArchingMetrics.bearAvgPnl) > 0 ? '+' : ''}{overArchingMetrics.bearAvgPnl}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Bullish Picks */}
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-400 mb-2 sticky top-0 bg-slate-800/90 py-1">Top 10 Bullish</h4>
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="text-slate-400 border-b border-slate-700/50">
                          <tr>
                            <th className="py-1">Rank</th>
                            <th className="py-1">Symbol</th>
                            <th className="py-1">Triggered</th>
                            <th className="py-1">Result</th>
                            <th className="py-1 text-right">Actual %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAuditLogs[selectedAuditIdx].bullishPicks?.map((pick: any, idx: number) => {
                            const triggers = [
                              pick.indicators?.hmaFired && "HMA",
                              pick.indicators?.stFired && "ST",
                              pick.indicators?.wtFired && "WT",
                              pick.indicators?.tsiFired && "TSI",
                              pick.indicators?.htfFired && "HTF"
                            ].filter(Boolean).join("·");
                            return (
                              <tr key={`${pick.symbol}-${idx}`} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                                <td className="py-1 text-slate-500 font-mono">#{pick.rank}</td>
                                <td className="py-1 font-medium flex items-center gap-1">
                                  {pick.symbol}
                                  <a href={getTradingViewUrl(pick.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </td>
                                <td className="py-1 text-[10px] font-mono text-slate-400">{triggers || "—"}</td>
                                <td className="py-1">
                                  {pick.actualOutcome ? (
                                    <span className="text-emerald-400">Win</span>
                                  ) : (
                                    <span className="text-rose-400">Loss</span>
                                  )}
                                </td>
                                <td className={`py-1 text-right font-mono tabular-nums ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                  {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Bearish Picks */}
                    <div>
                      <h4 className="text-sm font-semibold text-rose-400 mb-2 sticky top-0 bg-slate-800/90 py-1">Top 10 Bearish</h4>
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="text-slate-400 border-b border-slate-700/50">
                          <tr>
                            <th className="py-1">Rank</th>
                            <th className="py-1">Symbol</th>
                            <th className="py-1">Triggered</th>
                            <th className="py-1">Result</th>
                            <th className="py-1 text-right">Actual %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAuditLogs[selectedAuditIdx].bearishPicks?.map((pick: any, idx: number) => {
                            const triggers = [
                              pick.indicators?.hmaFired && "HMA",
                              pick.indicators?.stFired && "ST",
                              pick.indicators?.wtFired && "WT",
                              pick.indicators?.tsiFired && "TSI",
                              pick.indicators?.htfFired && "HTF"
                            ].filter(Boolean).join("·");
                            return (
                              <tr key={`${pick.symbol}-${idx}`} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                                <td className="py-1 text-slate-500 font-mono">#{pick.rank}</td>
                                <td className="py-1 font-medium flex items-center gap-1">
                                  {pick.symbol}
                                  <a href={getTradingViewUrl(pick.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </td>
                                <td className="py-1 text-[10px] font-mono text-slate-400">{triggers || "—"}</td>
                                <td className="py-1">
                                  {pick.actualOutcome ? (
                                    <span className="text-emerald-400">Win</span>
                                  ) : (
                                    <span className="text-rose-400">Loss</span>
                                  )}
                                </td>
                                <td className={`py-1 text-right font-mono tabular-nums ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                  {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  No audit logs available.
                </div>
              )}
            </div>

            {/* SECTION D: Consecutive Failures Streak */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col h-[500px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100">Prediction Disconnect Streaks</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Min Days:</span>
                  <select
                    value={minStreakDays}
                    onChange={(e) => setMinStreakDays(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-2 py-1 outline-none focus:border-rose-500"
                  >
                    <option value={1}>1 Day</option>
                    <option value={2}>2 Days</option>
                    <option value={3}>3 Days</option>
                    <option value={4}>4 Days</option>
                    <option value={5}>5 Days</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-4 leading-relaxed">
                Symbols consistently predicted in one direction but experiencing opposite results for <span className="text-slate-200 font-bold">{minStreakDays}+ consecutive days</span>.
              </div>
              <div className="flex-1 overflow-auto">
                {streakData.length > 0 ? (
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-slate-400 border-b border-slate-700/50 sticky top-0 bg-slate-800/90">
                      <tr>
                        <th className="py-2">Symbol</th>
                        <th className="py-2 text-center">Prediction</th>
                        <th className="py-2 text-center">Streak (Days)</th>
                        <th className="py-2 text-right">Cum. PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {streakData.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                          <td className="py-2 font-medium flex items-center gap-1">
                            {item.symbol}
                            <a href={getTradingViewUrl(item.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-2 text-center">
                            <span className={`text-xs font-semibold ${item.type === 'BULL' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="py-2 text-center font-bold text-rose-400 font-mono">{item.streak}</td>
                          <td className={`py-2 text-right font-mono ${item.pnlSum > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.pnlSum > 0 ? '+' : ''}{item.pnlSum}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
                    <Activity className="w-8 h-8 opacity-20" />
                    <p>No active streaks ≥ {minStreakDays} days found.</p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION C: Weight Matrix (The Brain) & Laya RLCD Calibration */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BrainCircuit className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-100">MWUA Weight Matrix ({viewMode === "trend" ? "Trend" : "Reversal"})</h3>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(viewMode === "trend" ? weights.trend : weights.reversal).map(([key, value]) => {
                    const maxBase = viewMode === "trend" ? 30 : 40;
                    const pct = Math.min(100, (Number(value) / maxBase) * 100);

                    const labels: Record<string, string> = {
                      hmaWeight: "D1 HMA", stWeight: "D2 SuperTrend", wtBase: "D3 WaveTrend Base",
                      wtZero: "D3 Zero Line", wtExtreme: "D3 Extreme Velocity", tsiBase: "D4 TSI",
                      tsiZero: "D4 TSI Zero", htfWt: "HTF WaveTrend", htfSt: "HTF SuperTrend",
                      htfHma: "HTF HMA", htfGc: "HTF Golden Cross", crossBonus: "Fresh Cross Bonus",
                      wtDeep: "D3 Exhaustion", wtSevere: "D3 Severe Exhaust", wtCross: "D3 Reversal Cross",
                      tsiDeep: "D4 Exhaustion", tsiSevere: "D4 Severe Exhaust", tsiCross: "D4 Reversal Cross",
                      stFlip: "D2 ST Early Flip", hmaShift: "D1 HMA Early Shift", htfDiv: "HTF Divergence", baseMomentum: "Base Momentum"
                    };

                    return (
                      <div key={key} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{labels[key] || key}</span>
                          <span className="font-mono tabular-nums text-indigo-300">{Number(value).toFixed(0)} pts</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {layaCalibration && (
                <div className="pt-4 border-t border-slate-700/80 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    Laya RLCD Strictly Proper Scoring Calibration
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">Brier Score</div>
                      <div className="text-emerald-400 font-semibold mt-0.5">{layaCalibration.brierScore.toFixed(4)}</div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">Log Loss</div>
                      <div className="text-indigo-300 font-semibold mt-0.5">{layaCalibration.logLoss.toFixed(4)}</div>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-2.5">
                      <div className="text-[10px] text-slate-400 font-sans">Calib. ECE</div>
                      <div className="text-slate-200 font-semibold mt-0.5">{(layaCalibration.expectedCalibrationError * 100).toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    Temperatures: choice={layaCalibration.temperature[0]} · score={layaCalibration.temperature[1]} · noul={layaCalibration.temperature[2]} ({layaCalibration.sampleCount} EOD samples)
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

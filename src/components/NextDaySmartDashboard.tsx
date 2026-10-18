import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, BrainCircuit, Activity, BarChart2, Search } from 'lucide-react';
import { Timeframe } from '../types';
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from '../data/watchlists';

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
}

export default function NextDaySmartDashboard({ personalSymbols = [] }: { personalSymbols?: string[] }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [weights, setWeights] = useState<MWUAWeights | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedAuditIdx, setSelectedAuditIdx] = useState<number>(0);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
  
  
  const [viewMode, setViewMode] = useState<"reversal" | "trend">("reversal");
  const [watchlistFilter, setWatchlistFilter] = useState("FNO");
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");
  const [sortMode, setSortMode] = useState<"ai" | "live">("ai");
  const [auditSearchSymbol, setAuditSearchSymbol] = useState("");
  const [minStreakDays, setMinStreakDays] = useState<number>(1);

  const TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H", "1D", "1W"];

  const getTradingViewUrl = (symbol: string) => {
    let formattedSymbol = symbol;
    if (symbol === "NIFTY") formattedSymbol = "NIFTY";
    else if (symbol === "BANKNIFTY") formattedSymbol = "BANKNIFTY";
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
  }, [filteredAuditLogs, minStreakDays]);

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

      // 1. Fetch MWUA Dynamic Weights and Audit Logs
      const [weightsRes, auditRes] = await Promise.all([
        fetch("/api/dynamic-weights"),
        fetch(`/api/historical-audit?universe=${watchlistFilter}&symbols=${encodeURIComponent(targetList.slice(0, 50).join(','))}`)
      ]);
      const weightsJson = await weightsRes.json();
      const auditJson = await auditRes.json();
      
      if (weightsJson.status === "ok") setWeights(weightsJson.weights);
      if (auditJson.status === "ok") {
        setAuditLogs(auditJson.data);
        if (auditJson.data.length > 0) setSelectedAuditIdx(0);
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

  const scoredData = useMemo(() => {
    if (!data.length || !weights) return { trendBullish: [], trendBearish: [], revBullish: [], revBearish: [] };

    const scored: SmartRow[] = data.map(row => {
      const tfData = row.timeframes?.[activeTimeframe];
      if (!tfData || tfData.isUnavailable) {
        return { symbol: row.Symbol, bullScore: 0, bearScore: 0, reversalBullScore: 0, reversalBearScore: 0, tfData: null };
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

      return { symbol: row.Symbol, bullScore: bull, bearScore: bear, reversalBullScore: revBull, reversalBearScore: revBear, tfData };
    });

    const validData = scored.filter(s => s.tfData !== null);

    const trendBullish = [...validData].sort((a, b) => b.bullScore - a.bullScore).slice(0, 10);
    const trendBearish = [...validData].sort((a, b) => b.bearScore - a.bearScore).slice(0, 10);
    const revBullish = [...validData].sort((a, b) => b.reversalBullScore - a.reversalBullScore).slice(0, 10);
    const revBearish = [...validData].sort((a, b) => b.reversalBearScore - a.reversalBearScore).slice(0, 10);

    return { trendBullish, trendBearish, revBullish, revBearish };
  }, [data, activeTimeframe, weights]);

  const finalizeEOD = async () => {
    try {
      const topBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;
      const topBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;
      
      if (topBullish.length === 0 && topBearish.length === 0) return alert("No picks to finalize");
      
      const mapPick = (item: SmartRow, rank: number, isBull: boolean) => ({
        rank,
        symbol: item.symbol,
        prediction: isBull ? "BULL" : "BEAR",
        actualOutcome: true, // Placeholder for next day validation
        pnlPercent: 0,
        indicators: {
          hmaFired: isBull ? item.tfData.hmaIsBull : item.tfData.hmaIsBear,
          stFired: isBull ? item.tfData.isStBull : item.tfData.isStBear,
          wtFired: isBull ? item.tfData.isBull : item.tfData.isBear,
          tsiFired: isBull ? item.tfData.isTsiBull : item.tfData.isTsiBear,
          htfFired: isBull ? item.tfData.screenerH1b : item.tfData.screenerH1s
        }
      });
      
      const bullishPicks = topBullish.map((item, idx) => mapPick(item, idx + 1, true));
      const bearishPicks = topBearish.map((item, idx) => mapPick(item, idx + 1, false));

      const response = await fetch("/api/finalize-eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: viewMode === "trend" ? "Trend" : "Reversal",
          bullishPicks,
          bearishPicks
        })
      });
      if (response.ok) {
        alert("End of Day Data finalized. MWUA weights will adapt tomorrow.");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const baseBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;
  const baseBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;

  const currentBullish = useMemo(() => {
    let arr = [...baseBullish];
    if (sortMode === "live") {
      arr.sort((a, b) => (liveQuotes[b.symbol] || 0) - (liveQuotes[a.symbol] || 0));
    }
    return arr;
  }, [baseBullish, sortMode, liveQuotes]);

  const currentBearish = useMemo(() => {
    let arr = [...baseBearish];
    if (sortMode === "live") {
      arr.sort((a, b) => (liveQuotes[a.symbol] || 0) - (liveQuotes[b.symbol] || 0));
    }
    return arr;
  }, [baseBearish, sortMode, liveQuotes]);

  useEffect(() => {
    const symbolsToFetch = [
      ...baseBullish.map(i => i.symbol),
      ...baseBearish.map(i => i.symbol)
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
    // Get current date/time in IST
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);
    
    const dayOfWeek = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    
    let addDays = 0;
    const isMarketClosed = hours > 15 || (hours === 15 && minutes >= 30);
    
    if (dayOfWeek === 6) { // Saturday
      addDays = 2;
    } else if (dayOfWeek === 0) { // Sunday
      addDays = 1;
    } else if (isMarketClosed) {
      if (dayOfWeek === 5) { // Friday after market
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/40 p-5 rounded-xl border border-indigo-500/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/20 rounded-lg">
            <BrainCircuit className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Next Day Top 10 ({nextTradingDay})</h2>
            <p className="text-sm text-indigo-300">MWUA Self-Learning Top 10 Screener</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            <button 
              onClick={() => setViewMode("reversal")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "reversal" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Reversals
            </button>
            <button 
              onClick={() => setViewMode("trend")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "trend" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Trend (Momentum)
            </button>
          </div>
          <div className="flex bg-slate-900 rounded-lg p-1">
            <button 
              onClick={() => setSortMode("ai")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${sortMode === "ai" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Sort by AI Score
            </button>
            <button 
              onClick={() => setSortMode("live")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${sortMode === "live" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Sort by Live %
            </button>
          </div>
          <select
            value={watchlistFilter}
            onChange={(e) => setWatchlistFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
          >
            <option value="Personal">Personal</option>
            <option value="Nifty500">Nifty 500</option>
            <option value="FNO">FnO (F&O)</option>
          </select>
          <select
            value={activeTimeframe}
            onChange={(e) => setActiveTimeframe(e.target.value as Timeframe)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading || !weights ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <BrainCircuit className="w-10 h-10 text-indigo-400 animate-pulse" />
            <p className="text-slate-400 font-medium">MWUA Engine processing D1-D4 states...</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">{error}</div>
      ) : (
        <div className="space-y-8">
          
          {/* SECTION A: Output Dashboard */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-100">Smart Top 10 Bullish ({nextTradingDay})</h3>
              </div>
              <div className="flex flex-col gap-3">
                {currentBullish.map((item, idx) => {
                  const max = viewMode === "trend" ? 135 : 185;
                  const score = viewMode === "trend" ? item.bullScore : item.reversalBullScore;
                  const pct = Math.min(100, Math.round((score / max) * 100));
                  return (
                    <div key={`${item.symbol}-${idx}`} className="bg-slate-800/60 rounded-xl border border-slate-700 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-lg text-slate-100 flex items-center gap-2">
                            {item.symbol}
                            <a href={getTradingViewUrl(item.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            {liveQuotes[item.symbol] !== undefined && (
                              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${liveQuotes[item.symbol] > 0 ? 'bg-emerald-500/10 text-emerald-400' : liveQuotes[item.symbol] < 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                {liveQuotes[item.symbol] > 0 ? '+' : ''}{liveQuotes[item.symbol].toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-indigo-300 font-mono">AI Confidence: {pct}%</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-slate-300 mb-1">Score: {score} / {max}</div>
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight className="w-5 h-5 text-rose-400" />
                <h3 className="text-lg font-bold text-slate-100">Smart Top 10 Bearish ({nextTradingDay})</h3>
              </div>
              <div className="flex flex-col gap-3">
                {currentBearish.map((item, idx) => {
                  const max = viewMode === "trend" ? 135 : 185;
                  const score = viewMode === "trend" ? item.bearScore : item.reversalBearScore;
                  const pct = Math.min(100, Math.round((score / max) * 100));
                  return (
                    <div key={`${item.symbol}-${idx}`} className="bg-slate-800/60 rounded-xl border border-slate-700 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-lg text-slate-100 flex items-center gap-2">
                            {item.symbol}
                            <a href={getTradingViewUrl(item.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            {liveQuotes[item.symbol] !== undefined && (
                              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${liveQuotes[item.symbol] > 0 ? 'bg-emerald-500/10 text-emerald-400' : liveQuotes[item.symbol] < 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                {liveQuotes[item.symbol] > 0 ? '+' : ''}{liveQuotes[item.symbol].toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-indigo-300 font-mono">AI Confidence: {pct}%</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-slate-300 mb-1">Score: {score} / {max}</div>
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={finalizeEOD} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Finalize EOD Run (Trigger Learning)
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
                      <option key={idx} value={idx}>{log.date} ({log.type})</option>
                    ))}
                  </select>
                )}
                </div>
              </div>
              
              {symbolSearchMetrics ? (
                <div className="flex-1 overflow-auto max-h-[500px]">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Total Signals</div>
                      <div className="text-xl font-bold text-slate-200">{symbolSearchMetrics.total}</div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Historical Win Rate</div>
                      <div className="text-xl font-bold text-indigo-400">{symbolSearchMetrics.winRate}%</div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                      <div className="text-slate-400 text-xs mb-1 font-medium">Average PnL</div>
                      <div className={`text-xl font-bold ${parseFloat(symbolSearchMetrics.avgPnl) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {parseFloat(symbolSearchMetrics.avgPnl) > 0 ? '+' : ''}{symbolSearchMetrics.avgPnl}%
                      </div>
                    </div>
                  </div>
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-slate-400 border-b border-slate-700/50 sticky top-0 bg-slate-800/90">
                      <tr>
                        <th className="py-2">Date</th>
                        <th className="py-2">Symbol</th>
                        <th className="py-2">Prediction</th>
                        <th className="py-2">Result</th>
                        <th className="py-2 text-right">Actual %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolSearchMetrics.history.map((pick, idx) => (
                        <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                          <td className="py-2">{pick.date}</td>
                          <td className="py-2 font-medium">{pick.symbol}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${pick.type === 'BULL' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {pick.type}
                            </span>
                          </td>
                          <td className="py-2">
                            {pick.actualOutcome ? (
                              <span className="text-emerald-400">Win</span>
                            ) : (
                              <span className="text-rose-400">Loss</span>
                            )}
                          </td>
                          <td className={`py-2 text-right font-mono ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : filteredAuditLogs[selectedAuditIdx] ? (
                <div className="flex-1 overflow-auto max-h-[500px]">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 flex justify-between items-center">
                      <div className="text-slate-300 text-sm font-medium">Overarching Bullish Stats</div>
                      <div className="flex gap-4 text-sm font-bold">
                        <span className="text-emerald-400">{overArchingMetrics.bullWinRate}% Win Rate</span>
                        <span className="text-emerald-400">Avg {parseFloat(overArchingMetrics.bullAvgPnl) > 0 ? '+' : ''}{overArchingMetrics.bullAvgPnl}%</span>
                      </div>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 flex justify-between items-center">
                      <div className="text-slate-300 text-sm font-medium">Overarching Bearish Stats</div>
                      <div className="flex gap-4 text-sm font-bold">
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
                            <th className="py-1">Result</th>
                            <th className="py-1 text-right">Actual %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAuditLogs[selectedAuditIdx].bullishPicks?.map((pick: any, idx: number) => (
                            <tr key={`${pick.symbol}-${idx}`} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                              <td className="py-1 text-slate-500">#{pick.rank}</td>
                              <td className="py-1 font-medium flex items-center gap-1">
                                {pick.symbol}
                                <a href={getTradingViewUrl(pick.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </td>
                              <td className="py-1">
                                {pick.actualOutcome ? (
                                  <span className="text-emerald-400">Win</span>
                                ) : (
                                  <span className="text-rose-400">Loss</span>
                                )}
                              </td>
                              <td className={`py-1 text-right font-mono ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                              </td>
                            </tr>
                          ))}
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
                            <th className="py-1">Result</th>
                            <th className="py-1 text-right">Actual %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAuditLogs[selectedAuditIdx].bearishPicks?.map((pick: any, idx: number) => (
                            <tr key={`${pick.symbol}-${idx}`} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                              <td className="py-1 text-slate-500">#{pick.rank}</td>
                              <td className="py-1 font-medium flex items-center gap-1">
                                {pick.symbol}
                                <a href={getTradingViewUrl(pick.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </td>
                              <td className="py-1">
                                {pick.actualOutcome ? (
                                  <span className="text-emerald-400">Win</span>
                                ) : (
                                  <span className="text-rose-400">Loss</span>
                                )}
                              </td>
                              <td className={`py-1 text-right font-mono ${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {pick.pnlPercent > 0 ? '+' : ''}{pick.pnlPercent}%
                              </td>
                            </tr>
                          ))}
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
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.type === 'BULL' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="py-2 text-center font-bold text-rose-400">{item.streak}</td>
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

            {/* SECTION C: Weight Matrix (The Brain) */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-100">MWUA Weight Matrix ({viewMode === "trend" ? "Trend" : "Reversal"})</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(viewMode === "trend" ? weights.trend : weights.reversal).map(([key, value]) => {
                  // Approximation of max weights for visual scaling
                  const maxBase = viewMode === "trend" ? 30 : 40; 
                  const pct = Math.min(100, (Number(value) / maxBase) * 100);
                  
                  // Label mapping
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
                        <span className="font-mono text-indigo-300">{Number(value).toFixed(0)} pts</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

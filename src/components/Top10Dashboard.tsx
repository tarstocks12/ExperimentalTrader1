import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { Timeframe } from '../types';
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from '../data/watchlists';

interface Top10Row {
  symbol: string;
  bullScore: number;
  bearScore: number;
  reversalBullScore: number;
  reversalBearScore: number;
  tfData: any;
}

export default function Top10Dashboard({ personalSymbols = [] }: { personalSymbols?: string[] }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<"reversal" | "trend">("reversal");
  const [watchlistFilter, setWatchlistFilter] = useState("FNO");
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");

  const TIMEFRAMES: Timeframe[] = ["15m", "1H", "4H", "1D", "1W"];

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      let targetList: string[] = [];
      if (watchlistFilter === "Personal") {
        targetList = personalSymbols;
      } else if (watchlistFilter === "Nifty500") {
        targetList = NIFTY_500_SYMBOLS_LIST;
      } else if (watchlistFilter === "FNO") {
        targetList = FNO_SYMBOLS_LIST;
      }

      if (targetList.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const chunkCount = 35;
      const chunks: string[][] = [];
      for (let i = 0; i < targetList.length; i += chunkCount) {
        chunks.push(targetList.slice(i, i + chunkCount));
      }

      const allData: any[] = [];
      for (const chunk of chunks) {
        const symbolsQuery = chunk.join(",");
        const response = await fetch(`/api/wt-dashboard?symbols=${encodeURIComponent(symbolsQuery)}`);
        if (!response.ok) {
          throw new Error(`API error (Status: ${response.status})`);
        }
        const json = await response.json();
        if (json.status === "ok" && Array.isArray(json.data)) {
          allData.push(...json.data);
        }
      }
      setData(allData);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [watchlistFilter, personalSymbols]);

  const scoredData = useMemo(() => {
    if (!data.length) return { trendBullish: [], trendBearish: [], revBullish: [], revBearish: [] };

    const scored: Top10Row[] = data.map(row => {
      const tfData = row.timeframes?.[activeTimeframe];
      if (!tfData || tfData.isUnavailable) {
        return { symbol: row.Symbol, bullScore: 0, bearScore: 0, reversalBullScore: 0, reversalBearScore: 0, tfData: null };
      }

      let bull = 0;
      let bear = 0;
      let revBull = 0;
      let revBear = 0;

      // WT (D3)
      if (tfData.isBull) bull += 15;
      if (tfData.isBear) bear += 15;
      if (tfData.wt1 > 0) bull += 5;
      if (tfData.wt1 > 40) bull += 5;
      if (tfData.wt1 < 0) bear += 5;
      if (tfData.wt1 < -40) bear += 5;

      // Reversal WT (D3) Exhaustion (Oversold/Overbought)
      if (tfData.wt1 < -40) revBull += 20;
      if (tfData.wt1 < -50) revBull += 20;
      if (tfData.isBull && tfData.wt1 < -30) revBull += 30;

      if (tfData.wt1 > 40) revBear += 20;
      if (tfData.wt1 > 50) revBear += 20;
      if (tfData.isBear && tfData.wt1 > 30) revBear += 30;

      // ST (D2)
      if (tfData.isStBull) bull += 20;
      if (tfData.isStBear) bear += 20;

      // Reversal ST (D2) Early flip
      if (tfData.isStBull && tfData.barsSinceCross < 5 && tfData.wt1 < 0) revBull += 15;
      if (tfData.isStBear && tfData.barsSinceCross < 5 && tfData.wt1 > 0) revBear += 15;

      // HMA (D1)
      if (tfData.hmaIsBull) bull += 20;
      if (tfData.hmaIsBear) bear += 20;

      // Reversal Early D1 HMA Shift (Price crosses HMA against trend)
      if (tfData.hmaIsBull && tfData.wt1 < -20) revBull += 20;
      if (tfData.hmaIsBear && tfData.wt1 > 20) revBear += 20;

      // TSI (D4)
      if (tfData.isTsiBull) bull += 15;
      if (tfData.isTsiBear) bear += 15;
      if (tfData.scaledTsi > 0) bull += 5;
      if (tfData.scaledTsi < 0) bear += 5;

      // Reversal TSI (D4) Exhaustion
      if (tfData.scaledTsi < -40) revBull += 15;
      if (tfData.scaledTsi < -50) revBull += 15;
      if (tfData.isTsiBull && tfData.scaledTsi < -30) revBull += 20;

      if (tfData.scaledTsi > 40) revBear += 15;
      if (tfData.scaledTsi > 50) revBear += 15;
      if (tfData.isTsiBear && tfData.scaledTsi > 30) revBear += 20;

      // HTF Confirmations (Macro Trend)
      if (tfData.screenerH1b) bull += 10;
      if (tfData.screenerH1s) bear += 10;
      if (tfData.isStHtf1Bull) bull += 10;
      if (tfData.isStHtf1Bear) bear += 10;
      if (tfData.screenerHmaHtf1b) bull += 10;
      if (tfData.screenerHmaHtf1s) bear += 10;
      if (tfData.screenerGcb) bull += 10;
      if (tfData.screenerGcs) bear += 10;

      // HTF Divergence (Counter Trend Reversal Bounce)
      if (tfData.screenerH1b && tfData.isBull && tfData.wt1 < 0) revBull += 15;
      if (tfData.screenerH1s && tfData.isBear && tfData.wt1 > 0) revBear += 15;

      // Recent Cross Bonus (Momentum)
      if (tfData.isBull && tfData.barsSinceCross < 3) bull += 10;
      if (tfData.isBear && tfData.barsSinceCross < 3) bear += 10;

      return { symbol: row.Symbol, bullScore: bull, bearScore: bear, reversalBullScore: revBull, reversalBearScore: revBear, tfData };
    });

    const validData = scored.filter(s => s.tfData !== null);

    const trendBullish = [...validData].sort((a, b) => b.bullScore - a.bullScore).slice(0, 10);
    const trendBearish = [...validData].sort((a, b) => b.bearScore - a.bearScore).slice(0, 10);

    const revBullish = [...validData].sort((a, b) => b.reversalBullScore - a.reversalBullScore).slice(0, 10);
    const revBearish = [...validData].sort((a, b) => b.reversalBearScore - a.reversalBearScore).slice(0, 10);

    return { trendBullish, trendBearish, revBullish, revBearish };
  }, [data, activeTimeframe]);

  const getTradingViewUrl = (symbol: string) => {
    let formattedSymbol = symbol;
    if (symbol === "NIFTY") formattedSymbol = "NIFTY";
    else if (symbol === "BANKNIFTY") formattedSymbol = "BANKNIFTY";
    else formattedSymbol = symbol.replace("_", "-");
    return `https://www.tradingview.com/chart/?symbol=NSE:${formattedSymbol}`;
  };

  const renderCard = (item: Top10Row, type: "bull" | "bear", index: number) => {
    const isBull = type === "bull";
    const score = isBull 
      ? (viewMode === "trend" ? item.bullScore : item.reversalBullScore)
      : (viewMode === "trend" ? item.bearScore : item.reversalBearScore);
    const maxScore = viewMode === "trend" ? 135 : 185;
    const percentage = Math.min(100, Math.round((score / maxScore) * 100));

    return (
      <div key={item.symbol} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 hover:border-slate-600 transition-colors flex items-center justify-between group">
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isBull ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            #{index + 1}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-100">{item.symbol}</span>
              <a href={getTradingViewUrl(item.symbol)} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-400 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-400">Score: {score}</span>
              <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${isBull ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Dashboard specific indicators summary */}
          <div className="hidden sm:flex gap-1.5">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.tfData.hmaIsBull ? 'bg-emerald-500/10 text-emerald-400' : item.tfData.hmaIsBear ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-700 text-slate-400'}`}>
              D1 HMA
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.tfData.isStBull ? 'bg-emerald-500/10 text-emerald-400' : item.tfData.isStBear ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-700 text-slate-400'}`}>
              D2 ST
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.tfData.isBull ? 'bg-emerald-500/10 text-emerald-400' : item.tfData.isBear ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-700 text-slate-400'}`}>
              D3 WT
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.tfData.isTsiBull ? 'bg-emerald-500/10 text-emerald-400' : item.tfData.isTsiBear ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-700 text-slate-400'}`}>
              D4 TSI
            </span>
          </div>
          <button className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${isBull ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'}`}>
            {isBull ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            Trade {viewMode === "reversal" ? "Reversal" : ""} {isBull ? 'Long' : 'Short'}
          </button>
        </div>
      </div>
    );
  };

  const currentBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;
  const currentBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Top 10 Vibe Scanner</h2>
            <p className="text-sm text-slate-400">Scanning D1-D4 across watchlists</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
            <button 
              onClick={() => setViewMode("reversal")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "reversal" ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Reversals
            </button>
            <button 
              onClick={() => setViewMode("trend")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === "trend" ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Trend (Momentum)
            </button>
          </div>
          <select
            value={watchlistFilter}
            onChange={(e) => setWatchlistFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
          >
            <option value="Personal">Personal</option>
            <option value="Nifty500">Nifty 500</option>
            <option value="FNO">FnO (F&O)</option>
          </select>
          <select
            value={activeTimeframe}
            onChange={(e) => setActiveTimeframe(e.target.value as Timeframe)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500 transition-colors"
          >
            {TIMEFRAMES.map(tf => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-slate-400 font-medium">Scanning D1-D4 indicators for Top 10 setups...</p>
          </div>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Bullish Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-bold text-slate-100">Top 10 {viewMode === "reversal" ? "Reversal " : ""}Bullish</h3>
            </div>
            {currentBullish.length > 0 ? (
              <div className="flex flex-col gap-3">
                {currentBullish.map((item, idx) => renderCard(item, "bull", idx))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-800/30 rounded-xl border border-slate-700/50 text-slate-500">
                No bullish candidates found in {watchlistFilter} for {activeTimeframe}.
              </div>
            )}
          </div>

          {/* Bearish Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="w-5 h-5 text-rose-400" />
              <h3 className="text-lg font-bold text-slate-100">Top 10 {viewMode === "reversal" ? "Reversal " : ""}Bearish</h3>
            </div>
            {currentBearish.length > 0 ? (
              <div className="flex flex-col gap-3">
                {currentBearish.map((item, idx) => renderCard(item, "bear", idx))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-800/30 rounded-xl border border-slate-700/50 text-slate-500">
                No bearish candidates found in {watchlistFilter} for {activeTimeframe}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

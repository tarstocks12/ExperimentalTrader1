import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, SlidersHorizontal, Settings2, ArrowDownUp, ExternalLink } from 'lucide-react';
import type { Timeframe } from '../types';
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from '../data/watchlists';

type IndicatorType = "NONE" | "HMA" | "ST" | "WT" | "TSI";
type ModeType = "CTF" | "HTF1";
type RegimeCondition = "ALL" | "BULL" | "BEAR";
type ValueCondition = "ALL" | "ABOVE_0" | "BELOW_0" | "ABOVE_40" | "BELOW_MINUS_40" | "ABOVE_53" | "BELOW_MINUS_53";
type SortOrder = "NONE" | "ASC" | "DESC"; // Low to high, high to low

interface ColumnSetup {
  id: number;
  indicator: IndicatorType;
  timeframe: Timeframe;
  mode: ModeType;
  regime: RegimeCondition;
  valueCond: ValueCondition;
  sort: SortOrder;
}

export interface WtEmaTimeframeData {
  wt1: number;
  isBull: boolean;
  isBear: boolean;
  barsSinceCross: number;
  
  hmaIsBull: boolean;
  hmaIsBear: boolean;
  hmaBarsSinceCross: number;
  screenerHmaHtf1b: boolean;
  screenerHmaHtf1s: boolean;
  screenerHmaHtf1Bars: number;

  isStBull: boolean;
  isStBear: boolean;
  stBarsSinceCross: number;
  isStHtf1Bull: boolean;
  isStHtf1Bear: boolean;
  stHtf1BarsSinceCross: number;

  screenerH1b: boolean;
  screenerH1s: boolean;
  screenerH1Bars: number;
  screenerH1wt1: number;

  scaledTsi: number;
  isTsiBull: boolean;
  isTsiBear: boolean;
  tsiBarsSinceCross: number;
  screenerGcb: boolean;
  screenerGcs: boolean;
  screenerGcBars: number;
  screenerGcTsi: number;
  
  isUnavailable: boolean;
}

export interface SymbolRow {
  Symbol: string;
  Description: string;
  timeframes: {
    [key in Timeframe]?: WtEmaTimeframeData;
  };
}

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];

export function D8Screener({ personalSymbols = [] }: { personalSymbols?: string[] }) {
  const [data, setData] = useState<SymbolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlistFilter, setWatchlistFilter] = useState("Personal");

  const [setups, setSetups] = useState<ColumnSetup[]>([
    { id: 1, indicator: "ST", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
    { id: 2, indicator: "WT", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
    { id: 3, indicator: "HMA", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
    { id: 4, indicator: "NONE", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
    { id: 5, indicator: "NONE", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
    { id: 6, indicator: "NONE", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" },
  ]);

  const [activeSetups, setActiveSetups] = useState<ColumnSetup[]>([]);
  const [visibleRows, setVisibleRows] = useState<number>(3);

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
      } else {
        targetList = FNO_SYMBOLS_LIST;
      }

      if (targetList.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const chunkSize = 50;
      let allData: SymbolRow[] = [];
      
      for (let i = 0; i < targetList.length; i += chunkSize) {
        const chunk = targetList.slice(i, i + chunkSize);
        const res = await fetch(`/api/wt-dashboard?engine=quant_swt&symbols=${encodeURIComponent(chunk.join(","))}`);
        if (!res.ok) throw new Error("Failed to fetch data");
        const json = await res.json();
        if (json.data) {
          allData = [...allData, ...json.data];
        }
      }
      
      setData(allData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto run scan on first load if we don't have active setups yet
    if (activeSetups.length === 0 && setups.length > 0) {
      setActiveSetups(setups.slice(0, visibleRows));
    }
  }, [setups, visibleRows, activeSetups.length]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [watchlistFilter]);

  const runScan = () => {
    setActiveSetups(setups.slice(0, visibleRows));
  };

  const resetSetup = (id: number) => {
    setSetups(prev => prev.map(s => (s.id === id ? { ...s, indicator: "NONE", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" } : s)));
  };

  const resetAllSetups = () => {
    setSetups(prev => prev.map(s => ({ ...s, indicator: "NONE", timeframe: "1H", mode: "CTF", regime: "ALL", valueCond: "ALL", sort: "NONE" })));
  };

  const updateSetup = (id: number, key: keyof ColumnSetup, value: any) => {
    setSetups(prev => prev.map(s => (s.id === id ? { ...s, [key]: value } : s)));
  };

  const getTradingViewUrl = (symbol: string) => {
    try {
      const saved = localStorage.getItem("custom_tradingview_links");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed[symbol]) {
          return parsed[symbol];
        }
      }
    } catch (e) {
      console.warn("Error reading custom TV links:", e);
    }
    return `https://www.tradingview.com/chart/?symbol=NSE%3A${symbol}`;
  };

  const getCellData = (row: SymbolRow, setup: ColumnSetup) => {
    if (setup.indicator === "NONE") return null;
    const tfData = row.timeframes[setup.timeframe];
    if (!tfData || tfData.isUnavailable) return { isUnavailable: true };

    let isBull = false;
    let isBear = false;
    let bars = 0;
    let val = 0;

    if (setup.indicator === "HMA") {
      if (setup.mode === "CTF") {
        isBull = tfData.hmaIsBull;
        isBear = tfData.hmaIsBear;
        bars = tfData.hmaBarsSinceCross;
      } else {
        isBull = tfData.screenerHmaHtf1b;
        isBear = tfData.screenerHmaHtf1s;
        bars = tfData.screenerHmaHtf1Bars;
      }
    } else if (setup.indicator === "ST") {
      if (setup.mode === "CTF") {
        isBull = tfData.isStBull;
        isBear = tfData.isStBear;
        bars = tfData.stBarsSinceCross;
      } else {
        isBull = tfData.isStHtf1Bull;
        isBear = tfData.isStHtf1Bear;
        bars = tfData.stHtf1BarsSinceCross;
      }
    } else if (setup.indicator === "WT") {
      if (setup.mode === "CTF") {
        isBull = tfData.isBull;
        isBear = tfData.isBear;
        bars = tfData.barsSinceCross;
        val = tfData.wt1;
      } else {
        isBull = tfData.screenerH1b;
        isBear = tfData.screenerH1s;
        bars = tfData.screenerH1Bars;
        val = tfData.screenerH1wt1;
      }
    } else if (setup.indicator === "TSI") {
      if (setup.mode === "CTF") {
        isBull = tfData.isTsiBull;
        isBear = tfData.isTsiBear;
        bars = tfData.tsiBarsSinceCross;
        val = tfData.scaledTsi;
      } else {
        isBull = tfData.screenerGcb;
        isBear = tfData.screenerGcs;
        bars = tfData.screenerGcBars;
        val = tfData.screenerGcTsi;
      }
    }

    return { isBull, isBear, bars, val, isUnavailable: false };
  };

  const passesCondition = (cell: ReturnType<typeof getCellData>, setup: ColumnSetup) => {
    if (!cell) return true;
    if (cell.isUnavailable) return false;

    if (setup.regime === "BULL" && !cell.isBull) return false;
    if (setup.regime === "BEAR" && !cell.isBear) return false;

    if (setup.indicator === "WT" || setup.indicator === "TSI") {
      if (setup.valueCond === "ABOVE_0" && cell.val <= 0) return false;
      if (setup.valueCond === "BELOW_0" && cell.val >= 0) return false;
      if (setup.valueCond === "ABOVE_40" && cell.val <= 40) return false;
      if (setup.valueCond === "BELOW_MINUS_40" && cell.val >= -40) return false;
      if (setup.valueCond === "ABOVE_53" && cell.val <= 53) return false;
      if (setup.valueCond === "BELOW_MINUS_53" && cell.val >= -53) return false;
    }

    return true;
  };

  const filteredData = useMemo(() => {
    let filtered = data.filter(row => {
      // Must pass ALL active setups
      for (const setup of activeSetups) {
        if (setup.indicator === "NONE") continue;
        const cell = getCellData(row, setup);
        if (!passesCondition(cell, setup)) return false;
      }
      return true;
    });

    // Apply sorting
    const sortSetup = activeSetups.find(s => s.sort !== "NONE");
    if (sortSetup) {
      filtered.sort((a, b) => {
        const cellA = getCellData(a, sortSetup);
        const cellB = getCellData(b, sortSetup);
        const barsA = cellA && !cellA.isUnavailable ? cellA.bars : 999999;
        const barsB = cellB && !cellB.isUnavailable ? cellB.bars : 999999;
        return sortSetup.sort === "ASC" ? barsA - barsB : barsB - barsA;
      });
    }

    return filtered;
  }, [data, activeSetups]);

  const toggleSort = (id: number) => {
    setActiveSetups(prev => prev.map(s => {
      if (s.id === id) {
        if (s.sort === "NONE") return { ...s, sort: "ASC" };
        if (s.sort === "ASC") return { ...s, sort: "DESC" };
        return { ...s, sort: "NONE" };
      }
      // Only one column can be sorted at a time
      return { ...s, sort: "NONE" };
    }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] p-5 rounded-2xl border border-zinc-800/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-white tracking-tight">D8 Screener</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
              Strategic Filter
            </span>
          </div>
          <p className="text-sm text-[#8e9299]">
            Fully customizable multi-indicator filtering matrix.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={watchlistFilter}
            onChange={(e) => setWatchlistFilter(e.target.value)}
            className="h-9 bg-[#1a1d24] border-zinc-800 text-sm text-zinc-300 rounded-lg px-3 hover:border-zinc-700 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          >
            <option value="All">All Supported</option>
            <option value="Personal">Personal Watchlist</option>
            <option value="Nifty500">Nifty 500</option>
            <option value="FNO">F&O Only</option>
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className={`h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-all shadow-[0_0_20px_rgba(52,211,153,0.15)] flex items-center gap-2 ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Setup Configurator */}
      <div className="bg-[#111318] rounded-2xl border border-zinc-800/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Setup Configuration</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase">Rows:</span>
              <select
                value={visibleRows}
                onChange={(e) => setVisibleRows(Number(e.target.value))}
                className="h-8 bg-[#1a1d24] border-zinc-800 text-xs text-white rounded-lg px-2 hover:border-zinc-700 outline-none"
              >
                {[1, 2, 3, 4, 5, 6].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <button
              onClick={resetAllSetups}
              className="h-8 px-4 bg-[#222630] hover:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-all tracking-wider"
            >
              RESET ALL
            </button>
            <button
              onClick={runScan}
              className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(52,211,153,0.15)] tracking-wider"
            >
              RUN SCAN
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="space-y-3">
            {setups.slice(0, visibleRows).map((setup, idx) => (
              <div key={setup.id} className="flex flex-wrap items-center gap-3 p-3 bg-[#1a1d24]/50 rounded-xl border border-zinc-800/30">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#222630] text-zinc-400 text-xs font-bold font-mono border border-zinc-800">
                  {idx + 1}
                </div>
                
                <select
                  value={setup.indicator}
                  onChange={(e) => updateSetup(setup.id, "indicator", e.target.value)}
                  className="h-8 bg-[#222630] border-zinc-800/50 text-xs text-white rounded-lg px-2 hover:border-zinc-700 transition-colors outline-none"
                >
                  <option value="NONE">-- Select Indicator --</option>
                  <option value="HMA">HMA (Hull MA)</option>
                  <option value="ST">ST (Supertrend)</option>
                  <option value="WT">WT (WaveTrend)</option>
                  <option value="TSI">TSI (True Strength)</option>
                </select>

                {setup.indicator !== "NONE" && (
                  <>
                    <select
                      value={setup.timeframe}
                      onChange={(e) => updateSetup(setup.id, "timeframe", e.target.value)}
                      className="h-8 bg-[#222630] border-zinc-800/50 text-xs text-white rounded-lg px-2 hover:border-zinc-700 transition-colors outline-none"
                    >
                      {TIMEFRAMES.map(tf => (
                        <option key={tf} value={tf}>{tf}</option>
                      ))}
                    </select>

                    <select
                      value={setup.mode}
                      onChange={(e) => updateSetup(setup.id, "mode", e.target.value)}
                      className="h-8 bg-[#222630] border-zinc-800/50 text-xs text-white rounded-lg px-2 hover:border-zinc-700 transition-colors outline-none"
                    >
                      <option value="CTF">Current TF</option>
                      <option value="HTF1">Higher TF (HTF1)</option>
                    </select>

                    <select
                      value={setup.regime}
                      onChange={(e) => updateSetup(setup.id, "regime", e.target.value)}
                      className="h-8 bg-[#222630] border-zinc-800/50 text-xs text-white rounded-lg px-2 hover:border-zinc-700 transition-colors outline-none"
                    >
                      <option value="ALL">Any Regime</option>
                      <option value="BULL">Bullish</option>
                      <option value="BEAR">Bearish</option>
                    </select>

                    {(setup.indicator === "WT" || setup.indicator === "TSI") && (
                      <select
                        value={setup.valueCond}
                        onChange={(e) => updateSetup(setup.id, "valueCond", e.target.value)}
                        className="h-8 bg-[#222630] border-zinc-800/50 text-xs text-white rounded-lg px-2 hover:border-zinc-700 transition-colors outline-none"
                      >
                        <option value="ALL">Any Value</option>
                        <option value="ABOVE_0">{">"} 0 Line</option>
                        <option value="BELOW_0">{"<"} 0 Line</option>
                        <option value="ABOVE_40">{">"} 40 (Overbought)</option>
                        <option value="BELOW_MINUS_40">{"<"} -40 (Oversold)</option>
                        {setup.indicator === "WT" && (
                          <>
                            <option value="ABOVE_53">{">"} 53 (Extreme OB)</option>
                            <option value="BELOW_MINUS_53">{"<"} -53 (Extreme OS)</option>
                          </>
                        )}
                      </select>
                    )}
                  </>
                )}
                <div className="ml-auto">
                  <button
                    onClick={() => resetSetup(setup.id)}
                    className="text-[10px] text-zinc-500 hover:text-white uppercase tracking-wider font-bold px-2 py-1 rounded bg-[#222630] hover:bg-zinc-700 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-[#111318] rounded-2xl border border-zinc-800/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Results Matrix</h2>
            <span className="ml-2 text-xs text-zinc-500">
              {filteredData.length} symbols match
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/50 bg-[#16181d]">
                <th className="p-4 font-semibold text-[#8e9299] text-xs uppercase tracking-wider min-w-[120px]">
                  Symbol
                </th>
                {activeSetups.map((setup, index) => (
                  <th key={setup.id} className="p-4 font-semibold text-[#8e9299] text-xs uppercase tracking-wider text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort(setup.id)}>
                        <span>Col {index + 1}</span>
                        {setup.sort !== "NONE" ? (
                          <ArrowDownUp className={`w-3.5 h-3.5 ${setup.sort === 'DESC' ? 'text-amber-400' : 'text-emerald-400'}`} />
                        ) : (
                          <ArrowDownUp className="w-3.5 h-3.5 opacity-30" />
                        )}
                      </div>
                      <div className="text-[9px] font-mono opacity-60">
                        {setup.indicator === "NONE" ? "Empty" : `${setup.indicator} ${setup.timeframe}`}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {filteredData.map((row) => (
                <tr key={row.Symbol} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-white tracking-tight">{row.Symbol}</span>
                        <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{row.Description}</span>
                      </div>
                      <a
                        href={getTradingViewUrl(row.Symbol)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-[#8e9299] hover:text-orange-400 hover:bg-[#1a1c21]/60 rounded transition-colors shrink-0 ml-auto"
                        title={`Open ${row.Symbol} TradingView Chart`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                  {activeSetups.map(setup => {
                    const cell = getCellData(row, setup);
                    return (
                      <td key={setup.id} className="p-4 text-center">
                        {setup.indicator === "NONE" ? (
                          <span className="text-zinc-700 text-xs">-</span>
                        ) : cell && !cell.isUnavailable ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className={`flex flex-col items-center justify-center px-2 py-1 rounded text-[10px] font-bold border text-center ${
                              cell.isBull
                                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400"
                                : cell.isBear
                                ? "bg-amber-950/20 border-amber-500/30 text-amber-500"
                                : "bg-[#181a21]/50 border-zinc-800 text-zinc-500"
                            }`}>
                              <span className="flex items-center gap-1 tracking-wider uppercase">
                                {cell.isBull ? (
                                  <><ArrowUpRight className="w-3 h-3" /> BULL</>
                                ) : cell.isBear ? (
                                  <><ArrowDownRight className="w-3 h-3" /> BEAR</>
                                ) : (
                                  "WAIT"
                                )}
                              </span>
                              {(cell.bars > 0) && (cell.isBull || cell.isBear) && (
                                <span className="text-[8px] opacity-80 font-mono mt-0.5">
                                  {cell.bars} BARS
                                </span>
                              )}
                            </div>
                            {(setup.indicator === "WT" || setup.indicator === "TSI") && (
                              <div className="mt-1.5 text-[9px] font-mono text-zinc-400">
                                Val: <span className={cell.val > 0 ? "text-emerald-400/80" : "text-amber-500/80"}>{cell.val.toFixed(1)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">N/A</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={activeSetups.length + 1} className="p-12 text-center text-[#8e9299]">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <SlidersHorizontal className="w-8 h-8 opacity-20" />
                      <p>No symbols match the current strategic filter combination.</p>
                      <p className="text-xs opacity-60">Try loosening the regime or value constraints.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

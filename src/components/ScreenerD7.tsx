import React, { useState, useEffect } from "react";
import { 
  ExternalLink, 
  Search, 
  Globe, 
  RefreshCw,
  SlidersHorizontal,
  Filter,
  TrendingUp,
  TrendingDown,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Timeframe } from "../types.js";
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from "../data/watchlists.js";

interface ScreenerTimeframeData {
  screenerCb: boolean;
  screenerCs: boolean;
  screenerBars: number;
  screenerHxb?: boolean;
  screenerHxs?: boolean;
  screenerHxBars?: number;
  screenerGcb?: boolean;
  screenerGcs?: boolean;
  screenerGcBars?: number;
  screenerH1b?: boolean;
  screenerH1s?: boolean;
  screenerH1Bars?: number;
  isUnavailable?: boolean;
}

interface ScreenerSymbolRow {
  Symbol: string;
  Description: string;
  isUnavailable?: boolean;
  timeframes: {
    [key in Timeframe]?: ScreenerTimeframeData;
  };
}

interface ScreenerD7Props {
  personalSymbols: string[];
}

export default function ScreenerD7({ personalSymbols }: ScreenerD7Props) {
  const timeframes: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];
  
  // States
  const [signalType, setSignalType] = useState<"WT" | "CB_CS" | "HX" | "GC">("WT");
  const [activeWatchlist, setActiveWatchlist] = useState<"personal" | "nifty500" | "fno">("personal");
  const [symbolsData, setSymbolsData] = useState<ScreenerSymbolRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // Multi-select Timeframe Filters (all active by default)
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"]);
  
  // Slider for Min Active Timeframes
  const [minActiveTfs, setMinActiveTfs] = useState<number>(1);
  
  // Global Signal Filter (All, BullOnly, BearOnly, AnyActive)
  const [globalSignalFilter, setGlobalSignalFilter] = useState<"All" | "BullOnly" | "BearOnly" | "AnyActive">("All");

  // Per-Timeframe Column Filter states (All, Bullish, Bearish)
  const [tfFilters, setTfFilters] = useState<{[key in Timeframe]?: "All" | "BULL" | "BEAR"}>({});

  // Sorting
  const [sortField, setSortField] = useState<string>("SignalSummary");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(250);

  // Get TradingView URL
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

  // Filter Master List of symbols by active Watchlist and Search Query
  const getFilteredMasterSymbols = (): string[] => {
    let list: string[] = [];
    if (activeWatchlist === "personal") {
      list = personalSymbols;
    } else if (activeWatchlist === "nifty500") {
      list = NIFTY_500_SYMBOLS_LIST;
    } else {
      list = FNO_SYMBOLS_LIST;
    }

    const q = searchQuery.trim().toUpperCase();
    if (q) {
      list = list.filter(sym => sym.toUpperCase().includes(q));
    }
    return list;
  };

  const filteredMasterSymbols = getFilteredMasterSymbols();
  const totalItems = filteredMasterSymbols.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const displayPage = Math.min(currentPage, totalPages);

  // Get active symbols to query for the current page
  const getTargetSymbols = (): string[] => {
    const startIndex = (displayPage - 1) * pageSize;
    return filteredMasterSymbols.slice(startIndex, startIndex + pageSize);
  };

  const fetchScreenerData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const targets = getTargetSymbols();

    if (targets.length === 0) {
      setSymbolsData([]);
      setIsLoading(false);
      return;
    }

    try {
      const symbolsQuery = targets.join(",");
      const response = await fetch(`/api/wt-dashboard?symbols=${encodeURIComponent(symbolsQuery)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP fetch error ${response.status}`);
      }

      const resJson = await response.json();
      if (resJson.status === "ok" && Array.isArray(resJson.data)) {
        setSymbolsData(resJson.data);
        setLastRefreshed(new Date());
      } else {
        throw new Error(resJson.message || "Invalid data payload returned by server");
      }
    } catch (error: any) {
      console.error("Error fetching D7 Screener data:", error);
      setErrorMessage(error.message || "Failed loading live Screener indicator dataset.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto refresh every 30 seconds to behave as "real-time" with paginated parameters
  useEffect(() => {
    fetchScreenerData();
    const interval = setInterval(() => {
      fetchScreenerData();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeWatchlist, personalSymbols.length, searchQuery, displayPage, pageSize]);

  // Reset page to 1 when watchlist or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeWatchlist, searchQuery]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const resetAllFilters = () => {
    setSignalType("WT");
    setGlobalSignalFilter("All");
    setTfFilters({});
    setSearchQuery("");
    setSelectedTimeframes(["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"]);
    setMinActiveTfs(1);
    setSortField("SignalSummary");
    setSortDirection("desc");
  };

  // Helper to calculate Signal Summary info for a row
  const getSummaryInfo = (row: ScreenerSymbolRow) => {
    let activeSignals: { type: "BULL" | "BEAR"; bars: number }[] = [];
    for (const tf of timeframes) {
      if (!selectedTimeframes.includes(tf)) continue;
      const data = row.timeframes[tf];
      if (data && !data.isUnavailable) {
        if (signalType === "WT") {
          if (data.screenerH1b) {
            activeSignals.push({ type: "BULL", bars: data.screenerH1Bars ?? 0 });
          } else if (data.screenerH1s) {
            activeSignals.push({ type: "BEAR", bars: data.screenerH1Bars ?? 0 });
          }
        } else if (signalType === "CB_CS") {
          if (data.screenerCb) {
            activeSignals.push({ type: "BULL", bars: data.screenerBars });
          } else if (data.screenerCs) {
            activeSignals.push({ type: "BEAR", bars: data.screenerBars });
          }
        } else if (signalType === "HX") {
          if (data.screenerHxb) {
            activeSignals.push({ type: "BULL", bars: data.screenerHxBars ?? 0 });
          } else if (data.screenerHxs) {
            activeSignals.push({ type: "BEAR", bars: data.screenerHxBars ?? 0 });
          }
        } else if (signalType === "GC") {
          if (data.screenerGcb) {
            activeSignals.push({ type: "BULL", bars: data.screenerGcBars ?? 0 });
          } else if (data.screenerGcs) {
            activeSignals.push({ type: "BEAR", bars: data.screenerGcBars ?? 0 });
          }
        }
      }
    }

    let summary = "NONE";
    let count = activeSignals.length;
    let minBars = 999999;

    if (activeSignals.length > 0) {
      minBars = Math.min(...activeSignals.map(s => s.bars));
      const mostRecent = activeSignals.filter(s => s.bars === minBars);
      const hasBull = mostRecent.some(s => s.type === "BULL");

      if (signalType === "WT") {
        const anyBull = activeSignals.some(s => s.type === "BULL");
        const anyBear = activeSignals.some(s => s.type === "BEAR");
        if (anyBull && anyBear) {
          summary = "H1B";
        } else {
          summary = hasBull ? "H1B" : "H1S";
        }
      } else if (signalType === "CB_CS") {
        summary = hasBull ? "CB" : "CS";
      } else if (signalType === "HX") {
        summary = hasBull ? "HXB" : "HXS";
      } else if (signalType === "GC") {
        summary = hasBull ? "GCB" : "GCS";
      }
    }

    return { summary, count, minBars };
  };

  // Filtering Logic
  const filteredRows = symbolsData.filter(row => {
    // 1. Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const symbolMatches = row.Symbol.toLowerCase().includes(q);
      const descMatches = row.Description.toLowerCase().includes(q);
      if (!symbolMatches && !descMatches) return false;
    }

    const { summary, count } = getSummaryInfo(row);

    // 2. Global Signal Filter
    if (globalSignalFilter !== "All") {
      if (globalSignalFilter === "BullOnly") {
        if (summary !== "CB" && summary !== "HXB" && summary !== "GCB" && summary !== "H1B") return false;
      } else if (globalSignalFilter === "BearOnly") {
        if (summary !== "CS" && summary !== "HXS" && summary !== "GCS" && summary !== "H1S") return false;
      } else if (globalSignalFilter === "AnyActive") {
        if (count === 0) return false;
      }
    }

    // 3. Min Active Timeframes Slider Filter
    if (count < minActiveTfs) {
      return false;
    }

    // 4. Individual Timeframe Column filters
    for (const tf of timeframes) {
      if (!selectedTimeframes.includes(tf)) continue;
      const filterVal = tfFilters[tf];
      if (filterVal && filterVal !== "All") {
        const data = row.timeframes[tf];
        if (!data || data.isUnavailable) return false;
        
        if (signalType === "WT") {
          if (filterVal === "BULL" && !data.screenerH1b) return false;
          if (filterVal === "BEAR" && !data.screenerH1s) return false;
        } else if (signalType === "CB_CS") {
          if (filterVal === "BULL" && !data.screenerCb) return false;
          if (filterVal === "BEAR" && !data.screenerCs) return false;
        } else if (signalType === "HX") {
          if (filterVal === "BULL" && !data.screenerHxb) return false;
          if (filterVal === "BEAR" && !data.screenerHxs) return false;
        } else if (signalType === "GC") {
          if (filterVal === "BULL" && !data.screenerGcb) return false;
          if (filterVal === "BEAR" && !data.screenerGcs) return false;
        }
      }
    }

    return true;
  });

  // Sorting Logic
  const sortedRows = [...filteredRows].sort((a, b) => {
    const infoA = getSummaryInfo(a);
    const infoB = getSummaryInfo(b);

    if (sortField === "Symbol") {
      const valA = a.Symbol;
      const valB = b.Symbol;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "SignalSummary") {
      const getScore = (sum: string) => {
        if (sum === "CB" || sum === "HXB" || sum === "GCB" || sum === "H1B") return 2;
        if (sum === "CS" || sum === "HXS" || sum === "GCS" || sum === "H1S") return 1;
        return 0;
      };
      const scoreA = getScore(infoA.summary);
      const scoreB = getScore(infoB.summary);
      if (scoreA !== scoreB) {
        return sortDirection === "desc" ? scoreB - scoreA : scoreA - scoreB;
      }
      if (infoA.minBars !== infoB.minBars) {
        return sortDirection === "desc" ? infoA.minBars - infoB.minBars : infoB.minBars - infoA.minBars;
      }
      return a.Symbol.localeCompare(b.Symbol);
    } else if (sortField === "ActiveTfCount") {
      const scoreA = infoA.count;
      const scoreB = infoB.count;
      if (scoreA !== scoreB) {
        return sortDirection === "desc" ? scoreB - scoreA : scoreA - scoreB;
      }
      return a.Symbol.localeCompare(b.Symbol);
    } else {
      // Timeframe column sorting
      const tf = sortField as Timeframe;
      const tfA = a.timeframes[tf];
      const tfB = b.timeframes[tf];

      const getTfScore = (item: any) => {
        if (!item || item.isUnavailable) return 0;
        if (signalType === "WT") {
          if (item.screenerH1b) return 2;
          if (item.screenerH1s) return 1;
        } else if (signalType === "CB_CS") {
          if (item.screenerCb) return 2;
          if (item.screenerCs) return 1;
        } else if (signalType === "HX") {
          if (item.screenerHxb) return 2;
          if (item.screenerHxs) return 1;
        } else if (signalType === "GC") {
          if (item.screenerGcb) return 2;
          if (item.screenerGcs) return 1;
        }
        return 0;
      };

      const scoreA = getTfScore(tfA);
      const scoreB = getTfScore(tfB);

      if (scoreA !== scoreB) {
        return sortDirection === "desc" ? scoreB - scoreA : scoreA - scoreB;
      } else {
        if (scoreA === 2 || scoreA === 1) {
          const barsA = (
            signalType === "WT" ? tfA?.screenerH1Bars : 
            signalType === "CB_CS" ? tfA?.screenerBars : 
            signalType === "HX" ? tfA?.screenerHxBars : 
            tfA?.screenerGcBars
          ) ?? 999999;
          const barsB = (
            signalType === "WT" ? tfB?.screenerH1Bars : 
            signalType === "CB_CS" ? tfB?.screenerBars : 
            signalType === "HX" ? tfB?.screenerHxBars : 
            tfB?.screenerGcBars
          ) ?? 999999;
          return sortDirection === "desc" ? barsA - barsB : barsB - barsA;
        } else {
          return 0;
        }
      }
    }
  });

  const hasActiveFilters = 
    Object.values(tfFilters).some(v => v && v !== "All") || 
    searchQuery !== "" || 
    signalType !== "WT" || 
    globalSignalFilter !== "All" || 
    minActiveTfs > 1 || 
    selectedTimeframes.length < 8;

  // Render badge helper
  const renderTimeframeCell = (tf: Timeframe, row: ScreenerSymbolRow) => {
    const data = row.timeframes[tf];
    if (!data || data.isUnavailable) {
      return <span className="text-zinc-600">—</span>;
    }

    if (signalType === "WT") {
      if (data.screenerH1b) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-[#06b6d4] text-black border border-[#06b6d4]/30 shadow-[0_0_8px_rgba(6,182,212,0.3)]">
              H1B
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerH1Bars} {data.screenerH1Bars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      } else if (data.screenerH1s) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-[#f97316] text-white border border-[#f97316]/30 shadow-[0_0_8px_rgba(249,115,22,0.3)]">
              H1S
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerH1Bars} {data.screenerH1Bars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      }
    } else if (signalType === "CB_CS") {
      if (data.screenerCb) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
              CB
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerBars} {data.screenerBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      } else if (data.screenerCs) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
              CS
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerBars} {data.screenerBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      }
    } else if (signalType === "HX") {
      if (data.screenerHxb) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-sky-500 text-white border border-sky-400/30 shadow-[0_0_8px_rgba(14,165,233,0.3)]">
              HXB
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerHxBars} {data.screenerHxBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      } else if (data.screenerHxs) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider bg-violet-600 text-white border border-violet-500/30 shadow-[0_0_8px_rgba(124,58,237,0.3)]">
              HXS
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerHxBars} {data.screenerHxBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      }
    } else if (signalType === "GC") {
      if (data.screenerGcb) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider bg-amber-500 text-black border border-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.3)]">
              GCB
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerGcBars} {data.screenerGcBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      } else if (data.screenerGcs) {
        return (
          <div className="flex flex-col items-center space-y-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-fuchsia-500 text-white border border-fuchsia-400/30 shadow-[0_0_8px_rgba(217,70,239,0.3)]">
              GCS
            </span>
            <span className="text-[8px] text-zinc-500 block">
              {data.screenerGcBars} {data.screenerGcBars === 1 ? "bar" : "bars"}
            </span>
          </div>
        );
      }
    }

    return <span className="text-zinc-600">—</span>;
  };

  // Render signal summary badge
  const renderSummaryBadge = (summary: string) => {
    if (summary === "H1B") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-[#06b6d4] text-black border border-[#06b6d4]/30">
          H1B
        </span>
      );
    } else if (summary === "H1S") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-[#f97316] text-white border border-[#f97316]/30">
          H1S
        </span>
      );
    } else if (summary === "CB") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          CB
        </span>
      );
    } else if (summary === "CS") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
          CS
        </span>
      );
    } else if (summary === "HXB") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-sky-500 text-white border border-sky-400/30">
          HXB
        </span>
      );
    } else if (summary === "HXS") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-violet-600 text-white border border-violet-500/30">
          HXS
        </span>
      );
    } else if (summary === "GCB") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-black border border-amber-400/30">
          GCB
        </span>
      );
    } else if (summary === "GCS") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[9px] font-bold bg-fuchsia-500 text-white border border-fuchsia-400/30">
          GCS
        </span>
      );
    }
    return <span className="text-zinc-500 font-mono text-[10px]">—</span>;
  };

  return (
    <div className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col space-y-4">
      
      {/* Control Bar */}
      <div className="bg-[#0b0c10] border border-[#1f2229] rounded-xl p-4 shadow-xl flex flex-col space-y-4">
        
        {/* Row 1: Selectors and search inputs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Watchlist Universe */}
            <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-3 py-1.5 rounded-lg">
              <Globe className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-xs font-mono text-orange-400 font-bold uppercase hidden sm:inline">Universe:</span>
              <select
                value={activeWatchlist}
                onChange={(e) => setActiveWatchlist(e.target.value as any)}
                className="bg-[#13151a] border-none text-white text-xs rounded focus:outline-none font-sans font-extrabold cursor-pointer h-[24px]"
              >
                <option value="personal">Personal ({personalSymbols.length})</option>
                <option value="nifty500">Nifty 500 (Top 20)</option>
                <option value="fno">F&O (Top 20)</option>
              </select>
            </div>

            {/* Signal Type Dropdown */}
            <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-3 py-1.5 rounded-lg">
              <SlidersHorizontal className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-xs font-mono text-orange-400 font-bold uppercase">Signal Type:</span>
              <select
                value={signalType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setSignalType(val);
                  setGlobalSignalFilter("All");
                  setTfFilters({});
                  setSortField("SignalSummary");
                  setSortDirection("desc");
                  setMinActiveTfs(1);
                }}
                className="bg-[#13151a] border-none text-white text-xs rounded focus:outline-none font-sans font-extrabold cursor-pointer h-[24px]"
              >
                <option value="WT">WT (WaveTrend Flip)</option>
                <option value="CB_CS">CB / CS (WaveTrend)</option>
                <option value="HX">HX (EMA Cross)</option>
                <option value="GC">GC (TSI Cross)</option>
              </select>
            </div>

            {/* Signal Filter Dropdown */}
            <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-3 py-1.5 rounded-lg">
              <Filter className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-xs font-mono text-orange-400 font-bold uppercase">Filter:</span>
              <select
                value={globalSignalFilter}
                onChange={(e) => setGlobalSignalFilter(e.target.value as any)}
                className="bg-[#13151a] border-none text-white text-xs rounded focus:outline-none font-sans font-extrabold cursor-pointer h-[24px]"
              >
                <option value="All">All</option>
                {signalType === "WT" && (
                  <>
                    <option value="BullOnly">H1B Only</option>
                    <option value="BearOnly">H1S Only</option>
                  </>
                )}
                {signalType === "CB_CS" && (
                  <>
                    <option value="BullOnly">CB Only</option>
                    <option value="BearOnly">CS Only</option>
                  </>
                )}
                {signalType === "HX" && (
                  <>
                    <option value="BullOnly">HXB Only</option>
                    <option value="BearOnly">HXS Only</option>
                  </>
                )}
                {signalType === "GC" && (
                  <>
                    <option value="BullOnly">GCB Only</option>
                    <option value="BearOnly">GCS Only</option>
                  </>
                )}
                <option value="AnyActive">Any Active Signal</option>
              </select>
            </div>
          </div>

          {/* Quick Search and Reset Buttons */}
          <div className="flex items-center gap-3 justify-end flex-1 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search ticker or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#13151a] border border-[#2a2d32] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 font-sans font-bold"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="px-3 py-1.5 bg-red-950/20 hover:bg-red-900/30 border border-red-500/25 text-red-400 font-extrabold text-[10px] rounded-lg font-mono tracking-wider transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>RESET ALL</span>
              </button>
            )}

            {/* Matches Counter */}
            <div className="bg-[#111317] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-zinc-400 whitespace-nowrap">
              MATCHES: <span className="text-orange-400">{filteredRows.length}</span> / {symbolsData.length}
            </div>

            {/* Refresh Action Trigger */}
            <button
              onClick={fetchScreenerData}
              disabled={isLoading}
              className="p-2 bg-[#13151a] border border-[#2a2d32] text-zinc-400 hover:text-white rounded-lg transition-all hover:bg-[#20222a] disabled:opacity-50 cursor-pointer"
              title={`Last updated at ${lastRefreshed.toLocaleTimeString()}`}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-orange-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Timeframe toggles and Min Active timeframe slider */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-[#1f2229]/60 pt-3">
          {/* Multi-select timeframe pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Timeframe Columns:</span>
            <div className="flex flex-wrap gap-1 bg-[#13151a] p-1 rounded-lg border border-zinc-800">
              {timeframes.map(tf => {
                const isSelected = selectedTimeframes.includes(tf);
                return (
                  <button
                    key={tf}
                    onClick={() => {
                      setSelectedTimeframes(prev => 
                        prev.includes(tf) 
                          ? prev.filter(t => t !== tf) 
                          : [...prev, tf]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                      isSelected 
                        ? "bg-orange-500/20 border border-orange-500/40 text-orange-400" 
                        : "bg-transparent border border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Min active timeframes slider */}
          <div className="flex items-center space-x-3 bg-[#13151a] px-3 py-1.5 rounded-lg border border-zinc-800 self-start md:self-auto">
            <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">Min TFs with Signal:</span>
            <input 
              type="range" 
              min="1" 
              max="8" 
              value={minActiveTfs}
              onChange={(e) => setMinActiveTfs(parseInt(e.target.value))}
              className="w-24 accent-orange-500 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
            />
            <span className="text-xs font-mono font-bold text-orange-400">{minActiveTfs}</span>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="bg-[#0b0c10] border border-[#1f2229] rounded-xl overflow-hidden shadow-2xl">
        {errorMessage && (
          <div className="p-4 bg-rose-950/20 border-b border-rose-500/30 text-rose-400 text-xs font-mono">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Legend Panel */}
        <div className="bg-[#111317]/50 border-b border-zinc-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs font-sans text-zinc-400">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-zinc-500 shrink-0" />
            <span className="font-semibold text-zinc-300">D7 Confluence Screener:</span>
            {signalType === "WT" && (
              <span>Filters for HTF 1 WaveTrend Flip (H1B / H1S) signals from the 2V Quant SWT indicator.</span>
            )}
            {signalType === "CB_CS" && (
              <span>Filters for Confirmed Buy (CB) and Confirmed Sell (CS) signals from the 2x TSI WaveTrend engine.</span>
            )}
            {signalType === "HX" && (
              <span>Filters for Bullish (HXB) and Bearish (HXS) EMA crossovers on resolved higher timeframes.</span>
            )}
            {signalType === "GC" && (
              <span>Filters for Bullish (GCB) and Bearish (GCS) TSI crossovers on resolved higher timeframes.</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            {signalType === "WT" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#06b6d4] border border-[#06b6d4]/40 rounded shadow-[0_0_8px_rgba(6,182,212,0.3)]"></span>
                  <span className="text-zinc-300">H1B: Bullish Flip</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#f97316] border border-[#f97316]/40 rounded shadow-[0_0_8px_rgba(249,115,22,0.3)]"></span>
                  <span className="text-zinc-300">H1S: Bearish Flip</span>
                </span>
              </>
            )}
            {signalType === "CB_CS" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span>
                  <span>CB: Confirmed Buy</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-500/20 border border-rose-500/40 rounded shadow-[0_0_8px_rgba(239,68,68,0.3)]"></span>
                  <span>CS: Confirmed Sell</span>
                </span>
              </>
            )}
            {signalType === "HX" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-sky-500 border border-sky-400/40 rounded shadow-[0_0_8px_rgba(14,165,233,0.3)]"></span>
                  <span>HXB: EMA Bull Cross</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-violet-600 border border-violet-500/40 rounded shadow-[0_0_8px_rgba(124,58,237,0.3)]"></span>
                  <span>HXS: EMA Bear Cross</span>
                </span>
              </>
            )}
            {signalType === "GC" && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-amber-500 border border-amber-400/40 rounded shadow-[0_0_8px_rgba(245,158,11,0.3)]"></span>
                  <span>GCB: TSI Bull Cross</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-fuchsia-500 border border-fuchsia-400/40 rounded shadow-[0_0_8px_rgba(217,70,239,0.3)]"></span>
                  <span>GCS: TSI Bear Cross</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Responsive Table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
            <thead>
              <tr className="bg-[#0e1014] border-b border-[#1f2229] select-none text-[10px] tracking-wider font-mono font-bold text-[#8e9299]">
                {/* Sticky Symbol column header */}
                <th 
                  className="p-3 w-[160px] sticky left-0 bg-[#0e1014] z-20 border-r border-[#1f2229]/60 cursor-pointer hover:text-white transition-all"
                  onClick={() => handleSort("Symbol")}
                >
                  <div className="flex items-center justify-between">
                    <span>SYMBOL</span>
                    {sortField === "Symbol" && (
                      <span className="text-orange-500">{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* Signal Summary column header */}
                <th 
                  className="p-3 w-[120px] text-center border-r border-[#1f2229]/60 cursor-pointer hover:text-white transition-all"
                  onClick={() => handleSort("SignalSummary")}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>SUMMARY</span>
                    {sortField === "SignalSummary" && (
                      <span className="text-orange-500">{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* Active TF Count column header */}
                <th 
                  className="p-3 w-[100px] text-center border-r border-[#1f2229]/60 cursor-pointer hover:text-white transition-all"
                  onClick={() => handleSort("ActiveTfCount")}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>ACTIVE TFS</span>
                    {sortField === "ActiveTfCount" && (
                      <span className="text-orange-500">{sortDirection === "asc" ? "▲" : "▼"}</span>
                    )}
                  </div>
                </th>

                {/* 8 Timeframe column headers */}
                {timeframes.filter(tf => selectedTimeframes.includes(tf)).map((tf) => (
                  <th 
                    key={tf} 
                    className={`p-3 text-center border-r border-[#1f2229]/40 last:border-r-0 transition-all ${
                      sortField === tf ? "bg-[#161920]/40 text-white" : "hover:bg-[#111317]/60"
                    }`}
                  >
                    <div 
                      className="flex flex-col items-center justify-between cursor-pointer space-y-1"
                      onClick={() => handleSort(tf)}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{tf.toUpperCase()}</span>
                        {sortField === tf && (
                          <span className="text-orange-500">{sortDirection === "asc" ? "▲" : "▼"}</span>
                        )}
                      </div>
                      
                      {/* Column filter dropdown */}
                      <select
                        value={tfFilters[tf] || "All"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          setTfFilters(prev => ({ ...prev, [tf]: e.target.value as any }));
                        }}
                        className="bg-[#15171c] border border-zinc-800 text-[9px] rounded px-1.5 py-0.5 mt-1 focus:outline-none focus:border-orange-500 text-zinc-300 font-mono font-bold cursor-pointer hover:border-zinc-700"
                      >
                        <option value="All">ALL</option>
                        {signalType === "WT" && (
                          <>
                            <option value="BULL">H1B</option>
                            <option value="BEAR">H1S</option>
                          </>
                        )}
                        {signalType === "CB_CS" && (
                          <>
                            <option value="BULL">CB</option>
                            <option value="BEAR">CS</option>
                          </>
                        )}
                        {signalType === "HX" && (
                          <>
                            <option value="BULL">HXB</option>
                            <option value="BEAR">HXS</option>
                          </>
                        )}
                        {signalType === "GC" && (
                          <>
                            <option value="BULL">GCB</option>
                            <option value="BEAR">GCS</option>
                          </>
                        )}
                      </select>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2229]/50">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-zinc-500 font-mono text-xs">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-orange-500 mb-2" />
                    <span>FETCHING STREAMING CONFLUENCE MATRIX...</span>
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-zinc-500 font-mono text-xs">
                    🚫 NO MATCHING CONFLUENCE PATHS DETECTED ACROSS WATCHLIST
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const { summary, count } = getSummaryInfo(row);
                  
                  // Left border tint matching signal direction
                  const hasBullSummary = summary === "CB" || summary === "HXB" || summary === "GCB" || summary === "H1B";
                  const hasBearSummary = summary === "CS" || summary === "HXS" || summary === "GCS" || summary === "H1S";
                  
                  let borderTintClass = "border-l-[4px] border-l-transparent";
                  if (summary === "H1B") {
                    borderTintClass = "border-l-[4px] border-l-[#06b6d4]/80";
                  } else if (summary === "H1S") {
                    borderTintClass = "border-l-[4px] border-l-[#f97316]/80";
                  } else if (hasBullSummary) {
                    borderTintClass = "border-l-[4px] border-l-emerald-500/80";
                  } else if (hasBearSummary) {
                    borderTintClass = "border-l-[4px] border-l-rose-500/80";
                  }

                  return (
                    <tr 
                      key={row.Symbol} 
                      className={`hover:bg-[#13151a]/60 transition-colors h-[44px] text-xs font-sans text-zinc-300 ${borderTintClass}`}
                    >
                      {/* Symbol info cell */}
                      <td className="p-2 font-bold sticky left-0 bg-[#0b0c10] z-10 border-r border-[#1f2229]/60 flex items-center justify-between shadow-[4px_0_12px_rgba(0,0,0,0.5)]">
                        <div className="min-w-0 pr-1">
                          <span className="text-white hover:text-orange-400 transition-colors cursor-pointer block truncate font-sans text-[13px]">
                            {row.Symbol}
                          </span>
                          <span className="text-[9px] text-[#8e9299] block font-medium font-sans truncate max-w-[110px]">
                            {row.Description}
                          </span>
                        </div>
                        <a 
                          href={getTradingViewUrl(row.Symbol)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1 text-zinc-500 hover:text-orange-400 transition-colors cursor-pointer"
                          title="Open on TradingView"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>

                      {/* Signal Summary Cell */}
                      <td className="p-2 text-center border-r border-[#1f2229]/60">
                        {renderSummaryBadge(summary)}
                      </td>

                      {/* Active TF Count Cell */}
                      <td className="p-2 text-center border-r border-[#1f2229]/60 font-mono font-bold text-zinc-100 text-[13px]">
                        {count > 0 ? (
                          <span className="text-orange-400">{count}</span>
                        ) : (
                          <span className="text-zinc-600">0</span>
                        )}
                        <span className="text-[10px] text-zinc-500 font-normal"> / {selectedTimeframes.length}</span>
                      </td>

                      {/* Timeframe cells */}
                      {timeframes.filter(tf => selectedTimeframes.includes(tf)).map((tf) => (
                        <td 
                          key={tf} 
                          className="p-2 text-center border-r border-[#1f2229]/40 last:border-r-0 font-mono"
                        >
                          {renderTimeframeCell(tf, row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 p-4 bg-[#14161c] border border-[#2a2d32] rounded-lg shadow-md">
            <div className="text-xs text-[#8e9299]">
              Showing <span className="text-white font-bold">{Math.min((displayPage - 1) * pageSize + 1, totalItems)}</span> to{" "}
              <span className="text-white font-bold">{Math.min(displayPage * pageSize, totalItems)}</span> of{" "}
              <span className="text-white font-bold">{totalItems}</span> symbols
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Page Size Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-[#8e9299]">Page Size:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-[#13151a] border border-[#2a2d32] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-500 font-sans font-bold cursor-pointer"
                >
                  <option value="20">20</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="250">250</option>
                </select>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={displayPage === 1}
                  className="p-1.5 rounded bg-[#13151a] border border-[#2a2d32] text-[#8e9299] hover:text-white hover:border-orange-500 disabled:opacity-40 disabled:hover:text-[#8e9299] disabled:hover:border-[#2a2d32] transition-colors cursor-pointer"
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={displayPage === 1}
                  className="p-1.5 rounded bg-[#13151a] border border-[#2a2d32] text-[#8e9299] hover:text-white hover:border-orange-500 disabled:opacity-40 disabled:hover:text-[#8e9299] disabled:hover:border-[#2a2d32] transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-xs font-mono text-white px-2.5">
                  Page <span className="text-orange-400 font-black">{displayPage}</span> of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={displayPage === totalPages}
                  className="p-1.5 rounded bg-[#13151a] border border-[#2a2d32] text-[#8e9299] hover:text-white hover:border-orange-500 disabled:opacity-40 disabled:hover:text-[#8e9299] disabled:hover:border-[#2a2d32] transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={displayPage === totalPages}
                  className="p-1.5 rounded bg-[#13151a] border border-[#2a2d32] text-[#8e9299] hover:text-white hover:border-orange-500 disabled:opacity-40 disabled:hover:text-[#8e9299] disabled:hover:border-[#2a2d32] transition-colors cursor-pointer"
                  title="Last Page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

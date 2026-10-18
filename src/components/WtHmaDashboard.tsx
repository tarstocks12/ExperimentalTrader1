import React, { useState, useEffect } from "react";
import { 
  ExternalLink, 
  Search, 
  Globe, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft, 
  ChevronsLeft, 
  ChevronsRight 
} from "lucide-react";
import { Timeframe } from "../types.js";
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from "../data/watchlists.js";
import { computeLayaPreTurnIntel } from "../lib/laya-engine.js";
import { LayaIntelCell } from "./LayaIntelCell.js";

interface WtHmaTimeframeData {
  wt1: number;
  wt2: number;
  isBull: boolean;
  isBear: boolean;
  barsSinceCross: number;
  consecutiveUp: number;
  consecutiveDown: number;
  
  hmaOpen?: number;
  hmaClose?: number;
  hmaIsBull?: boolean;
  hmaIsBear?: boolean;
  hmaBarsSinceCross?: number;

  scaledTsi?: number;
  scaledTsiSig?: number;
  isTsiBull?: boolean;
  isTsiBear?: boolean;
  tsiBarsSinceCross?: number;

  isUnavailable?: boolean;
}

interface WtHmaSymbolRow {
  Symbol: string;
  Description: string;
  wtStrength: number;
  wtStrengthLabel: string;
  revStrength?: number;
  revStrengthLabel?: string;
  wtHmaStrength: number;
  wtHmaStrengthLabel: string;
  isUnavailable?: boolean;
  timeframes: {
    [key in Timeframe]?: WtHmaTimeframeData;
  };
}

interface WtHmaDashboardProps {
  personalSymbols: string[];
}

export default function WtHmaDashboard({ personalSymbols }: WtHmaDashboardProps) {
  const timeframes: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];
  const [activeWatchlist, setActiveWatchlist] = useState<"personal" | "nifty500" | "fno">("personal");
  const [symbolsData, setSymbolsData] = useState<WtHmaSymbolRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Overall Filters
  const [wtHmaStrengthFilter, setWtHmaStrengthFilter] = useState<string>("All");
  const [reversalFilter, setReversalFilter] = useState<string>("All");
  const [intraMomentumFilter, setIntraMomentumFilter] = useState<string>("All");
  const [swingTrendFilter, setSwingTrendFilter] = useState<string>("All");
  const [regimeTimeframe, setRegimeTimeframe] = useState<string>("All");
  const [regimeState, setRegimeState] = useState<string>("All"); // "WT_BULL", "WT_BEAR", "HMA_BULL", "HMA_BEAR", "TSI_BULL", "TSI_BEAR"
  
  // Per-Timeframe separate WT, HMA, and TSI Filter states
  const [wtTfFilters, setWtTfFilters] = useState<{[key in Timeframe]?: string}>({});
  const [hmaTfFilters, setHmaTfFilters] = useState<{[key in Timeframe]?: string}>({});
  const [tsiTfFilters, setTsiTfFilters] = useState<{[key in Timeframe]?: string}>({});

  // Sorting
  const [sortField, setSortField] = useState<string>("wtHmaStrength");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [tfSortMode, setTfSortMode] = useState<"regime" | "wtBars" | "hmaBars" | "tsiBars">("wtBars");

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

  const getIntraScore = (row: WtHmaSymbolRow) => {
    let bullCount = 0;
    let bearCount = 0;
    const intraTfs: Timeframe[] = ["5m", "15m", "1H"];
    
    intraTfs.forEach(tf => {
      const d = row.timeframes[tf];
      if (d) {
        if (d.isBull) bullCount++;
        if (d.isBear) bearCount++;
        if (d.hmaIsBull) bullCount++;
        if (d.hmaIsBear) bearCount++;
        if (d.isTsiBull) bullCount++;
        if (d.isTsiBear) bearCount++;
      }
    });
    
    if (bullCount === 0 && bearCount === 0) return 0;
    return Math.round((bullCount - bearCount) * (100 / 9));
  };

  const getSwingScore = (row: WtHmaSymbolRow) => {
    let score = 0;
    const swingTfs: Timeframe[] = ["4H", "1D", "3D", "1W"];
    
    swingTfs.forEach(tf => {
      const d = row.timeframes[tf];
      if (d) {
        if (d.isBull) score += 1;
        if (d.isBear) score -= 1;
        if (d.hmaIsBull) score += 1.5;
        if (d.hmaIsBear) score -= 1.5;
        if (d.isTsiBull) score += 1;
        if (d.isTsiBear) score -= 1;
      }
    });
    
    return score;
  };

  const fetchWtHmaData = async () => {
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
      } else {
        throw new Error(resJson.message || "Invalid data payload returned by server");
      }
    } catch (error: any) {
      console.error("Error fetching WT+HMA Screener data:", error);
      setErrorMessage(error.message || "Failed loading live WT + HMA + TSI dataset.");
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger query on active watchlist change, personal watchlist update, searchQuery, page, or page size change
  useEffect(() => {
    fetchWtHmaData();
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

  // Filtering Logic
  const filteredRows = symbolsData.filter(row => {
    // 1. Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const symbolMatches = row.Symbol.toLowerCase().includes(q);
      const descMatches = row.Description.toLowerCase().includes(q);
      if (!symbolMatches && !descMatches) return false;
    }

    // 2. WT + HMA Strength filter
    if (wtHmaStrengthFilter !== "All") {
      const actualLabel = (row.wtHmaStrengthLabel || "NEUTRAL").toUpperCase();
      if (wtHmaStrengthFilter === "All Bull") {
        if (actualLabel !== "STRONG BULL" && actualLabel !== "BULL") return false;
      } else if (wtHmaStrengthFilter === "All Bear") {
        if (actualLabel !== "STRONG BEAR" && actualLabel !== "BEAR") return false;
      } else {
        const targetLabel = wtHmaStrengthFilter.toUpperCase();
        if (actualLabel !== targetLabel) return false;
      }
    }

    // 3. Reversal Strength filter
    if (reversalFilter !== "All") {
      const actualLabel = (row.revStrengthLabel || "NEUTRAL").toUpperCase();
      if (reversalFilter === "All Bull") {
        if (actualLabel !== "STRONG BULL" && actualLabel !== "BULL" && actualLabel !== "RC BULL") return false;
      } else if (reversalFilter === "All Bear") {
        if (actualLabel !== "STRONG BEAR" && actualLabel !== "BEAR" && actualLabel !== "RC BEAR") return false;
      } else {
        const targetLabel = reversalFilter.toUpperCase();
        if (actualLabel !== targetLabel) return false;
      }
    }

    // 4. Intraday Momentum selector filter
    if (intraMomentumFilter !== "All") {
      const score = getIntraScore(row);
      if (intraMomentumFilter === "Bullish") {
        if (score <= 0) return false;
      } else if (intraMomentumFilter === "Bearish") {
        if (score >= 0) return false;
      }
    }

    // 5. Swing Trend selector filter
    if (swingTrendFilter !== "All") {
      const score = getSwingScore(row);
      if (swingTrendFilter === "Bullish") {
        if (score <= 0) return false;
      } else if (swingTrendFilter === "Bearish") {
        if (score >= 0) return false;
      }
    }

    // 6. Timeframe Regime filter (Interactive Quick Select)
    if (regimeTimeframe !== "All" && regimeState !== "All") {
      const tf = regimeTimeframe as Timeframe;
      const data = row.timeframes[tf];
      if (!data) return false;

      if (regimeState === "WT_BULL") {
        if (!data.isBull) return false;
      } else if (regimeState === "WT_BEAR") {
        if (!data.isBear) return false;
      } else if (regimeState === "HMA_BULL") {
        if (!data.hmaIsBull) return false;
      } else if (regimeState === "HMA_BEAR") {
        if (!data.hmaIsBear) return false;
      } else if (regimeState === "TSI_BULL") {
        if (!data.isTsiBull) return false;
      } else if (regimeState === "TSI_BEAR") {
        if (!data.isTsiBear) return false;
      }
    }

    // 7. Individual Timeframe Column separate custom dropdown filters (WT, HMA, TSI)
    for (const tf of timeframes) {
      const wtFilter = wtTfFilters[tf];
      if (wtFilter && wtFilter !== "All") {
        const data = row.timeframes[tf];
        if (wtFilter === "Bull") {
          if (!data || !data.isBull) return false;
        } else if (wtFilter === "Bear") {
          if (!data || !data.isBear) return false;
        }
      }

      const hmaFilter = hmaTfFilters[tf];
      if (hmaFilter && hmaFilter !== "All") {
        const data = row.timeframes[tf];
        if (hmaFilter === "Bull") {
          if (!data || !data.hmaIsBull) return false;
        } else if (hmaFilter === "Bear") {
          if (!data || !data.hmaIsBear) return false;
        }
      }

      const tsiFilter = tsiTfFilters[tf];
      if (tsiFilter && tsiFilter !== "All") {
        const data = row.timeframes[tf];
        if (tsiFilter === "Bull") {
          if (!data || !data.isTsiBull) return false;
        } else if (tsiFilter === "Bear") {
          if (!data || !data.isTsiBear) return false;
        }
      }
    }

    return true;
  });

  // Sorting Logic
  const sortedRows = [...filteredRows].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    if (sortField === "Symbol") {
      valA = a.Symbol;
      valB = b.Symbol;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "intraScore") {
      valA = getIntraScore(a);
      valB = getIntraScore(b);
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "swingScore") {
      valA = getSwingScore(a);
      valB = getSwingScore(b);
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "wtHmaStrength") {
      valA = a.wtHmaStrength;
      valB = b.wtHmaStrength;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "revStrength") {
      valA = a.revStrength ?? 50;
      valB = b.revStrength ?? 50;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "layaIntel") {
      valA = computeLayaPreTurnIntel(a, "d6b_wthma").score;
      valB = computeLayaPreTurnIntel(b, "d6b_wthma").score;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else {
      // It's a timeframe column
      const tf = sortField as Timeframe;
      const tfA = a.timeframes[tf];
      const tfB = b.timeframes[tf];

      if (tfSortMode === "wtBars") {
        const hasA = tfA && (tfA.isBull || tfA.isBear);
        const hasB = tfB && (tfB.isBull || tfB.isBear);

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        const barsA = tfA.barsSinceCross;
        const barsB = tfB.barsSinceCross;

        return sortDirection === "asc" ? barsA - barsB : barsB - barsA;
      } else if (tfSortMode === "hmaBars") {
        const hasA = tfA && (tfA.hmaIsBull || tfA.hmaIsBear);
        const hasB = tfB && (tfB.hmaIsBull || tfB.hmaIsBear);

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        const barsA = tfA.hmaBarsSinceCross ?? 0;
        const barsB = tfB.hmaBarsSinceCross ?? 0;

        return sortDirection === "asc" ? barsA - barsB : barsB - barsA;
      } else if (tfSortMode === "tsiBars") {
        const hasA = tfA && (tfA.isTsiBull || tfA.isTsiBear);
        const hasB = tfB && (tfB.isTsiBull || tfB.isTsiBear);

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        const barsA = tfA.tsiBarsSinceCross ?? 0;
        const barsB = tfB.tsiBarsSinceCross ?? 0;

        return sortDirection === "asc" ? barsA - barsB : barsB - barsA;
      } else {
        if (!tfA) return 1;
        if (!tfB) return -1;

        // Classify statuses based on WT, HMA, and TSI
        const stateScore = (item: WtHmaTimeframeData | undefined) => {
          if (!item) return 0;
          let score = 0;
          if (item.isBull) score += 2;
          if (item.isBear) score -= 2;
          if (item.hmaIsBull) score += 3;
          if (item.hmaIsBear) score -= 3;
          if (item.isTsiBull) score += 2.5;
          if (item.isTsiBear) score -= 2.5;
          return score;
        };

        valA = stateScore(tfA);
        valB = stateScore(tfB);

        if (valA === undefined) return 1;
        if (valB === undefined) return -1;

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }
    }
  });

  return (
    <div className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col space-y-6">
      
      {/* Upper Control Bar */}
      <div id="wt-hma-control-bar" className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-4 shadow-xl flex flex-col xl:flex-row items-center justify-between gap-4">
        
        {/* Watchlist selector, search inputs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto flex-1">
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

          {/* Quick Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ticker or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#13151a] border border-[#2a2d32] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 font-sans font-bold"
            />
          </div>
        </div>

        {/* Filters Panel Matrix */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono w-full xl:w-auto">
          {/* Consolidated HMA + WT + TSI Strength Score */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">HMA/WT/TSI:</span>
            <select
              value={wtHmaStrengthFilter}
              onChange={(e) => setWtHmaStrengthFilter(e.target.value)}
              className="bg-[#13151a] border border-[#2a2d32] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-500 font-sans font-bold cursor-pointer"
            >
              <option value="All">All Strengths</option>
              <option value="All Bull">All Bull</option>
              <option value="All Bear">All Bear</option>
              <option value="Strong Bull">Strong Bull</option>
              <option value="Bull">Bull</option>
              <option value="Neutral">Neutral</option>
              <option value="Bear">Bear</option>
              <option value="Strong Bear">Strong Bear</option>
            </select>
          </div>

          {/* Reversal Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">Reversal:</span>
            <select
              value={reversalFilter}
              onChange={(e) => setReversalFilter(e.target.value)}
              className="bg-[#13151a] border border-[#2a2d32] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-500 font-sans font-bold cursor-pointer"
            >
              <option value="All">All Reversals</option>
              <option value="All Bull">All Bull</option>
              <option value="All Bear">All Bear</option>
              <option value="RC Bull">RC Bull</option>
              <option value="RC bear">RC bear</option>
              <option value="Strong Bull">Strong Bull</option>
              <option value="Bull">Bull</option>
              <option value="Neutral">Neutral</option>
              <option value="Bear">Bear</option>
              <option value="Strong Bear">Strong Bear</option>
            </select>
          </div>

          {/* Interactive Quick select Regime */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">Quick select:</span>
            <div className="flex items-center space-x-1.5 bg-[#131a1a] border border-orange-500/20 p-0.5 rounded-lg">
              <select
                value={regimeTimeframe}
                onChange={(e) => setRegimeTimeframe(e.target.value)}
                className="bg-transparent text-white text-xs rounded focus:outline-none font-sans font-bold px-1.5 h-[24px] cursor-pointer"
              >
                <option value="All">Any Timeframe</option>
                {timeframes.map(tf => (
                  <option key={tf} value={tf}>{tf.toUpperCase()}</option>
                ))}
              </select>
              <span className="text-zinc-700 text-[10px]">|</span>
              <select
                value={regimeState}
                onChange={(e) => setRegimeState(e.target.value)}
                className="bg-transparent text-white text-xs rounded focus:outline-none font-sans font-bold px-1.5 h-[24px] cursor-pointer"
                disabled={regimeTimeframe === "All"}
              >
                <option value="All">Any Regime</option>
                <option value="WT_BULL">WT BULL</option>
                <option value="WT_BEAR">WT BEAR</option>
                <option value="HMA_BULL">HMA BULL</option>
                <option value="HMA_BEAR">HMA BEAR</option>
                <option value="TSI_BULL">TSI BULL</option>
                <option value="TSI_BEAR">TSI BEAR</option>
              </select>
            </div>
          </div>

          {/* Timeframe Sorting Mode */}
          <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-2.5 py-1 rounded">
            <span className="text-[#8e9299]">TF Sort:</span>
            <select
              value={tfSortMode}
              onChange={(e) => setTfSortMode(e.target.value as any)}
              className="bg-transparent border-none text-white text-xs focus:outline-none font-sans font-bold cursor-pointer"
            >
              <option value="regime" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>Regime State</option>
              <option value="wtBars" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>WT Bars</option>
              <option value="hmaBars" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>HMA Bars</option>
              <option value="tsiBars" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>TSI Bars</option>
            </select>
          </div>

          {/* Refresh Action */}
          <button
            onClick={fetchWtHmaData}
            disabled={isLoading}
            className="p-2 ml-1 bg-[#13151a] hover:bg-orange-500/10 border border-[#2a2d32] hover:border-orange-500/30 text-white rounded-lg transition-all focus:outline-none cursor-pointer flex items-center justify-center shrink-0"
            title="Refresh HMA + WT + TSI Screener"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${isLoading ? "animate-spin text-orange-500" : ""}`} />
          </button>
        </div>

      </div>

      {/* Grid Screener Table */}
      <div className="bg-[#0b0c10] border border-[#1f2229] rounded-xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500" />
        
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="h-8 w-8 text-orange-500 animate-spin" />
            <p className="text-sm font-semibold text-zinc-400 font-sans tracking-wide">
              Calculating state-of-the-art WaveTrend Momentum, HMA Crosses & TSI...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="py-16 text-center text-red-400 px-6">
            <p className="font-mono text-xs max-w-lg mx-auto bg-red-950/20 border border-red-500/30 p-4 rounded-xl">
              {errorMessage}
            </p>
            <button
              onClick={fetchWtHmaData}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all border border-zinc-700"
            >
              Retry Pipeline Scan
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-auto min-h-[600px] max-h-[750px]">
            <table className="w-full text-left border-collapse min-w-[1300px]">
              <thead>
                <tr className="bg-[#111318] border-b border-[#2a2d32] text-[10px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono sticky top-0 z-10 shadow-[0_1px_0_0_rgba(42,45,50,1)] select-none">
                  <th 
                    className="py-2.5 px-4 cursor-pointer hover:bg-[#15171e] transition-all w-[220px]"
                    onClick={() => handleSort("Symbol")}
                  >
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-1.5 justify-start text-[#8e9299] hover:text-white transition-colors">
                        <span>Symbol</span>
                        <span className="text-orange-400 font-bold text-[9px] translate-y-[0.5px]">
                          {sortField === "Symbol" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearchQuery("");
                          setWtHmaStrengthFilter("All");
                          setReversalFilter("All");
                          setIntraMomentumFilter("All");
                          setSwingTrendFilter("All");
                          setRegimeTimeframe("All");
                          setRegimeState("All");
                          setWtTfFilters({});
                          setHmaTfFilters({});
                          setTsiTfFilters({});
                        }}
                        className="bg-orange-500 hover:bg-orange-600 text-black text-[8px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded transition-all uppercase text-left w-max shrink-0 cursor-pointer shadow-[0_1px_4px_rgba(249,115,22,0.15)] animate-pulse"
                      >
                        FILTER RESET
                      </button>
                    </div>
                  </th>

                  {/* Intraday Momentum Column */}
                  <th 
                    className="py-2 px-3 text-center w-[170px] border-b border-[#2a2d32] bg-[#14151a]"
                  >
                    <div 
                      className="flex items-center space-x-1.5 justify-center cursor-pointer hover:text-white transition-all select-none font-bold text-[10px]"
                      onClick={() => handleSort("intraScore")}
                    >
                      <span className="text-orange-400">Intraday Momentum</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "intraScore" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={intraMomentumFilter}
                        onChange={(e) => setIntraMomentumFilter(e.target.value)}
                        className={`w-full bg-[#111317] border rounded px-1.5 py-0.5 text-[8.5px] font-sans font-black cursor-pointer focus:outline-none transition-colors ${
                          intraMomentumFilter !== "All"
                            ? "border-orange-500 text-orange-400 bg-orange-950/15"
                            : "border-[#2a2d32] text-[#8e9299] hover:text-white"
                        }`}
                      >
                        <option value="All">All Momentum</option>
                        <option value="Bullish">Bull Momentum</option>
                        <option value="Bearish">Bear Momentum</option>
                      </select>
                    </div>
                  </th>

                  {/* Swing Trend Column */}
                  <th 
                    className="py-2 px-3 text-center w-[170px] border-b border-[#2a2d32] bg-[#121419]"
                  >
                    <div 
                      className="flex items-center space-x-1.5 justify-center cursor-pointer hover:text-white transition-all select-none font-bold text-[10px]"
                      onClick={() => handleSort("swingScore")}
                    >
                      <span className="text-blue-400">Swing Column</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "swingScore" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={swingTrendFilter}
                        onChange={(e) => setSwingTrendFilter(e.target.value)}
                        className={`w-full bg-[#111317] border rounded px-1.5 py-0.5 text-[8.5px] font-sans font-black cursor-pointer focus:outline-none transition-colors ${
                          swingTrendFilter !== "All"
                            ? "border-blue-500 text-blue-400 bg-blue-950/15"
                            : "border-[#2a2d32] text-[#8e9299] hover:text-white"
                        }`}
                      >
                        <option value="All">All Swing</option>
                        <option value="Bullish">Bullish Strength</option>
                        <option value="Bearish">Bearish Strength</option>
                      </select>
                    </div>
                  </th>

                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[150px]"
                    onClick={() => handleSort("wtHmaStrength")}
                  >
                    <div className="flex items-center space-x-1.5 justify-center">
                      <span className="text-emerald-400">HMA / WT / TSI Score</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "wtHmaStrength" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>

                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[150px]"
                    onClick={() => handleSort("revStrength")}
                  >
                    <div className="flex items-center space-x-1.5 justify-center">
                      <span>Reversal Index</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "revStrength" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>

                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[175px]"
                    onClick={() => handleSort("layaIntel")}
                  >
                    <div className="flex flex-col items-center space-y-0.5 justify-center">
                      <div className="flex items-center space-x-1.5 justify-center text-emerald-400">
                        <span>Laya Intelligence</span>
                        <span className="font-bold text-[9px]">
                          {sortField === "layaIntel" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                      <span className="text-[7.5px] font-mono text-[#8e9299] opacity-80 tracking-tight uppercase">
                        Pre-Turn Bull / Bear
                      </span>
                    </div>
                  </th>

                  {timeframes.map(tf => (
                    <th 
                      key={tf}
                      className="py-2 px-2 text-center w-[130px] border-b border-[#2a2d32]"
                    >
                      <div 
                        className="flex flex-col items-center space-y-0.5 justify-center cursor-pointer hover:text-white transition-all select-none font-bold"
                        onClick={() => handleSort(tf)}
                      >
                        <div className="flex items-center space-x-1 justify-center text-[10px]">
                          <span className="tracking-wide text-zinc-300">{tf.toUpperCase()}</span>
                          <span className="text-orange-400 font-bold text-[9px]">
                            {sortField === tf ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <span className="text-[7.5px] font-mono text-[#8e9299] opacity-70 tracking-tight uppercase">
                          {tfSortMode === "wtBars" ? "by wt bars" : tfSortMode === "hmaBars" ? "by hma bars" : tfSortMode === "tsiBars" ? "by tsi bars" : "by state"}
                        </span>
                      </div>
                      
                      {/* Triple Regime Filters For each timeframe */}
                      <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                        {/* WT Filter */}
                        <select
                          value={wtTfFilters[tf] || "All"}
                          onChange={(e) => {
                            e.stopPropagation();
                            setWtTfFilters(prev => ({ ...prev, [tf]: e.target.value }));
                          }}
                          className={`w-full bg-[#14161c] border rounded px-1 py-0.5 text-[8.5px] font-sans font-black cursor-pointer focus:outline-none transition-colors ${
                            (wtTfFilters[tf] || "All") !== "All"
                              ? "border-orange-500 text-orange-400 bg-orange-950/15"
                              : "border-[#2a2d32] text-[#8e9299] hover:text-white"
                          }`}
                        >
                          <option value="All">WT: All</option>
                          <option value="Bull">WT: Bull</option>
                          <option value="Bear">WT: Bear</option>
                        </select>
                        
                        {/* HMA Filter */}
                        <select
                          value={hmaTfFilters[tf] || "All"}
                          onChange={(e) => {
                            e.stopPropagation();
                            setHmaTfFilters(prev => ({ ...prev, [tf]: e.target.value }));
                          }}
                          className={`w-full bg-[#14161c] border rounded px-1 py-0.5 text-[8.5px] font-sans font-black cursor-pointer focus:outline-none transition-colors ${
                            (hmaTfFilters[tf] || "All") !== "All"
                              ? "border-purple-500 text-purple-400 bg-purple-950/15"
                              : "border-[#2a2d32] text-[#8e9299] hover:text-white"
                          }`}
                        >
                          <option value="All">HMA: All</option>
                          <option value="Bull">HMA: Bull</option>
                          <option value="Bear">HMA: Bear</option>
                        </select>

                        {/* TSI Filter */}
                        <select
                          value={tsiTfFilters[tf] || "All"}
                          onChange={(e) => {
                            e.stopPropagation();
                            setTsiTfFilters(prev => ({ ...prev, [tf]: e.target.value }));
                          }}
                          className={`w-full bg-[#14161c] border rounded px-1 py-0.5 text-[8.5px] font-sans font-black cursor-pointer focus:outline-none transition-colors ${
                            (tsiTfFilters[tf] || "All") !== "All"
                              ? "border-amber-500 text-amber-400 bg-amber-950/15"
                              : "border-[#2a2d32] text-[#8e9299] hover:text-white"
                          }`}
                        >
                          <option value="All">TSI: All</option>
                          <option value="Bull">TSI: Bull</option>
                          <option value="Bear">TSI: Bear</option>
                        </select>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d32]/40 text-xs font-mono">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-20 text-center text-[#8e9299] font-sans italic">
                      No symbols discovered matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map(row => {
                    return (
                      <tr key={row.Symbol} className="hover:bg-[#1a1c21]/45 border-l-2 border-l-transparent transition-all">
                        {/* Ticker Name Column */}
                        <td className="py-3 px-4 font-sans max-w-[240px]">
                          <div className="flex items-center justify-between w-full space-x-2">
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-white tracking-tight text-sm truncate flex items-center space-x-1.5">
                                <span>{row.Symbol}</span>
                                {row.Symbol === "NIFTY" && (
                                  <span className="text-[9px] bg-orange-500/10 border border-orange-500/30 text-orange-400 font-bold px-1 rounded uppercase font-mono shrink-0">
                                    Idx
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-[#8e9299] truncate max-w-[200px] mt-0.5" title={row.Description}>
                                {row.Description}
                              </span>
                            </div>

                            {/* TV Link */}
                            <a
                              href={getTradingViewUrl(row.Symbol)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-[#8e9299] hover:text-orange-400 hover:bg-[#1a1c21]/60 rounded transition-colors shrink-0"
                              title={`Open ${row.Symbol} TradingView Chart`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>

                        {/* Intraday Momentum Column */}
                        <td className="py-3 px-3 text-center bg-[#14151a]/20">
                          {row.isUnavailable ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1">
                              {(() => {
                                const score = getIntraScore(row);
                                const isBull = score > 0;
                                const isBear = score < 0;
                                
                                return (
                                  <>
                                    <span className={`text-[13px] font-mono font-black ${
                                      isBull ? "text-green-400" : isBear ? "text-rose-400" : "text-zinc-400"
                                    }`}>
                                      {score > 0 ? `+${score}%` : `${score}%`}
                                    </span>
                                    <span className={`inline-block text-[8.5px] font-extrabold px-1.5 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                      isBull
                                        ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/30"
                                        : isBear
                                        ? "text-rose-400 bg-rose-950/20 border-rose-500/30"
                                        : "text-zinc-400 bg-zinc-900 border-zinc-800"
                                    }`}>
                                      {isBull ? "BULL FORCE" : isBear ? "BEAR PRESSURE" : "NEUTRAL"}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </td>
 
                        {/* Swing Trend Column */}
                        <td className="py-3 px-3 text-center bg-[#121419]/25">
                          {row.isUnavailable ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1">
                              {(() => {
                                const score = getSwingScore(row);
                                const pctScore = Math.round((score / 10) * 100);
                                const isBull = score > 0;
                                const isBear = score < 0;
                                
                                return (
                                  <>
                                    <span className={`text-[13px] font-mono font-black ${
                                      isBull ? "text-blue-400" : isBear ? "text-amber-500" : "text-zinc-400"
                                    }`}>
                                      {pctScore > 0 ? `+${pctScore}%` : `${pctScore}%`}
                                    </span>
                                    <span className={`inline-block text-[8.5px] font-extrabold px-1.5 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                      isBull
                                        ? "text-blue-400 bg-blue-950/20 border-blue-500/30"
                                        : isBear
                                        ? "text-amber-500 bg-amber-950/20 border-amber-500/30"
                                        : "text-zinc-400 bg-zinc-900 border-zinc-800"
                                    }`}>
                                      {score >= 6
                                        ? "GOLD RAMP"
                                        : score > 0
                                        ? "UPTREND"
                                        : score <= -6
                                        ? "DOWNTREND"
                                        : score < 0
                                        ? "AMBER ALERT"
                                        : "FLAT TREND"}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </td>
 
                        {/* Consolidated HMA + WT + TSI Score Column */}
                        <td className="py-3 px-4 text-center">
                          {row.isUnavailable ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1">
                              <span className="text-[13px] font-mono font-black text-white bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                                {row.wtHmaStrength ?? 50}%
                              </span>
                              <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                (row.wtHmaStrength ?? 50) >= 60
                                  ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/30"
                                  : (row.wtHmaStrength ?? 50) <= 40
                                  ? "text-rose-400 bg-rose-950/20 border-rose-500/30"
                                  : "text-zinc-400 bg-zinc-900 border-zinc-800"
                              }`}>
                                {row.wtHmaStrengthLabel ?? "NEUTRAL"}
                              </span>
                            </div>
                          )}
                        </td>
 
                        {/* Reversal Index Column */}
                        <td className="py-3 px-4 text-center">
                          {row.isUnavailable ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1">
                              <span className="text-[13px] font-mono font-bold text-white bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                                {row.revStrength ?? 50}%
                              </span>
                              <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                row.revStrengthLabel === "RC Bull"
                                  ? "text-emerald-400 bg-emerald-950/30 border-emerald-500 font-black animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                  : row.revStrengthLabel === "RC bear"
                                  ? "text-rose-400 bg-rose-950/30 border-rose-500 font-black shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                                  : (row.revStrength ?? 50) >= 60
                                  ? "text-green-400 bg-green-950/20 border-green-500/30"
                                  : (row.revStrength ?? 50) <= 40
                                  ? "text-red-400 bg-red-950/20 border-red-500/30"
                                  : "text-zinc-400 bg-zinc-900 border-zinc-800"
                              }`}>
                                {row.revStrengthLabel ?? "NEUTRAL"}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Laya Intelligence Score Column */}
                        <td className="py-3 px-3 text-center">
                          {row.isUnavailable ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <LayaIntelCell intel={computeLayaPreTurnIntel(row, "d6b_wthma")} />
                          )}
                        </td>
 
                        {/* TF (WT + HMA + TSI Stacked) Columns */}
                        {timeframes.map(tf => {
                          const data = row.timeframes[tf];
                          if (row.isUnavailable || !data || data.isUnavailable) {
                            return (
                              <td key={tf} className="py-2 px-1 text-center">
                                <span className="text-zinc-500 font-bold font-mono">---</span>
                              </td>
                            );
                          }
 
                          // We display an upper card for WT state, a middle card for HMA, and a lower card for TSI
                          return (
                            <td key={tf} className="py-2 px-1">
                              <div className="flex flex-col space-y-1 bg-[#14161d] border border-[#23262d] rounded-lg p-1.5 max-w-[124px] mx-auto min-h-[140px] justify-between shadow-sm">
                                
                                {/* 1. WAVE TREND (Momentum / Oscillator) */}
                                <div className={`flex flex-col items-center justify-center px-1.5 py-1 rounded text-[9px]/tight border text-center ${
                                  data.isBull
                                    ? "bg-green-950/15 border-green-500/30 text-green-400 animate-pulse-subtle"
                                    : data.isBear
                                    ? "bg-red-950/15 border-red-500/30 text-rose-400"
                                    : "bg-[#181a21]/50 border-zinc-800 text-zinc-500"
                                }`}>
                                  <span className="font-extrabold tracking-wide uppercase">
                                    {data.isBull ? "WT: BULL" : data.isBear ? "WT: BEAR" : "WT: WAIT"}
                                  </span>
                                  {data.barsSinceCross > 0 && (data.isBull || data.isBear) && (
                                    <span className="text-[7.5px] opacity-80 font-mono font-medium mt-0.5">
                                      {data.barsSinceCross} bars
                                    </span>
                                  )}
                                </div>
   
                                {/* 2. HMA 21 (Hull Moving Average Cross) */}
                                <div className={`flex flex-col items-center justify-center px-1.5 py-1 rounded text-[9px]/tight border text-center ${
                                  data.hmaIsBull
                                    ? "bg-emerald-950/15 border-emerald-500/35 text-emerald-400"
                                    : data.hmaIsBear
                                    ? "bg-purple-950/20 border-purple-500/35 text-purple-400"
                                    : "bg-[#181a21]/50 border-zinc-800 text-zinc-500"
                                }`}>
                                  <span className="font-extrabold tracking-wide uppercase">
                                    {data.hmaIsBull ? "HMA: BULL" : data.hmaIsBear ? "HMA: BEAR" : "HMA: WAIT"}
                                  </span>
                                  {(data.hmaBarsSinceCross ?? 0) > 0 && (data.hmaIsBull || data.hmaIsBear) && (
                                    <span className="text-[7.5px] opacity-80 font-mono font-medium mt-0.5">
                                      {data.hmaBarsSinceCross} bars
                                    </span>
                                  )}
                                </div>

                                {/* 3. TSI (Trend Strength Index) */}
                                {data.scaledTsi === undefined || data.scaledTsi === null ? (
                                  <div className="flex flex-col items-center justify-center px-1.5 py-1 text-zinc-600 text-[9px] font-mono font-bold">
                                    ---
                                  </div>
                                ) : (
                                  <div className={`flex flex-col items-center justify-center px-1.5 py-1 rounded text-[9px]/tight border text-center ${
                                    data.isTsiBull
                                      ? "bg-amber-950/20 border-amber-500/40 text-amber-400"
                                      : data.isTsiBear
                                      ? "bg-orange-950/20 border-orange-500/40 text-orange-400"
                                      : "bg-[#181a21]/50 border-zinc-800 text-zinc-500"
                                  }`}>
                                    <span className="font-extrabold tracking-wide uppercase">
                                      {data.isTsiBull ? "TSI: BULL" : data.isTsiBear ? "TSI: BEAR" : "TSI: WAIT"}
                                    </span>
                                    {(data.tsiBarsSinceCross ?? 0) > 0 && (data.isTsiBull || data.isTsiBear) && (
                                      <span className="text-[7.5px] opacity-80 font-mono font-medium mt-0.5">
                                        {data.tsiBarsSinceCross} bars
                                      </span>
                                    )}
                                  </div>
                                )}
   
                              </div>
                            </td>
                          );
                        })}
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
        </>
      )}
      </div>
    </div>
  );
}

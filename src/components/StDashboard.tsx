import React, { useState, useEffect } from "react";
import { 
  ExternalLink, 
  Search, 
  Globe, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Timeframe } from "../types.js";
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from "../data/watchlists.js";

interface StTimeframeData {
  wt1?: number;
  wt2?: number;
  isBull?: boolean;
  isBear?: boolean;
  barsSinceCross?: number;
  
  isStBull: boolean;
  isStBear: boolean;
  stBarsSinceCross: number;
  
  isStHtf1Bull: boolean;
  isStHtf1Bear: boolean;
  stHtf1BarsSinceCross: number;
  isUnavailable?: boolean;
}

interface StSymbolRow {
  Symbol: string;
  Description: string;
  stStrength: number;
  stStrengthLabel: string;
  stHtf1Strength: number;
  stHtf1StrengthLabel: string;
  revStrength?: number;
  revStrengthLabel?: string;
  isUnavailable?: boolean;
  timeframes: {
    [key in Timeframe]?: StTimeframeData;
  };
}

interface StDashboardProps {
  personalSymbols: string[];
}

export default function StDashboard({ personalSymbols }: StDashboardProps) {
  const timeframes: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];
  const [activeWatchlist, setActiveWatchlist] = useState<"personal" | "nifty500" | "fno">("personal");
  const [symbolsData, setSymbolsData] = useState<StSymbolRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // View Mode: High Timeframe mode (default) vs Current Timeframe mode
  const [viewMode, setViewMode] = useState<"high" | "current">("current");

  // Overall Filters
  const [stStrengthFilter, setStStrengthFilter] = useState<string>("All");
  const [reversalFilter, setReversalFilter] = useState<string>("All");
  const [regimeTimeframe, setRegimeTimeframe] = useState<string>("All");
  const [regimeState, setRegimeState] = useState<string>("All");
  
  // Per-Timeframe ST Filter states
  const [stTfFilters, setStTfFilters] = useState<{[key in Timeframe]?: string}>({});

  // Sorting
  const [sortField, setSortField] = useState<string>("stStrength");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [tfSortMode, setTfSortMode] = useState<"regime" | "bars">("bars");

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

  const fetchStData = async () => {
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
      console.error("Error fetching Supertrend data:", error);
      setErrorMessage(error.message || "Failed loading live Supertrend core indicator dataset.");
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger query on active watchlist change, personal watchlist update, searchQuery, page, or page size change
  useEffect(() => {
    fetchStData();
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

  // Helper to evaluate cell status based on active viewMode
  const getCellState = (data: StTimeframeData | undefined) => {
    if (!data || data.isUnavailable) {
      return { isBull: false, isBear: false, bars: 0, isUnavailable: true };
    }
    if (viewMode === "high") {
      return {
        isBull: !!data.isStHtf1Bull,
        isBear: !!data.isStHtf1Bear,
        bars: data.stHtf1BarsSinceCross ?? 0,
        isUnavailable: false
      };
    } else {
      return {
        isBull: !!data.isStBull,
        isBear: !!data.isStBear,
        bars: data.stBarsSinceCross ?? 0,
        isUnavailable: false
      };
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

    // 2. ST Strength filter (uses row.stHtf1StrengthLabel in High TF mode, row.stStrengthLabel in Current TF mode)
    if (stStrengthFilter !== "All") {
      const labelValue = viewMode === "high" ? row.stHtf1StrengthLabel : row.stStrengthLabel;
      const actualLabel = (labelValue || "NEUTRAL").toUpperCase();
      if (stStrengthFilter === "All Bull") {
        if (actualLabel !== "STRONG BULL" && actualLabel !== "BULL") return false;
      } else if (stStrengthFilter === "All Bear") {
        if (actualLabel !== "STRONG BEAR" && actualLabel !== "BEAR") return false;
      } else {
        const targetLabel = stStrengthFilter.toUpperCase();
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

    // 4. Timeframe Regime filter (Mode-aware)
    if (regimeTimeframe !== "All" && regimeState !== "All") {
      const tf = regimeTimeframe as Timeframe;
      const data = row.timeframes[tf];
      const cell = getCellState(data);
      if (cell.isUnavailable) return false;

      if (regimeState === "ST_BULL" || regimeState === "BULL") {
        if (!cell.isBull) return false;
      } else if (regimeState === "ST_BEAR" || regimeState === "BEAR") {
        if (!cell.isBear) return false;
      } else if (regimeState === "WAIT") {
        if (cell.isBull || cell.isBear) return false;
      }
    }

    // 5. Individual Timeframe Column ST filters (Mode-aware)
    for (const tf of timeframes) {
      const filterVal = stTfFilters[tf];
      if (filterVal && filterVal !== "All") {
        const data = row.timeframes[tf];
        const cell = getCellState(data);
        if (filterVal === "Bull") {
          if (cell.isUnavailable || !cell.isBull) return false;
        } else if (filterVal === "Bear") {
          if (cell.isUnavailable || !cell.isBear) return false;
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
    } else if (sortField === "stStrength") {
      valA = viewMode === "high" ? a.stHtf1Strength : a.stStrength;
      valB = viewMode === "high" ? b.stHtf1Strength : b.stStrength;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else if (sortField === "revStrength") {
      valA = a.revStrength ?? 50;
      valB = b.revStrength ?? 50;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    } else {
      // Timeframe column sorting
      const tf = sortField as Timeframe;
      const cellA = getCellState(a.timeframes[tf]);
      const cellB = getCellState(b.timeframes[tf]);

      if (tfSortMode === "bars") {
        const hasA = !cellA.isUnavailable && (cellA.isBull || cellA.isBear);
        const hasB = !cellB.isUnavailable && (cellB.isBull || cellB.isBear);

        if (!hasA && !hasB) return 0;
        if (!hasA) return 1;
        if (!hasB) return -1;

        return sortDirection === "asc" ? cellA.bars - cellB.bars : cellB.bars - cellA.bars;
      } else {
        if (cellA.isUnavailable) return 1;
        if (cellB.isUnavailable) return -1;

        const stateScore = (cell: ReturnType<typeof getCellState>) => {
          if (cell.isUnavailable) return 0;
          if (cell.isBull) return 3;
          if (cell.isBear) return 1;
          return 2; // Wait
        };

        const scoreA = stateScore(cellA);
        const scoreB = stateScore(cellB);

        if (scoreA !== scoreB) {
          return sortDirection === "asc" ? scoreA - scoreB : scoreB - scoreA;
        } else {
          return sortDirection === "asc" ? cellA.bars - cellB.bars : cellB.bars - cellA.bars;
        }
      }
    }
  });

  return (
    <div className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col space-y-4">
      
      {/* Upper Control Bar */}
      <div id="st-control-bar" className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-4 shadow-xl flex flex-col xl:flex-row items-center justify-between gap-4">
        
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

          {/* Mode Selector */}
          <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-3 py-1.5 rounded-lg">
            <span className="text-xs font-mono text-orange-400 font-bold uppercase">Mode:</span>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as "high" | "current")}
              className="bg-[#13151a] border-none text-white text-xs rounded focus:outline-none font-sans font-extrabold cursor-pointer h-[24px]"
            >
              <option value="high" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>High Timeframe</option>
              <option value="current" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>Current Timeframe</option>
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
          {/* Strength Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">Strength:</span>
            <select
              value={stStrengthFilter}
              onChange={(e) => setStStrengthFilter(e.target.value)}
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

          {/* Regime Filters */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">Regime:</span>
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
                <option value="All">Any State</option>
                <option value="BULL">ST BULL</option>
                <option value="BEAR">ST BEAR</option>
                <option value="WAIT">WAIT</option>
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
              <option value="bars" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>Bars Since Cross</option>
            </select>
          </div>

          {/* Refresh Action */}
          <button
            onClick={fetchStData}
            disabled={isLoading}
            className="p-2 ml-1 bg-[#13151a] hover:bg-orange-500/10 border border-[#2a2d32] hover:border-orange-500/30 text-white rounded-lg transition-all focus:outline-none cursor-pointer flex items-center justify-center shrink-0"
            title="Refresh D2 - ST Screener"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${isLoading ? "animate-spin text-orange-500" : ""}`} />
          </button>
        </div>

      </div>

      {/* Grid Screener Table */}
      <div className="bg-[#0b0c10] border border-[#1f2229] rounded-xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-yellow-500 to-zinc-900" />
        
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="h-8 w-8 text-orange-500 animate-spin" />
            <p className="text-sm font-semibold text-zinc-400 font-sans tracking-wide">
              Calculating Supertrend Engine...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="py-16 text-center text-red-400 px-6">
            <p className="font-mono text-xs max-w-lg mx-auto bg-red-950/20 border border-red-500/30 p-4 rounded-xl">
              {errorMessage}
            </p>
            <button
              onClick={fetchStData}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all border border-zinc-700"
            >
              Retry Pipeline Scan
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-auto min-h-[600px] max-h-[720px]">
            <table className="w-full text-left border-collapse min-w-[1250px]">
              <thead>
                <tr className="bg-[#111318] border-b border-[#2a2d32] text-[10px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono sticky top-0 z-10 shadow-[0_1px_0_0_rgba(42,45,50,1)] select-none">
                  <th 
                    className="py-2.5 px-4 cursor-pointer hover:bg-[#15171e] transition-all w-[240px]"
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
                          setStStrengthFilter("All");
                          setReversalFilter("All");
                          setRegimeTimeframe("All");
                          setRegimeState("All");
                          setStTfFilters({});
                        }}
                        className="bg-orange-500 hover:bg-orange-600 text-black text-[8px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded transition-all uppercase text-left w-max shrink-0 cursor-pointer shadow-[0_1px_4px_rgba(249,115,22,0.15)] animate-pulse"
                      >
                        FILTER RESET
                      </button>
                    </div>
                  </th>

                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[160px]"
                    onClick={() => handleSort("stStrength")}
                  >
                    <div className="flex items-center space-x-1.5 justify-center">
                      <span>ST Strength</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "stStrength" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>

                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[160px]"
                    onClick={() => handleSort("revStrength")}
                  >
                    <div className="flex items-center space-x-1.5 justify-center">
                      <span>Reversal Strength</span>
                      <span className="text-orange-400 font-bold text-[9px]">
                        {sortField === "revStrength" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </div>
                  </th>

                  {timeframes.map(tf => (
                    <th 
                      key={tf}
                      className="py-2.5 px-2 text-center w-[125px] border-b border-[#2a2d32]"
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
                          {tfSortMode === "bars" ? "by bars" : "by state"}
                        </span>
                      </div>
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={stTfFilters[tf] || "All"}
                          onChange={(e) => {
                            e.stopPropagation();
                            setStTfFilters(prev => ({ ...prev, [tf]: e.target.value }));
                          }}
                          className={`w-full bg-[#181a21] border rounded px-1 py-0.5 text-[9px] font-sans font-extrabold cursor-pointer focus:outline-none transition-colors ${
                            (stTfFilters[tf] || "All") !== "All"
                              ? "border-orange-500 text-orange-400 bg-orange-950/15"
                              : "border-[#2a2d32] text-zinc-400 hover:text-white"
                          }`}
                        >
                          <option value="All">Regime: All</option>
                          <option value="Bull">Regime: Bull</option>
                          <option value="Bear">Regime: Bear</option>
                        </select>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d32]/40 text-xs font-mono">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-20 text-center text-[#8e9299] font-sans italic">
                      No symbols discovered matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map(row => {
                    const activeStrength = viewMode === "high" ? row.stHtf1Strength : row.stStrength;
                    const activeStrengthLabel = viewMode === "high" ? row.stHtf1StrengthLabel : row.stStrengthLabel;

                    return (
                      <tr key={row.Symbol} className="hover:bg-[#1a1c21]/40 border-l-2 border-l-transparent transition-all">
                        {/* Ticker Name Column */}
                        <td className="py-3.2 px-4 font-sans max-w-[240px]">
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

                        {/* ST Strength Column */}
                        <td className="py-3.2 px-4 text-center">
                          {row.isUnavailable || activeStrength === undefined || activeStrength === null ? (
                            <span className="text-zinc-500 font-bold font-mono">---</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1">
                              <span className="text-[13px] font-mono font-bold text-white bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                                {activeStrength}%
                              </span>
                              <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                activeStrength >= 60
                                  ? "text-green-400 bg-green-950/20 border-green-500/30"
                                  : activeStrength <= 40
                                  ? "text-red-400 bg-red-950/20 border-red-500/30"
                                  : "text-zinc-400 bg-zinc-900 border-zinc-800"
                              }`}>
                                {activeStrengthLabel}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Reversal Strength Column */}
                        <td className="py-3.2 px-4 text-center">
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

                        {/* TF Columns */}
                        {timeframes.map(tf => {
                          const data = row.timeframes[tf];
                          const cell = getCellState(data);

                          if (row.isUnavailable || cell.isUnavailable) {
                            return (
                              <td key={tf} className="py-3.2 px-3 text-center">
                                <span className="text-zinc-500 font-bold font-mono">---</span>
                              </td>
                            );
                          }

                          if (cell.isBull) {
                            return (
                              <td key={tf} className="py-3.2 px-3 text-center">
                                <div className="flex flex-col items-center justify-center bg-green-950/25 border border-green-500/40 px-2 py-1 rounded text-[10px]/tight text-green-400 max-w-[110px] mx-auto min-h-[50px]">
                                  <span className="font-extrabold tracking-wide uppercase">ST BULL</span>
                                  <span className="text-[9px] text-green-400/80 font-bold">{cell.bars} BARS</span>
                                </div>
                              </td>
                            );
                          } else if (cell.isBear) {
                            return (
                              <td key={tf} className="py-3.2 px-3 text-center">
                                <div className="flex flex-col items-center justify-center bg-red-950/25 border border-red-500/40 px-2 py-1 rounded text-[10px]/tight text-red-400 max-w-[110px] mx-auto min-h-[50px]">
                                  <span className="font-extrabold tracking-wide uppercase">ST BEAR</span>
                                  <span className="text-[9px] text-red-400/80 font-bold">{cell.bars} BARS</span>
                                </div>
                              </td>
                            );
                          } else {
                            return (
                              <td key={tf} className="py-3.2 px-3 text-center">
                                <div className="inline-block text-[10px] font-bold text-zinc-500 bg-[#14161c] border border-zinc-800/50 px-2.5 py-1 rounded">
                                  WAIT
                                </div>
                              </td>
                            );
                          }
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

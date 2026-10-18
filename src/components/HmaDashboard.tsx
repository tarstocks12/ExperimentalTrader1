import React, { useState, useEffect } from "react";
import { 
  ExternalLink, 
  Search, 
  Globe, 
  RefreshCw, 
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Timeframe } from "../types.js";
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from "../data/watchlists.js";
import { computeLayaPreTurnIntel } from "../lib/laya-engine.js";
import { LayaIntelCell } from "./LayaIntelCell.js";

interface HmaTimeframeData {
  hmaOpen: number;
  hmaClose: number;
  hmaIsBull: boolean;
  hmaIsBear: boolean;
  hmaBarsSinceCross: number;
  screenerHmaHtf1b?: boolean;
  screenerHmaHtf1s?: boolean;
  screenerHmaHtf1Bars?: number;
  isUnavailable?: boolean;
}

interface HmaSymbolRow {
  Symbol: string;
  Description: string;
  hmaStrength: number;
  hmaStrengthLabel: string;
  timeframes: {
    [key in Timeframe]?: HmaTimeframeData;
  };
  isUnavailable?: boolean;
}

interface HmaDashboardProps {
  personalSymbols: string[];
}

export default function HmaDashboard({ personalSymbols }: HmaDashboardProps) {
  const timeframes: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];
  const [activeWatchlist, setActiveWatchlist] = useState<"personal" | "nifty500" | "fno">("personal");
  const [symbolsData, setSymbolsData] = useState<HmaSymbolRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Filters
  const [strengthFilter, setStrengthFilter] = useState<string>("All");
  const [regimeTimeframe, setRegimeTimeframe] = useState<string>("All"); // "All" or a specific Timeframe
  const [regimeState, setRegimeState] = useState<string>("All"); // "All", "BULL", "BEAR", "WAIT"
  const [tfFilters, setTfFilters] = useState<{[key in Timeframe]?: string}>({});
  
  // Sorting
  const [sortField, setSortField] = useState<string>("hmaStrength");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [tfSortMode, setTfSortMode] = useState<"regime" | "bars">("bars");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(250);

  // View Mode state (High Timeframe is default!)
  const [viewMode, setViewMode] = useState<"current" | "high">("current");

  // Get TradingView URL (matched to App.tsx custom mapping)
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
    if (symbol === "BAJAJ_AUTO") {
      return "https://www.tradingview.com/chart/YqH7uRQv/?symbol=NSE%3ABAJAJ_AUTO";
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

  // Fetch HMA (via wt-dashboard API) data
  const fetchHmaData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const masterSymbols = getFilteredMasterSymbols();
      if (masterSymbols.length === 0) {
        setSymbolsData([]);
        setIsLoading(false);
        return;
      }
      
      const chunkCount = 35;
      const chunks: string[][] = [];
      for (let i = 0; i < masterSymbols.length; i += chunkCount) {
        chunks.push(masterSymbols.slice(i, i + chunkCount));
      }
      
      const allFetchedData: HmaSymbolRow[] = [];
      for (const chunk of chunks) {
        const symbolsQuery = chunk.join(",");
        const response = await fetch(`/api/wt-dashboard?symbols=${encodeURIComponent(symbolsQuery)}`);
        if (!response.ok) {
          throw new Error(`Pipeline API error (Status: ${response.status})`);
        }
        const json = await response.json();
        if (json.status === "ok" && Array.isArray(json.data)) {
          allFetchedData.push(...json.data);
        }
      }
      
      setSymbolsData(allFetchedData);
    } catch (err: any) {
      console.error("Error fetching HMA dashboard data:", err);
      setErrorMessage(err.message || "Failed to load symbols metric data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHmaData();
    setCurrentPage(1);
  }, [activeWatchlist, personalSymbols]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Dynamically map data if in High Timeframe or Current Timeframe mode
  const processedSymbolsData = symbolsData.map(row => {
    const weights: { [key in Timeframe]: number } = {
      "1m": 0,
      "5m": 1,
      "15m": 1,
      "1H": 2,
      "3H": 2,
      "4H": 3,
      "1D": 5,
      "3D": 5,
      "1W": 6,
      "1M": 0
    };

    const mappedTimeframes: { [key in Timeframe]?: HmaTimeframeData } = {};
    let netScore = 0;
    let totalWeight = 0;

    timeframes.forEach(tf => {
      const orig = row.timeframes[tf];
      if (orig) {
        let isBull = false;
        let isBear = false;
        let barsSinceCross = 0;

        if (viewMode === "high") {
          isBull = orig.screenerHmaHtf1b ?? false;
          isBear = orig.screenerHmaHtf1s ?? false;
          barsSinceCross = orig.screenerHmaHtf1Bars ?? 0;
        } else {
          isBull = orig.hmaIsBull ?? false;
          isBear = orig.hmaIsBear ?? false;
          barsSinceCross = orig.hmaBarsSinceCross ?? 0;
        }

        mappedTimeframes[tf] = {
          ...orig,
          hmaIsBull: isBull,
          hmaIsBear: isBear,
          hmaBarsSinceCross: barsSinceCross,
        };

        if (!orig.isUnavailable) {
          const w = weights[tf] ?? 0;
          totalWeight += w;
          if (isBull) {
            netScore += w;
          } else if (isBear) {
            netScore -= w;
          }
        }
      }
    });

    const hmaStrength = totalWeight > 0 ? Math.round(((netScore + totalWeight) / (2 * totalWeight)) * 100) : 50;

    let hmaStrengthLabel = "NEUTRAL";
    if (hmaStrength >= 80) {
      hmaStrengthLabel = "STRONG BULL";
    } else if (hmaStrength >= 60) {
      hmaStrengthLabel = "BULL";
    } else if (hmaStrength > 40) {
      hmaStrengthLabel = "NEUTRAL";
    } else if (hmaStrength >= 20) {
      hmaStrengthLabel = "BEAR";
    } else {
      hmaStrengthLabel = "STRONG BEAR";
    }

    const layaIntel = computeLayaPreTurnIntel({ ...row, timeframes: mappedTimeframes }, "d1_hma");

    return {
      ...row,
      hmaStrength,
      hmaStrengthLabel,
      layaIntel,
      timeframes: mappedTimeframes
    };
  });

  // Filtering Logic
  const filteredRows = processedSymbolsData.filter(row => {
    // 1. Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const symbolMatches = row.Symbol.toLowerCase().includes(q);
      const descMatches = row.Description.toLowerCase().includes(q);
      if (!symbolMatches && !descMatches) return false;
    }

    // 2. Strength filter
    if (strengthFilter !== "All") {
      const actualLabel = row.hmaStrengthLabel.toUpperCase();
      if (strengthFilter === "All Bull") {
        if (actualLabel !== "STRONG BULL" && actualLabel !== "BULL") return false;
      } else if (strengthFilter === "All Bear") {
        if (actualLabel !== "STRONG BEAR" && actualLabel !== "BEAR") return false;
      } else {
        const targetLabel = strengthFilter.toUpperCase();
        if (actualLabel !== targetLabel) return false;
      }
    }

    // 3. Timeframe Regime filter
    if (regimeTimeframe !== "All" && regimeState !== "All") {
      const tf = regimeTimeframe as Timeframe;
      const data = row.timeframes[tf];
      if (!data) return false;

      if (regimeState === "BULL") {
        if (!data.hmaIsBull) return false;
      } else if (regimeState === "BEAR") {
        if (!data.hmaIsBear) return false;
      } else if (regimeState === "WAIT") {
        if (data.hmaIsBull || data.hmaIsBear) return false;
      }
    }

    // 4. Individual Timeframe Column Filters
    for (const tf of timeframes) {
      const colFilter = tfFilters[tf];
      if (colFilter && colFilter !== "All") {
        const data = row.timeframes[tf];
        if (colFilter === "Bull") {
          if (!data || !data.hmaIsBull) return false;
        } else if (colFilter === "Bear") {
          if (!data || !data.hmaIsBear) return false;
        }
      }
    }

    return true;
  });

  // Sorting Logic
  const sortedRows = [...filteredRows].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    if (sortField === "Symbol" || sortField === "Description") {
      valA = a[sortField];
      valB = b[sortField];
    } else if (sortField === "hmaStrength") {
      valA = a.hmaStrength;
      valB = b.hmaStrength;
    } else if (sortField === "layaIntel") {
      valA = a.layaIntel?.score ?? 50;
      valB = b.layaIntel?.score ?? 50;
    } else {
      // Timeframe sorting
      const tf = sortField as Timeframe;
      const tfA = a.timeframes[tf];
      const tfB = b.timeframes[tf];

      const hasA = tfA && (tfA.hmaIsBull || tfA.hmaIsBear);
      const hasB = tfB && (tfB.hmaIsBull || tfB.hmaIsBear);

      if (!hasA && !hasB) return 0;
      if (!hasA) return 1; // move uncrossed/wait down
      if (!hasB) return -1;

      if (tfSortMode === "bars") {
        // Sort by bars since cross
        valA = tfA?.hmaBarsSinceCross ?? 0;
        valB = tfB?.hmaBarsSinceCross ?? 0;
      } else {
        // Default: Sort by state (Bull > Wait > Bear)
        const stateA = tfA?.hmaIsBull ? 2 : tfA?.hmaIsBear ? 0 : 1;
        const stateB = tfB?.hmaIsBull ? 2 : tfB?.hmaIsBear ? 0 : 1;
        valA = stateA;
        valB = stateB;
      }
    }

    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalItems = sortedRows.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleFirstPage = () => {
    setCurrentPage(1);
  };

  const handleLastPage = () => {
    setCurrentPage(totalPages);
  };

  return (
    <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col space-y-6">
      {/* Header Panel */}
      <div className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Watchlist Tabs */}
          <div className="flex bg-[#13151a] border border-[#2a2d32] p-1 rounded-lg">
            <button
              onClick={() => { setActiveWatchlist("personal"); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-sans font-extrabold tracking-wide rounded cursor-pointer transition-all ${
                activeWatchlist === "personal"
                  ? "bg-zinc-800 text-white shadow"
                  : "text-[#8e9299] hover:text-[#e0e0e0]"
              }`}
            >
              Personal List
            </button>
            <button
              onClick={() => { setActiveWatchlist("nifty500"); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-sans font-extrabold tracking-wide rounded cursor-pointer transition-all ${
                activeWatchlist === "nifty500"
                  ? "bg-zinc-800 text-white shadow"
                  : "text-[#8e9299] hover:text-[#e0e0e0]"
              }`}
            >
              Nifty 500
            </button>
            <button
              onClick={() => { setActiveWatchlist("fno"); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-sans font-extrabold tracking-wide rounded cursor-pointer transition-all ${
                activeWatchlist === "fno"
                  ? "bg-zinc-800 text-white shadow"
                  : "text-[#8e9299] hover:text-[#e0e0e0]"
              }`}
            >
              F&O Universe
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8e9299]" />
            <input
              type="text"
              placeholder="Search ticker symbol..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-[#13151a] border border-[#2a2d32] rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors font-sans"
            />
          </div>
        </div>

        {/* Global Controls & Mode Selector */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Refresh Pipeline Button */}
          <button
            onClick={fetchHmaData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 bg-[#13151a] hover:bg-[#1a1d24] active:bg-[#111317] border border-[#2a2d32] px-3 py-1.5 rounded-lg text-xs font-mono font-extrabold text-[#8e9299] hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-orange-400" : ""}`} />
            <span>{isLoading ? "LOADING..." : "REFRESH"}</span>
          </button>

          {/* View Mode Selector */}
          <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-2.5 py-1 rounded">
            <span className="text-[#8e9299] text-xs">Mode:</span>
            <select
              value={viewMode}
              onChange={(e) => { setViewMode(e.target.value as "current" | "high"); setCurrentPage(1); }}
              className="bg-transparent border-none text-white text-xs font-sans font-extrabold focus:outline-none cursor-pointer"
            >
              <option value="high" className="bg-[#13151a]">High Timeframe</option>
              <option value="current" className="bg-[#13151a]">Current Timeframe</option>
            </select>
          </div>

          {/* Sort Mode Select */}
          <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-2.5 py-1 rounded">
            <span className="text-[#8e9299] text-xs">TF Sort:</span>
            <select
              value={tfSortMode}
              onChange={(e) => setTfSortMode(e.target.value as "regime" | "bars")}
              className="bg-transparent border-none text-white text-xs font-sans font-extrabold focus:outline-none cursor-pointer"
            >
              <option value="regime" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>By State (Trend)</option>
              <option value="bars" className="bg-black text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>By Bars Elapsed</option>
            </select>
          </div>

          {/* Filters Button / Popover placeholder or simple display */}
          <div className="flex items-center space-x-1 bg-[#1a1c23] border border-[#2e313a] px-2.5 py-1.5 rounded text-[11px] text-[#8e9299] font-mono select-none">
            <SlidersHorizontal className="h-3 w-3 text-orange-400" />
            <span>CRITERIA DISCOVERY ACTIVATED</span>
          </div>
        </div>
      </div>

      {/* Advanced Filter Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-[#0d0e12] border border-[#2a2d32] p-4 rounded-xl shadow-xl">
        {/* Strength Filter Selector */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-[10px] font-mono uppercase text-[#8e9299] tracking-wider font-bold">HMA Strength Filter</label>
          <select
            value={strengthFilter}
            onChange={(e) => { setStrengthFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#13151a] border border-[#2a2d32] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="All">All Strengths</option>
            <option value="All Bull">All Bullish Strengths</option>
            <option value="Strong Bull">Strong Bull (≥ 80%)</option>
            <option value="Bull">Bull (60% - 79%)</option>
            <option value="Neutral">Neutral (41% - 59%)</option>
            <option value="Bear">Bear (20% - 40%)</option>
            <option value="Strong Bear">Strong Bear (≤ 19%)</option>
            <option value="All Bear">All Bearish Strengths</option>
          </select>
        </div>

        {/* Timeframe selector for Regime Filter */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-[10px] font-mono uppercase text-[#8e9299] tracking-wider font-bold">Regime Timeframe</label>
          <select
            value={regimeTimeframe}
            onChange={(e) => { setRegimeTimeframe(e.target.value); setCurrentPage(1); }}
            className="bg-[#13151a] border border-[#2a2d32] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="All">All Timeframes</option>
            {timeframes.map(tf => (
              <option key={tf} value={tf}>{tf.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Regime State to find in selected Timeframe */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-[10px] font-mono uppercase text-[#8e9299] tracking-wider font-bold">Target Trend State</label>
          <select
            value={regimeState}
            onChange={(e) => { setRegimeState(e.target.value); setCurrentPage(1); }}
            disabled={regimeTimeframe === "All"}
            className="bg-[#13151a] border border-[#2a2d32] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="All">All States</option>
            <option value="BULL">HMA Bullish (Close &gt; Open)</option>
            <option value="BEAR">HMA Bearish (Close &lt; Open)</option>
            <option value="WAIT">HMA Wait State</option>
          </select>
        </div>

        {/* Universe Metrics counter info banner */}
        <div className="flex items-center justify-between border border-[#2a2d32]/80 bg-[#13151a] p-3 rounded-lg">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-[#8e9299] uppercase font-bold">Universe Discovery</span>
            <span className="text-lg font-sans font-black text-white mt-1">
              {totalItems} <span className="text-xs text-zinc-500 font-mono font-medium">Symbols</span>
            </span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-mono text-orange-400 bg-orange-950/20 px-2 py-1 rounded border border-orange-500/20 uppercase font-bold select-none">
              D1 HMA
            </span>
          </div>
        </div>
      </div>

      {/* Main Board Table */}
      <div className="bg-[#0d0e12] border border-[#2a2d32] rounded-2xl shadow-2xl overflow-hidden">
        {isLoading ? (
          <div className="py-24 text-center">
            <RefreshCw className="h-10 w-10 text-orange-500 animate-spin mx-auto mb-4" />
            <p className="text-[#8e9299] font-sans text-sm animate-pulse font-bold">
              Extracting market aggregates and computing custom Open/Close HMA models...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="py-20 text-center px-4">
            <p className="text-red-400 font-sans font-bold text-sm mb-4">
              Error fetching dashboard model parameters: {errorMessage}
            </p>
            <button
              onClick={fetchHmaData}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all border border-zinc-700"
            >
              Retry Load Pipeline
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
                            setStrengthFilter("All");
                            setRegimeTimeframe("All");
                            setRegimeState("All");
                            setTfFilters({});
                          }}
                          className="bg-orange-500 hover:bg-orange-600 text-black text-[8px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded transition-all uppercase text-left w-max shrink-0 cursor-pointer shadow-[0_1px_4px_rgba(249,115,22,0.15)]"
                        >
                          FILTER RESET
                        </button>
                      </div>
                    </th>

                    <th 
                      className="py-3.5 px-4 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[160px]"
                      onClick={() => handleSort("hmaStrength")}
                    >
                      <div className="flex items-center space-x-1.5 justify-center">
                        <span>HMA Strength</span>
                        <span className="text-orange-400 font-bold text-[9px]">
                          {sortField === "hmaStrength" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
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
                        className="py-2.5 px-2 text-center w-[125px] border-b border-[#2a2d32]"
                      >
                        <div 
                          className="flex flex-col items-center space-y-0.5 justify-center cursor-pointer hover:text-white transition-all select-none font-bold"
                          onClick={() => handleSort(tf)}
                        >
                          <div className="flex items-center space-x-1 justify-center text-[10px]">
                            <span className="tracking-wide">{tf.toUpperCase()}</span>
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
                            value={tfFilters[tf] || "All"}
                            onChange={(e) => {
                              e.stopPropagation();
                              setTfFilters(prev => ({ ...prev, [tf]: e.target.value }));
                            }}
                            className={`w-full bg-black border rounded px-1 py-0.5 text-[9px] font-sans font-extrabold cursor-pointer focus:outline-none transition-colors ${
                              (tfFilters[tf] || "All") !== "All"
                                ? "border-orange-500 text-orange-400 bg-orange-950/15"
                                : "border-[#2a2d32] text-zinc-400 hover:text-white"
                            }`}
                          >
                            <option value="All" className="bg-black text-white">All</option>
                            <option value="Bull" className="bg-black text-white">Regime: Bull</option>
                            <option value="Bear" className="bg-black text-white">Regime: Bear</option>
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2d32]/40 text-xs font-mono">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-[#8e9299] font-sans italic">
                        No symbols discovered matching current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map(row => {
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

                          {/* Cumulative HMA Strength Column */}
                          <td className="py-3.2 px-4 text-center font-sans">
                            {row.isUnavailable ? (
                              <span className="text-zinc-500 font-bold font-mono">---</span>
                            ) : (
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <span className="text-[13px] font-mono font-bold text-white bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                                  {row.hmaStrength}%
                                </span>
                                <span className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded border tracking-wide uppercase leading-none whitespace-nowrap ${
                                  row.hmaStrength >= 60
                                    ? "text-green-400 bg-green-950/20 border-green-500/30"
                                    : row.hmaStrength <= 40
                                    ? "text-red-400 bg-red-950/20 border-red-500/30"
                                    : "text-zinc-400 bg-zinc-900 border-zinc-800"
                                }`}>
                                  {row.hmaStrengthLabel}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Laya Intelligence Score Column */}
                          <td className="py-3.2 px-3 text-center font-sans">
                            {row.isUnavailable ? (
                              <span className="text-zinc-500 font-bold font-mono">---</span>
                            ) : (
                              <LayaIntelCell intel={row.layaIntel} />
                            )}
                          </td>

                          {/* TF Columns */}
                          {timeframes.map(tf => {
                            const data = row.timeframes[tf];
                            if (row.isUnavailable || !data || data.isUnavailable) {
                              return (
                                <td key={tf} className="py-3.2 px-3 text-center">
                                  <span className="text-zinc-500 font-bold font-mono">---</span>
                                </td>
                              );
                            }

                            if (data.hmaIsBull) {
                              return (
                                <td key={tf} className="py-3.2 px-3 text-center">
                                  <div className="flex flex-col items-center justify-center bg-green-950/25 border border-green-500/40 px-2 py-1 rounded text-[10px]/tight text-green-400 max-w-[110px] mx-auto min-h-[50px]">
                                    <span className="font-extrabold tracking-wide uppercase text-[9px]">HMA BULL</span>
                                    <span className="text-[9px] text-green-400/80 font-bold">{data.hmaBarsSinceCross} BARS</span>
                                  </div>
                                </td>
                              );
                            } else if (data.hmaIsBear) {
                              return (
                                <td key={tf} className="py-3.2 px-3 text-center">
                                  <div className="flex flex-col items-center justify-center bg-red-950/25 border border-red-500/40 px-2 py-1 rounded text-[10px]/tight text-red-400 max-w-[110px] mx-auto min-h-[50px]">
                                    <span className="font-extrabold tracking-wide uppercase text-[9px]">HMA BEAR</span>
                                    <span className="text-[9px] text-red-400/80 font-bold">{data.hmaBarsSinceCross} BARS</span>
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
                <div className="text-xs text-[#8e9299] font-sans">
                  Showing <span className="text-white font-bold">{startIndex + 1}</span> to{" "}
                  <span className="text-white font-bold">{Math.min(startIndex + pageSize, totalItems)}</span> of{" "}
                  <span className="text-white font-bold">{totalItems}</span> discoverable assets
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleFirstPage}
                    disabled={currentPage === 1}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[#8e9299] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="First Page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[#8e9299] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-white px-3 font-bold font-sans">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[#8e9299] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleLastPage}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-[#8e9299] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Last Page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

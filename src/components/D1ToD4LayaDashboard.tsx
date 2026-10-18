import React, { useState, useEffect, useMemo } from "react";
import {
  ExternalLink,
  Search,
  Globe,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from "lucide-react";
import { Timeframe } from "../types.js";
import { FNO_SYMBOLS_LIST, NIFTY_500_SYMBOLS_LIST } from "../data/watchlists.js";
import { computeD1ToD4CombinedLaya, D1ToD4CombinedIntel } from "../lib/laya-engine.js";
import { LayaIntelCell } from "./LayaIntelCell.js";

interface D1ToD4LayaDashboardProps {
  personalSymbols: string[];
}

export default function D1ToD4LayaDashboard({ personalSymbols }: D1ToD4LayaDashboardProps) {
  const timeframes: Timeframe[] = ["5m", "15m", "1H", "3H", "4H", "1D", "3D", "1W"];
  const [activeWatchlist, setActiveWatchlist] = useState<"personal" | "nifty500" | "fno">("personal");
  const [symbolsData, setSymbolsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [combinedScoreFilter, setCombinedScoreFilter] = useState<string>("All");
  const [layaTurnFilter, setLayaTurnFilter] = useState<string>("All");
  const [dashboardTurnFilter, setDashboardTurnFilter] = useState<string>("All");
  const [tfFilters, setTfFilters] = useState<{ [key in Timeframe]?: string }>({});

  // Sorting
  const [sortField, setSortField] = useState<string>("combinedLayaScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(250);

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
      list = list.filter((sym) => sym.toUpperCase().includes(q));
    }
    return list;
  };

  const filteredMasterSymbols = getFilteredMasterSymbols();
  const totalItems = filteredMasterSymbols.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const displayPage = Math.min(currentPage, totalPages);

  const getTargetSymbols = (): string[] => {
    const startIndex = (displayPage - 1) * pageSize;
    return filteredMasterSymbols.slice(startIndex, startIndex + pageSize);
  };

  const fetchDashboardData = async () => {
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
      console.error("Error fetching D1-D4 Laya data:", error);
      setErrorMessage(error.message || "Failed loading D1-D4 Laya Combined dataset.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeWatchlist, personalSymbols.length, searchQuery, displayPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeWatchlist, searchQuery]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const enrichedRows = useMemo(() => {
    return symbolsData.map((row) => {
      const intel: D1ToD4CombinedIntel = computeD1ToD4CombinedLaya(row);
      return {
        ...row,
        intel,
      };
    });
  }, [symbolsData]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const symMatch = row.Symbol?.toLowerCase().includes(q);
        const descMatch = row.Description?.toLowerCase().includes(q);
        if (!symMatch && !descMatch) return false;
      }

      const { intel } = row;

      // 1. Combined D1-D4 Score filter
      if (combinedScoreFilter !== "All") {
        const lbl = intel.combinedD1D4Label.toUpperCase();
        if (combinedScoreFilter === "All Bull") {
          if (lbl !== "STRONG BULL" && lbl !== "BULL") return false;
        } else if (combinedScoreFilter === "All Bear") {
          if (lbl !== "STRONG BEAR" && lbl !== "BEAR") return false;
        } else if (lbl !== combinedScoreFilter.toUpperCase()) {
          return false;
        }
      }

      // 2. Combined Laya Turn Filter
      if (layaTurnFilter !== "All") {
        const turnLbl = intel.combinedLaya.label;
        if (layaTurnFilter === "All Turn Bull") {
          if (turnLbl !== "STRONG TURN BULL" && turnLbl !== "TURN BULL") return false;
        } else if (layaTurnFilter === "All Turn Bear") {
          if (turnLbl !== "STRONG TURN BEAR" && turnLbl !== "TURN BEAR") return false;
        } else if (turnLbl !== layaTurnFilter.toUpperCase()) {
          return false;
        }
      }

      // 3. Specific Dashboard Pre-Turn Filter
      if (dashboardTurnFilter !== "All") {
        if (dashboardTurnFilter === "D1_BULL" && intel.d1Laya.direction !== "BULL") return false;
        if (dashboardTurnFilter === "D1_BEAR" && intel.d1Laya.direction !== "BEAR") return false;
        if (dashboardTurnFilter === "D2_BULL" && intel.d2Laya.direction !== "BULL") return false;
        if (dashboardTurnFilter === "D2_BEAR" && intel.d2Laya.direction !== "BEAR") return false;
        if (dashboardTurnFilter === "D3_BULL" && intel.d3Laya.direction !== "BULL") return false;
        if (dashboardTurnFilter === "D3_BEAR" && intel.d3Laya.direction !== "BEAR") return false;
        if (dashboardTurnFilter === "D4_BULL" && intel.d4Laya.direction !== "BULL") return false;
        if (dashboardTurnFilter === "D4_BEAR" && intel.d4Laya.direction !== "BEAR") return false;
      }

      // 4. Timeframe column filters
      for (const tf of timeframes) {
        const f = tfFilters[tf];
        if (f && f !== "All") {
          const tfState = intel.perTfPreTurn[tf]?.state || "WAIT";
          if (f === "TURN BULL" && tfState !== "TURN BULL") return false;
          if (f === "TURN BEAR" && tfState !== "TURN BEAR") return false;
          if (f === "BULL" && tfState !== "BULL" && tfState !== "TURN BULL") return false;
          if (f === "BEAR" && tfState !== "BEAR" && tfState !== "TURN BEAR") return false;
        }
      }

      return true;
    });
  }, [enrichedRows, searchQuery, combinedScoreFilter, layaTurnFilter, dashboardTurnFilter, tfFilters]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const ia = a.intel as D1ToD4CombinedIntel;
      const ib = b.intel as D1ToD4CombinedIntel;

      if (sortField === "Symbol") {
        return sortDirection === "asc"
          ? a.Symbol.localeCompare(b.Symbol)
          : b.Symbol.localeCompare(a.Symbol);
      }

      let valA = 50;
      let valB = 50;

      if (sortField === "combinedD1D4Score") {
        valA = ia.combinedD1D4Score;
        valB = ib.combinedD1D4Score;
      } else if (sortField === "combinedLayaScore") {
        valA = ia.combinedLaya.score;
        valB = ib.combinedLaya.score;
      } else if (sortField === "d1Score") {
        valA = ia.d1Score;
        valB = ib.d1Score;
      } else if (sortField === "d1Laya") {
        valA = ia.d1Laya.score;
        valB = ib.d1Laya.score;
      } else if (sortField === "d2Score") {
        valA = ia.d2Score;
        valB = ib.d2Score;
      } else if (sortField === "d2Laya") {
        valA = ia.d2Laya.score;
        valB = ib.d2Laya.score;
      } else if (sortField === "d3Score") {
        valA = ia.d3Score;
        valB = ib.d3Score;
      } else if (sortField === "d3Laya") {
        valA = ia.d3Laya.score;
        valB = ib.d3Laya.score;
      } else if (sortField === "d4Score") {
        valA = ia.d4Score;
        valB = ib.d4Score;
      } else if (sortField === "d4Laya") {
        valA = ia.d4Laya.score;
        valB = ib.d4Laya.score;
      } else {
        // Timeframe sort
        valA = ia.perTfPreTurn[sortField]?.score ?? 50;
        valB = ib.perTfPreTurn[sortField]?.score ?? 50;
      }

      return sortDirection === "asc" ? valA - valB : valB - valA;
    });
  }, [filteredRows, sortField, sortDirection]);

  const renderStrengthMini = (score: number, label: string, tag: string) => {
    const isBull = label === "STRONG BULL" || label === "BULL";
    const isBear = label === "STRONG BEAR" || label === "BEAR";
    return (
      <div className="flex items-center justify-between w-full px-2 py-0.5 rounded bg-[#14171f] border border-[#252934] text-[9px] font-mono">
        <span className="text-zinc-400 font-bold">{tag}:</span>
        <span
          className={`font-bold tabular-nums ${
            isBull ? "text-emerald-400" : isBear ? "text-amber-400" : "text-zinc-400"
          }`}
        >
          {score}% ({label.replace("STRONG ", "S.")})
        </span>
      </div>
    );
  };

  return (
    <div className="flex-1 max-w-[1800px] w-full mx-auto p-4 sm:p-6 flex flex-col space-y-4">
      {/* Upper Control Bar */}
      <div className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-4 shadow-xl flex flex-col xl:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto flex-1">
          {/* Title Pill */}
          <div className="flex items-center space-x-2 bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5 rounded-lg shrink-0">
            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-mono font-bold text-emerald-300 tracking-wide uppercase">
              D1–D4 Combined & Laya Pre-Turn Hub
            </span>
          </div>

          {/* Watchlist Universe */}
          <div className="flex items-center space-x-2 shrink-0 bg-[#13151a] border border-[#2a2d32] px-3 py-1.5 rounded-lg">
            <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase hidden sm:inline">
              Universe:
            </span>
            <select
              value={activeWatchlist}
              onChange={(e) => setActiveWatchlist(e.target.value as any)}
              className="bg-[#13151a] border-none text-white text-xs rounded focus:outline-none font-sans font-extrabold cursor-pointer h-[24px]"
            >
              <option value="personal">Personal ({personalSymbols.length})</option>
              <option value="nifty500">Nifty 500 ({NIFTY_500_SYMBOLS_LIST.length})</option>
              <option value="fno">F&O ({FNO_SYMBOLS_LIST.length})</option>
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
              className="w-full bg-[#13151a] border border-[#2a2d32] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 font-sans font-bold"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono w-full xl:w-auto">
          {/* Combined D1-D4 Score Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">D1–D4 Score:</span>
            <select
              value={combinedScoreFilter}
              onChange={(e) => setCombinedScoreFilter(e.target.value)}
              className="bg-[#13151a] border border-[#2a2d32] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 font-sans font-bold cursor-pointer"
            >
              <option value="All">All Scores</option>
              <option value="All Bull">All Bull</option>
              <option value="All Bear">All Bear</option>
              <option value="Strong Bull">Strong Bull</option>
              <option value="Bull">Bull</option>
              <option value="Neutral">Neutral</option>
              <option value="Bear">Bear</option>
              <option value="Strong Bear">Strong Bear</option>
            </select>
          </div>

          {/* Laya Pre-Turn Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-emerald-400 font-bold">Laya Turn:</span>
            <select
              value={layaTurnFilter}
              onChange={(e) => setLayaTurnFilter(e.target.value)}
              className="bg-[#13151a] border border-emerald-500/30 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-400 font-sans font-bold cursor-pointer"
            >
              <option value="All">All Pre-Turn States</option>
              <option value="All Turn Bull">About to Turn Bullish (All)</option>
              <option value="All Turn Bear">About to Turn Bearish (All)</option>
              <option value="STRONG TURN BULL">Strong Turn Bull</option>
              <option value="TURN BULL">Turn Bull</option>
              <option value="NEUTRAL">Neutral</option>
              <option value="TURN BEAR">Turn Bear</option>
              <option value="STRONG TURN BEAR">Strong Turn Bear</option>
            </select>
          </div>

          {/* Individual Dashboard Pre-Turn Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[#8e9299]">By Dashboard:</span>
            <select
              value={dashboardTurnFilter}
              onChange={(e) => setDashboardTurnFilter(e.target.value)}
              className="bg-[#13151a] border border-[#2a2d32] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 font-sans font-bold cursor-pointer"
            >
              <option value="All">Any D1–D4</option>
              <option value="D1_BULL">D1 (HMA) Turning Bull</option>
              <option value="D1_BEAR">D1 (HMA) Turning Bear</option>
              <option value="D2_BULL">D2 (ST) Turning Bull</option>
              <option value="D2_BEAR">D2 (ST) Turning Bear</option>
              <option value="D3_BULL">D3 (WT) Turning Bull</option>
              <option value="D3_BEAR">D3 (WT) Turning Bear</option>
              <option value="D4_BULL">D4 (TSI) Turning Bull</option>
              <option value="D4_BEAR">D4 (TSI) Turning Bear</option>
            </select>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="p-2 ml-1 bg-[#13151a] hover:bg-emerald-500/10 border border-[#2a2d32] hover:border-emerald-500/30 text-white rounded-lg transition-all focus:outline-none cursor-pointer flex items-center justify-center shrink-0"
            title="Refresh D1-D4 Combined Laya Intelligence"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-emerald-400 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Main Combined Matrix Table */}
      <div className="bg-[#0b0c10] border border-[#1f2229] rounded-xl overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-amber-500" />

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
            <p className="text-sm font-semibold text-zinc-400 font-sans tracking-wide">
              Synthesizing D1 (HMA) + D2 (ST) + D3 (WT) + D4 (TSI) Scores & Pre-Turn Laya Intelligence...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="py-16 text-center text-red-400 px-6">
            <p className="font-mono text-xs max-w-lg mx-auto bg-red-950/20 border border-red-500/30 p-4 rounded-xl">
              {errorMessage}
            </p>
            <button
              onClick={fetchDashboardData}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold rounded-lg cursor-pointer transition-all border border-zinc-700"
            >
              Retry Pipeline Scan
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-auto min-h-[600px] max-h-[740px]">
              <table className="w-full text-left border-collapse min-w-[1750px]">
                <thead>
                  <tr className="bg-[#111318] border-b border-[#2a2d32] text-[10px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono sticky top-0 z-10 shadow-[0_1px_0_0_rgba(42,45,50,1)] select-none">
                    {/* Symbol Column */}
                    <th
                      className="py-3 px-4 cursor-pointer hover:bg-[#15171e] transition-all w-[210px]"
                      onClick={() => handleSort("Symbol")}
                    >
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1.5 text-[#8e9299] hover:text-white">
                          <span>Symbol</span>
                          <span className="text-emerald-400 font-bold text-[9px]">
                            {sortField === "Symbol" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearchQuery("");
                            setCombinedScoreFilter("All");
                            setLayaTurnFilter("All");
                            setDashboardTurnFilter("All");
                            setTfFilters({});
                          }}
                          className="bg-emerald-500 hover:bg-emerald-600 text-black text-[8px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded transition-all uppercase text-left w-max shrink-0 cursor-pointer"
                        >
                          FILTER RESET
                        </button>
                      </div>
                    </th>

                    {/* Combined D1-D4 Score Column */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[180px] border-l border-[#1f2229] bg-[#12161f]"
                      onClick={() => handleSort("combinedD1D4Score")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-cyan-400">
                          <span>D1–D4 Combined Score</span>
                          <span className="text-[9px]">
                            {sortField === "combinedD1D4Score"
                              ? sortDirection === "asc"
                                ? "▲"
                                : "▼"
                              : "↕"}
                          </span>
                        </div>
                        <span className="text-[8px] text-zinc-500 font-normal">
                          HMA + ST + WT + TSI
                        </span>
                      </div>
                    </th>

                    {/* Combined Laya Intelligence Score Column */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[195px] border-l border-[#1f2229] bg-emerald-950/15"
                      onClick={() => handleSort("combinedLayaScore")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-emerald-400">
                          <span>Combined Laya Intel</span>
                          <span className="text-[9px]">
                            {sortField === "combinedLayaScore"
                              ? sortDirection === "asc"
                                ? "▲"
                                : "▼"
                              : "↕"}
                          </span>
                        </div>
                        <span className="text-[8px] text-emerald-500/80 font-normal">
                          Pre-Turn Bull / Bear Detector
                        </span>
                      </div>
                    </th>

                    {/* D1 (HMA 21) Score & Laya Intel */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[165px] border-l border-[#1f2229]"
                      onClick={() => handleSort("d1Laya")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-indigo-400">
                          <span>D1 (HMA) Laya</span>
                          <span className="text-[9px]">
                            {sortField === "d1Laya" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort("d1Score");
                          }}
                          className="text-[8px] text-zinc-400 hover:text-indigo-300 underline cursor-pointer"
                        >
                          Sort by D1 Score {sortField === "d1Score" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </div>
                    </th>

                    {/* D2 (SuperTrend) Score & Laya Intel */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[165px] border-l border-[#1f2229]"
                      onClick={() => handleSort("d2Laya")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-amber-400">
                          <span>D2 (ST) Laya</span>
                          <span className="text-[9px]">
                            {sortField === "d2Laya" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort("d2Score");
                          }}
                          className="text-[8px] text-zinc-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          Sort by D2 Score {sortField === "d2Score" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </div>
                    </th>

                    {/* D3 (WaveTrend) Score & Laya Intel */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[165px] border-l border-[#1f2229]"
                      onClick={() => handleSort("d3Laya")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-teal-400">
                          <span>D3 (WT) Laya</span>
                          <span className="text-[9px]">
                            {sortField === "d3Laya" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort("d3Score");
                          }}
                          className="text-[8px] text-zinc-400 hover:text-teal-300 underline cursor-pointer"
                        >
                          Sort by D3 Score {sortField === "d3Score" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </div>
                    </th>

                    {/* D4 (TSI) Score & Laya Intel */}
                    <th
                      className="py-3 px-3 cursor-pointer hover:bg-[#15171e] hover:text-white transition-all text-center w-[165px] border-l border-[#1f2229]"
                      onClick={() => handleSort("d4Laya")}
                    >
                      <div className="flex flex-col items-center space-y-0.5">
                        <div className="flex items-center space-x-1 text-purple-400">
                          <span>D4 (TSI) Laya</span>
                          <span className="text-[9px]">
                            {sortField === "d4Laya" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort("d4Score");
                          }}
                          className="text-[8px] text-zinc-400 hover:text-purple-300 underline cursor-pointer"
                        >
                          Sort by D4 Score {sortField === "d4Score" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </div>
                    </th>

                    {/* Multi-Timeframe Pre-Turn Columns */}
                    {timeframes.map((tf) => (
                      <th
                        key={tf}
                        className="py-2.5 px-2 cursor-pointer hover:bg-[#15171e] transition-all text-center min-w-[95px] border-l border-[#1f2229]"
                        onClick={() => handleSort(tf)}
                      >
                        <div className="flex flex-col items-center space-y-1.5">
                          <div className="flex items-center space-x-1 justify-center text-[#8e9299] hover:text-white">
                            <span>{tf}</span>
                            <span className="text-emerald-400 font-bold text-[9px]">
                              {sortField === tf ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </div>
                          <select
                            value={tfFilters[tf] || "All"}
                            onChange={(e) => {
                              e.stopPropagation();
                              setTfFilters((prev) => ({ ...prev, [tf]: e.target.value }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-black text-white border border-[#2a2d32] rounded px-1 py-0.5 text-[9px] font-sans font-bold focus:outline-none focus:border-emerald-500 cursor-pointer w-full text-center"
                          >
                            <option value="All">All</option>
                            <option value="TURN BULL">Turn Bull</option>
                            <option value="TURN BEAR">Turn Bear</option>
                            <option value="BULL">Bull</option>
                            <option value="BEAR">Bear</option>
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#1a1c22] text-xs">
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7 + timeframes.length}
                        className="py-12 text-center text-zinc-500 font-mono"
                      >
                        No symbols matched the active D1–D4 Laya Intelligence filter criteria.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => {
                      const intel: D1ToD4CombinedIntel = row.intel;
                      const isCombBull =
                        intel.combinedD1D4Label === "STRONG BULL" ||
                        intel.combinedD1D4Label === "BULL";
                      const isCombBear =
                        intel.combinedD1D4Label === "STRONG BEAR" ||
                        intel.combinedD1D4Label === "BEAR";

                      return (
                        <tr
                          key={row.Symbol}
                          className="hover:bg-[#14171f] transition-colors group"
                        >
                          {/* Symbol */}
                          <td className="py-3 px-4 font-mono">
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-white text-sm tracking-tight group-hover:text-emerald-400 transition-colors">
                                    {row.Symbol}
                                  </span>
                                  <a
                                    href={getTradingViewUrl(row.Symbol)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-500 hover:text-emerald-400 transition-colors p-1 bg-[#181b24] rounded border border-white/5"
                                    title={`Open ${row.Symbol} in TradingView`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                <span className="text-[10px] text-[#8e9299] truncate max-w-[165px] font-sans">
                                  {row.Description}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Combined D1-D4 Score */}
                          <td className="py-3 px-3 text-center border-l border-[#1a1c22] bg-[#10131b]/60">
                            <div className="flex flex-col items-center justify-center space-y-1.5">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider uppercase border ${
                                  intel.combinedD1D4Label === "STRONG BULL"
                                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                                    : intel.combinedD1D4Label === "BULL"
                                    ? "bg-emerald-950/30 text-emerald-400 border-emerald-500/20"
                                    : intel.combinedD1D4Label === "STRONG BEAR"
                                    ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                    : intel.combinedD1D4Label === "BEAR"
                                    ? "bg-amber-950/30 text-amber-500 border-amber-500/20"
                                    : "bg-zinc-900/90 text-zinc-400 border-zinc-800"
                                }`}
                              >
                                {intel.combinedD1D4Label}
                              </span>
                              <div className="flex items-center space-x-2">
                                <div className="w-20 bg-[#181a20] h-1.5 rounded-full overflow-hidden p-[1px] border border-white/5">
                                  <div
                                    className={`h-full rounded-full ${
                                      isCombBull
                                        ? "bg-gradient-to-r from-emerald-600 to-cyan-400"
                                        : isCombBear
                                        ? "bg-gradient-to-r from-amber-600 to-orange-400"
                                        : "bg-zinc-500"
                                    }`}
                                    style={{ width: `${intel.combinedD1D4Score}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-[11px] font-mono font-bold tabular-nums ${
                                    isCombBull
                                      ? "text-emerald-400"
                                      : isCombBear
                                      ? "text-amber-400"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  {intel.combinedD1D4Score}%
                                </span>
                              </div>
                              <div className="text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                <span>D1:{intel.d1Score}%</span>
                                <span>•</span>
                                <span>D2:{intel.d2Score}%</span>
                                <span>•</span>
                                <span>D3:{intel.d3Score}%</span>
                                <span>•</span>
                                <span>D4:{intel.d4Score}%</span>
                              </div>
                            </div>
                          </td>

                          {/* Combined Laya Intelligence Score */}
                          <td className="py-3 px-3 text-center border-l border-[#1a1c22] bg-emerald-950/5">
                            <LayaIntelCell intel={intel.combinedLaya} />
                          </td>

                          {/* D1 (HMA 21) Score & Laya Intel */}
                          <td className="py-2.5 px-2.5 text-center border-l border-[#1a1c22]">
                            <div className="flex flex-col items-center space-y-1.5">
                              {renderStrengthMini(intel.d1Score, intel.d1Label, "D1 HMA")}
                              <LayaIntelCell intel={intel.d1Laya} compact />
                            </div>
                          </td>

                          {/* D2 (SuperTrend) Score & Laya Intel */}
                          <td className="py-2.5 px-2.5 text-center border-l border-[#1a1c22]">
                            <div className="flex flex-col items-center space-y-1.5">
                              {renderStrengthMini(intel.d2Score, intel.d2Label, "D2 ST")}
                              <LayaIntelCell intel={intel.d2Laya} compact />
                            </div>
                          </td>

                          {/* D3 (WaveTrend) Score & Laya Intel */}
                          <td className="py-2.5 px-2.5 text-center border-l border-[#1a1c22]">
                            <div className="flex flex-col items-center space-y-1.5">
                              {renderStrengthMini(intel.d3Score, intel.d3Label, "D3 WT")}
                              <LayaIntelCell intel={intel.d3Laya} compact />
                            </div>
                          </td>

                          {/* D4 (TSI) Score & Laya Intel */}
                          <td className="py-2.5 px-2.5 text-center border-l border-[#1a1c22]">
                            <div className="flex flex-col items-center space-y-1.5">
                              {renderStrengthMini(intel.d4Score, intel.d4Label, "D4 TSI")}
                              <LayaIntelCell intel={intel.d4Laya} compact />
                            </div>
                          </td>

                          {/* Per-Timeframe Pre-Turn Matrix */}
                          {timeframes.map((tf) => {
                            const tfInfo = intel.perTfPreTurn[tf];
                            if (!tfInfo) {
                              return (
                                <td
                                  key={tf}
                                  className="py-3 px-2 text-center border-l border-[#1a1c22] text-zinc-700 font-mono text-[10px]"
                                >
                                  ---
                                </td>
                              );
                            }

                            const isTurnBull = tfInfo.state === "TURN BULL";
                            const isTurnBear = tfInfo.state === "TURN BEAR";
                            const isBull = tfInfo.state === "BULL";
                            const isBear = tfInfo.state === "BEAR";

                            return (
                              <td
                                key={tf}
                                className="py-2.5 px-1.5 text-center border-l border-[#1a1c22]"
                              >
                                <div className="flex flex-col items-center justify-center space-y-1">
                                  <span
                                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                                      isTurnBull
                                        ? "bg-emerald-950/60 text-emerald-300 border-emerald-400/50"
                                        : isTurnBear
                                        ? "bg-rose-950/60 text-rose-300 border-rose-400/50"
                                        : isBull
                                        ? "bg-emerald-950/25 text-emerald-400 border-emerald-500/25"
                                        : isBear
                                        ? "bg-amber-950/25 text-amber-400 border-amber-500/25"
                                        : "bg-[#15171e] text-zinc-500 border-zinc-800"
                                    }`}
                                  >
                                    {(isTurnBull || isBull) && (
                                      <ArrowUpRight className="w-2.5 h-2.5 shrink-0" />
                                    )}
                                    {(isTurnBear || isBear) && (
                                      <ArrowDownRight className="w-2.5 h-2.5 shrink-0" />
                                    )}
                                    <span>{tfInfo.state}</span>
                                  </span>
                                  <span className="text-[9px] font-mono text-zinc-400 tabular-nums">
                                    Laya:{" "}
                                    <strong
                                      className={
                                        tfInfo.score >= 58
                                          ? "text-emerald-400"
                                          : tfInfo.score <= 42
                                          ? "text-amber-400"
                                          : "text-zinc-400"
                                      }
                                    >
                                      {tfInfo.score}%
                                    </strong>
                                  </span>
                                  <span className="text-[8px] font-mono text-zinc-500">
                                    B:{tfInfo.bullSignals}/4 • S:{tfInfo.bearSignals}/4
                                  </span>
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

            {/* Pagination Footer */}
            <div className="bg-[#111318] border-t border-[#2a2d32] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#8e9299]">
              <div className="flex items-center space-x-3">
                <span>
                  Showing{" "}
                  <strong className="text-white">
                    {sortedRows.length > 0 ? (displayPage - 1) * pageSize + 1 : 0}
                  </strong>{" "}
                  to{" "}
                  <strong className="text-white">
                    {Math.min(displayPage * pageSize, totalItems)}
                  </strong>{" "}
                  of <strong className="text-emerald-400">{totalItems}</strong> Universe Symbols
                </span>
                <span className="text-zinc-700">|</span>
                <div className="flex items-center space-x-1.5">
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-[#181b22] border border-[#2a2d32] text-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer font-bold"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250 (All)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={displayPage === 1 || isLoading}
                  className="p-1.5 rounded bg-[#181b22] border border-[#2a2d32] text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={displayPage === 1 || isLoading}
                  className="p-1.5 rounded bg-[#181b22] border border-[#2a2d32] text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-3 py-1 bg-[#13151a] border border-[#2a2d32] rounded text-white font-bold">
                  Page {displayPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={displayPage === totalPages || isLoading}
                  className="p-1.5 rounded bg-[#181b22] border border-[#2a2d32] text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={displayPage === totalPages || isLoading}
                  className="p-1.5 rounded bg-[#181b22] border border-[#2a2d32] text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, UTCTimestamp, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  RefreshCw, 
  Globe, 
  Search, 
  BookOpen, 
  ArrowRight,
  TrendingUp as TrendIcon,
  ChevronsUp,
  ChevronsDown,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Info
} from "lucide-react";
import { ScreenerMetrics, Timeframe, HistoricalCandle } from "../types.js";

// Helper function to calculate EMA
function calcEMA_TI(src: number[], len: number): number[] {
  const ema: number[] = [];
  if (src.length === 0) return ema;
  const k = 2 / (len + 1);
  let prev = src[0];
  for (let i = 0; i < src.length; i++) {
    const cur = src[i] * k + prev * (1 - k);
    ema.push(cur);
    prev = cur;
  }
  return ema;
}

// Helper function to calculate SMA
function calcSMA_TI(src: number[], len: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (i < len - 1) {
      const sum = src.slice(0, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / (i + 1));
    } else {
      const sum = src.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / len);
    }
  }
  return sma;
}

// RSI (14) Calculation Formula
function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period) return closes.map(() => 50);

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period; i++) rsi.push(50); // offset padding

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const gain = gains[i - 1];
    const loss = losses[i - 1];

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const currentRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + currentRS));
  }

  return rsi;
}

// Bollinger Bands (20, 2) Calculation Formula
function calculateBollingerBands(closes: number[], period = 20, multiplier = 2) {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middle.push(closes[i]);
      upper.push(closes[i]);
      lower.push(closes[i]);
      continue;
    }

    const window = closes.slice(i - period + 1, i + 1);
    const sum = window.reduce((a, b) => a + b, 0);
    const mean = sum / period;

    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push(mean);
    upper.push(mean + multiplier * stdDev);
    lower.push(mean - multiplier * stdDev);
  }

  return { upper, middle, lower };
}

// MACD (12, 26, 9) Calculation Formula
function calculateMACD(closes: number[], fast = 12, slow = 26, signalLen = 9) {
  const emaFast = calcEMA_TI(closes, fast);
  const emaSlow = calcEMA_TI(closes, slow);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = calcEMA_TI(macdLine, signalLen);
  const histogram: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }

  return { macdLine, signalLine, histogram };
}

interface TechnicalIndicatorsProps {
  screenerRows: ScreenerMetrics[];
  personalSymbols: string[];
  activeWatchlist: "personal" | "nifty500" | "fno";
  setActiveWatchlist: (val: "personal" | "nifty500" | "fno") => void;
  selectedRow: ScreenerMetrics | null;
  setSelectedRow: (row: ScreenerMetrics | null) => void;
  activeTimeframe: Timeframe;
  setActiveTimeframe: (t: Timeframe) => void;
}

export default function TechnicalIndicators({
  screenerRows,
  personalSymbols,
  activeWatchlist,
  setActiveWatchlist,
  selectedRow,
  setSelectedRow,
  activeTimeframe,
  setActiveTimeframe,
}: TechnicalIndicatorsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [history, setHistory] = useState<HistoricalCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeSegment, setActiveSegment] = useState<"summary" | "trends" | "momentum" | "volatility">("summary");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<HTMLDivElement>(null);

  // Filtered rows for watchlist panel
  const filteredRows = screenerRows.filter((row) => {
    // Watchlist set filter
    const matchesWatchlist =
      activeWatchlist === "personal"
        ? personalSymbols.includes(row.Symbol)
        : true; // other list sets are pre-filtered by App.tsx rows

    const matchesSearch = row.Symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          row.Description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesWatchlist && matchesSearch;
  });

  // Fetch candle data for selected stock
  useEffect(() => {
    if (!selectedRow?.Symbol) return;

    const fetchHistory = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const response = await fetch(
          `/api/symbol-history/${selectedRow.Symbol}?timeframe=${activeTimeframe}`
        );
        if (!response.ok) {
          throw new Error("Failed fetching stock history candles");
        }
        const parsed = await response.json();
        if (parsed.status === "ok" && Array.isArray(parsed.data)) {
          setHistory(parsed.data);
        } else {
          throw new Error(parsed.message || "Invalid payload format");
        }
      } catch (err: any) {
        console.error("Indicator page history fetch error:", err);
        setErrorMsg(err.message || "Failed connecting to real-time feeds");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [selectedRow?.Symbol, activeTimeframe]);

  // Handle Lightweight Technical Charts drawing & configuration
  useEffect(() => {
    if (!mainChartRef.current || !rsiChartRef.current || history.length === 0) return;

    mainChartRef.current.innerHTML = "";
    rsiChartRef.current.innerHTML = "";

    const closes = history.map((h) => h.Close);
    const bb = calculateBollingerBands(closes);
    const rsi = calculateRSI(closes);

    const baseTime = 1000000000;
    const intervalSecs = 3600;

    // Create tick timestamp alignments
    const formattedData = history.map((h, i) => {
      const timeVal = (baseTime + i * intervalSecs) as UTCTimestamp;
      return {
        time: timeVal,
        candle: {
          time: timeVal,
          open: h.Open,
          high: h.High,
          low: h.Low,
          close: h.Close,
        },
        bbUpper: { time: timeVal, value: Number(bb.upper[i].toFixed(2)) },
        bbMiddle: { time: timeVal, value: Number(bb.middle[i].toFixed(2)) },
        bbLower: { time: timeVal, value: Number(bb.lower[i].toFixed(2)) },
        rsiVal: { time: timeVal, value: Number(rsi[i].toFixed(2)) },
      };
    });

    const formatXAxisLabel = (timeVal: number): string => {
      const idx = Math.round((timeVal - baseTime) / intervalSecs);
      return history[idx]?.Time || "";
    };

    // Main Candle & Bollinger Chart
    const mainChart = createChart(mainChartRef.current, {
      width: mainChartRef.current.clientWidth || 600,
      height: 250,
      layout: {
        background: { type: ColorType.Solid, color: "#0d0e12" },
        textColor: "#8e9299",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "#1c1e24" },
        horzLines: { color: "#1c1e24" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(142, 146, 153, 0.4)", style: LineStyle.Dashed },
        horzLine: { color: "rgba(142, 146, 153, 0.4)", style: LineStyle.Dashed },
      },
      localization: {
        timeFormatter: (t: any) => formatXAxisLabel(Number(t)),
      },
      timeScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
        visible: false,
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
      },
    });

    // Sub-pane - RSI Chart
    const rsiChart = createChart(rsiChartRef.current, {
      width: rsiChartRef.current.clientWidth || 600,
      height: 110,
      layout: {
        background: { type: ColorType.Solid, color: "#0d0e12" },
        textColor: "#8e9299",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "#1c1e24" },
        horzLines: { color: "#1c1e24" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(142, 146, 153, 0.4)", style: LineStyle.Dashed },
        horzLine: { color: "rgba(142, 146, 153, 0.4)", style: LineStyle.Dashed },
      },
      localization: {
        timeFormatter: (t: any) => formatXAxisLabel(Number(t)),
      },
      timeScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
        visible: true,
        tickMarkFormatter: (t: any) => formatXAxisLabel(Number(t)),
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
      },
    });

    // Add Candlestick Series using v5 unified addSeries
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
    });
    candleSeries.setData(formattedData.map((d) => d.candle));

    // Bollinger Band Overlay Lines using v5 unified addSeries
    const upperBBSeries = mainChart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "BB Upper",
    });
    upperBBSeries.setData(formattedData.map((d) => d.bbUpper));

    const middleBBSeries = mainChart.addSeries(LineSeries, {
      color: "rgba(59, 130, 246, 0.5)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "BB Basis",
    });
    middleBBSeries.setData(formattedData.map((d) => d.bbMiddle));

    const lowerBBSeries = mainChart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "BB Lower",
    });
    lowerBBSeries.setData(formattedData.map((d) => d.bbLower));

    // RSI Subplot Series using v5 unified addSeries
    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: "#a855f7", // Stately Purple
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: "RSI (14)",
    });
    rsiSeries.setData(formattedData.map((d) => d.rsiVal));

    // Add static overbought (70) and oversold (30) guidelines on RSI Panel
    const rsiOBLine = rsiChart.addSeries(LineSeries, {
      color: "rgba(220, 38, 38, 0.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    rsiOBLine.setData(formattedData.map((d) => ({ time: d.time, value: 70 })));

    const rsiOSLine = rsiChart.addSeries(LineSeries, {
      color: "rgba(16, 185, 129, 0.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    rsiOSLine.setData(formattedData.map((d) => ({ time: d.time, value: 30 })));

    // Coordinate zooming/panning
    let isSyncing = false;
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      rsiChart.timeScale().setVisibleRange(range);
      isSyncing = false;
    });

    rsiChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      mainChart.timeScale().setVisibleRange(range);
      isSyncing = false;
    });

    // Resize Observer with duplicate width check to prevent loop feedback and blank canvas crashes
    let lastWidth = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const width = Math.floor(entries[0].contentRect.width);
      if (width === lastWidth || width <= 0) return;
      lastWidth = width;

      requestAnimationFrame(() => {
        if (mainChartRef.current && rsiChartRef.current) {
          mainChart.resize(width, 250);
          rsiChart.resize(width, 110);
        }
      });
    });
    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      rsiChart.remove();
    };
  }, [history]);

  // Derived indicator calculation metrics for selected stock
  const calculateIndicatorSummary = () => {
    if (history.length < 30) return null;

    const closes = history.map((h) => h.Close);
    const highs = history.map((h) => h.High);
    const lows = history.map((h) => h.Low);

    const len = history.length;
    const lastClose = closes[len - 1];

    // MAs
    const ema10 = calcEMA_TI(closes, 10);
    const ema20 = calcEMA_TI(closes, 20);
    const sma50 = calcSMA_TI(closes, 50);
    const sma150 = calcSMA_TI(closes, 150);

    const lastEma10 = ema10[len - 1];
    const lastEma20 = ema20[len - 1];
    const lastSma50 = sma50[len - 1];
    const lastSma150 = sma150[len - 1];

    // RSI
    const rsiValues = calculateRSI(closes);
    const lastRsi = rsiValues[len - 1];

    // Bollinger Bands
    const bb = calculateBollingerBands(closes);
    const lastBBBasis = bb.middle[len - 1];
    const lastBBUpper = bb.upper[len - 1];
    const lastBBLower = bb.lower[len - 1];
    const bbWidthPercent = ((lastBBUpper - lastBBLower) / lastBBBasis) * 100;

    // MACD
    const { macdLine, signalLine, histogram } = calculateMACD(closes);
    const lastMACD = macdLine[len - 1];
    const lastMACDSig = signalLine[len - 1];
    const lastMACDHist = histogram[len - 1];

    // SuperTrend status from server
    const lastSTUpper = history[len - 1].ST_Chart_Upper;
    const lastSTLower = history[len - 1].ST_Chart_Lower;
    const lastSTAvg = history[len - 1].ST_Chart_Avg;
    const isSTBullish = lastClose > lastSTAvg;

    // Consensus engine scoring card
    let buyCount = 0;
    let sellCount = 0;
    let neutralCount = 0;

    // 1. EMA cross consensus
    if (lastEma10 > lastEma20) buyCount++;
    else sellCount++;

    // 2. Price vs SMA 50
    if (lastClose > lastSma50) buyCount++;
    else sellCount++;

    // 3. Price vs SMA 150
    if (lastClose > lastSma150) buyCount++;
    else sellCount++;

    // 4. RSI condition
    if (lastRsi < 32) buyCount += 2; // strongly oversold
    else if (lastRsi > 68) sellCount += 2; // strongly overbought
    else neutralCount++;

    // 5. MACD trend
    if (lastMACD > lastMACDSig) buyCount++;
    else sellCount++;

    // 6. SuperTrend direction
    if (isSTBullish) buyCount++;
    else sellCount++;

    // 7. WaveTrend oscillator consensus
    const lastWT1 = history[len - 1].WT1;
    const lastWT2 = history[len - 1].WT2;
    if (lastWT1 > lastWT2) buyCount++;
    else sellCount++;

    const totalSignals = buyCount + sellCount + neutralCount;
    const scoreVal = (buyCount / (buyCount + sellCount || 1)) * 100;

    let consensusLabel = "NEUTRAL";
    let consensusColor = "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
    if (scoreVal >= 75) {
      consensusLabel = "STRONG BUY";
      consensusColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse";
    } else if (scoreVal >= 55) {
      consensusLabel = "BUY";
      consensusColor = "text-green-500 border-green-500/20 bg-green-500/5";
    } else if (scoreVal <= 25) {
      consensusLabel = "STRONG SELL";
      consensusColor = "text-red-400 border-red-500/30 bg-red-500/10";
    } else if (scoreVal <= 45) {
      consensusLabel = "SELL";
      consensusColor = "text-rose-500 border-rose-500/20 bg-rose-500/5";
    }

    return {
      lastClose,
      lastEma10,
      lastEma20,
      lastSma50,
      lastSma150,
      lastRsi,
      lastBBUpper,
      lastBBBasis,
      lastBBLower,
      bbWidthPercent,
      lastMACD,
      lastMACDSig,
      lastMACDHist,
      lastSTUpper,
      lastSTLower,
      lastSTAvg,
      isSTBullish,
      buyCount,
      sellCount,
      neutralCount,
      scoreVal,
      consensusLabel,
      consensusColor,
      lastWT1,
      lastWT2,
    };
  };

  const metrics = calculateIndicatorSummary();

  return (
    <div className="flex-1 max-w-[1700px] w-full mx-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
      
      {/* Left Column Watchlist Panel */}
      <div className="w-full lg:w-[400px] shrink-0 flex flex-col space-y-4 bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-4 shadow-xl">
        <h2 className="text-sm font-semibold tracking-wider font-mono text-white flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-orange-500" />
          INDICATOR WATCHLIST
        </h2>

        {/* Watchlist selector tab buttons */}
        <div className="grid grid-cols-3 gap-1 bg-[#13151a] border border-[#2a2d32] p-0.5 rounded-lg">
          <button
            onClick={() => setActiveWatchlist("personal")}
            className={`py-1 text-[10px] font-mono font-bold tracking-tight rounded cursor-pointer ${
              activeWatchlist === "personal"
                ? "bg-[#252830] text-orange-500"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            PERSONAL
          </button>
          <button
            onClick={() => setActiveWatchlist("nifty500")}
            className={`py-1 text-[10px] font-mono font-bold tracking-tight rounded cursor-pointer ${
              activeWatchlist === "nifty500"
                ? "bg-[#252830] text-orange-500"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            NIFTY 500
          </button>
          <button
            onClick={() => setActiveWatchlist("fno")}
            className={`py-1 text-[10px] font-mono font-bold tracking-tight rounded cursor-pointer ${
              activeWatchlist === "fno"
                ? "bg-[#252830] text-orange-500"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            F&O
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search stock..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 bg-[#13151a] border border-[#2a2d32] text-zinc-355 placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 transition-all font-sans"
          />
        </div>

        {/* List of stocks */}
        <div className="flex-1 overflow-y-auto max-h-[500px] pr-1 space-y-1">
          {filteredRows.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 font-mono text-xs">
              No matching tickers found.
            </div>
          ) : (
            filteredRows.map((row) => {
              const isSelected = selectedRow?.Symbol === row.Symbol;
              const hasChange = row.ChangePercent !== undefined;
              const isPositive = row.ChangePercent >= 0;

              return (
                <div
                  key={row.Symbol}
                  onClick={() => setSelectedRow(row)}
                  className={`w-full text-left p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-orange-500/[0.04] border-orange-500/40"
                      : "bg-[#14161c]/40 border-zinc-900 hover:border-zinc-800 hover:bg-[#1a1d24]/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white text-xs block font-mono">{row.Symbol}</span>
                      <span className="text-[10px] text-zinc-500 truncate block max-w-[200px]" title={row.Description}>
                        {row.Description}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-semibold text-zinc-200 block font-mono">
                        ₹{(row.ScreenerPrice || row.CurrentPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                      {hasChange && (
                        <span className={`text-[10px] font-mono font-bold flex items-center justify-end ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {isPositive ? "+" : ""}
                          {row.ChangePercent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Signal summary line */}
                  <div className="mt-2 pt-2 border-t border-[#1c1e24] flex items-center justify-between text-[10px] font-mono">
                    <span className="text-zinc-500">SIGNAL</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      row.ActiveSignal?.startsWith("E1") || row.ActiveSignal?.includes("BUY") || row.ActiveSignal?.startsWith("R1")
                        ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                        : row.ActiveSignal?.includes("SELL") || row.ActiveSignal?.includes("SHORT") || row.ActiveSignal?.includes("bear")
                        ? "bg-rose-950/40 text-rose-400 border border-rose-500/20"
                        : "bg-zinc-900 text-zinc-400"
                    }`}>
                      {row.ActiveSignal || "NEUTRAL"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column Advanced Analytics & Diagrams */}
      <div className="flex-1 flex flex-col space-y-6">
        
        {/* Selected target header details */}
        {selectedRow ? (
          <div className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="text-lg font-extrabold tracking-tight text-white font-mono">{selectedRow.Symbol}</span>
                <span className="text-xs font-mono text-zinc-500 font-semibold">{selectedRow.Description}</span>
              </div>
              <div className="mt-1 flex items-center space-x-3 text-xs font-mono">
                <span className="text-zinc-400">Current Rate: <strong className="text-white">₹{selectedRow.ScreenerPrice || selectedRow.CurrentPrice}</strong></span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-400">Active Timeframe:</span>
                <select
                  value={activeTimeframe}
                  onChange={(e) => setActiveTimeframe(e.target.value as Timeframe)}
                  className="bg-[#14161c] border border-zinc-800 text-orange-400 text-[11px] rounded px-1.5 py-0.5 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer text-center"
                >
                  <option value="1m">1 MIN</option>
                  <option value="5m">5 MIN</option>
                  <option value="15m">15 MIN</option>
                  <option value="1H">1 HOUR</option>
                  <option value="4H">4 HOUR</option>
                  <option value="1D">1 DAY</option>
                </select>
              </div>
            </div>

            {metrics && (
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-[10px] font-mono text-zinc-500 block">CONSENSUS EXTREMUM</span>
                  <span className={`text-base font-extrabold tracking-wider font-mono border px-3 py-1.5 rounded-lg flex items-center space-x-2 shadow-lg ${metrics.consensusColor}`}>
                    {metrics.consensusLabel}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-12 shadow-xl text-center flex flex-col items-center justify-center">
            <Activity className="h-12 w-12 text-zinc-600 mb-4 animate-pulse" />
            <h3 className="text-sm font-semibold text-white font-mono tracking-wider">NO STOCK SELECTED</h3>
            <p className="text-xs text-zinc-500 max-w-sm mt-1.5 font-sans leading-relaxed">
              Please choose a specific ticker from your Watchlist sidebar to load real-time technical momentum gauges and advanced chart systems.
            </p>
          </div>
        )}

        {/* Selected analytics panel contents */}
        {selectedRow && metrics && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            
            {/* Real-time Consensus Gauge & Counts Card */}
            <div className="xl:col-span-5 bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4">
              <h3 className="text-xs font-bold tracking-wider font-mono text-white pb-3 border-b border-[#2a2d32]">
                MULTIVARIATE CONSENSUS DIAL
              </h3>

              {/* Dial Arc Needle - Pure SVG for perfect layout centering */}
              <div className="flex flex-col items-center justify-center py-4 relative w-full">
                <div className="relative w-48 h-24">
                  <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                        <stop offset="35%" stopColor="#f59e0b" stopOpacity="0.8" />
                        <stop offset="65%" stopColor="#10b981" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#059669" stopOpacity="0.9" />
                      </linearGradient>
                      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Background Arch Track */}
                    <path
                      d="M 10 46 A 38 38 0 0 1 90 46"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />

                    {/* Colored Gradient Active Arc */}
                    <path
                      d="M 10 46 A 38 38 0 0 1 90 46"
                      fill="none"
                      stroke="url(#gaugeGradient)"
                      strokeWidth="6.5"
                      strokeLinecap="round"
                      strokeDasharray="125.6"
                      strokeDashoffset={Math.max(0, Math.min(125.6, 125.6 - (125.6 * metrics.scoreVal) / 100))}
                      className="transition-all duration-1000 ease-out"
                    />

                    {/* Left Extreme labels (0%) */}
                    <text x="7" y="49" fill="#71717a" fontSize="3" fontFamily="monospace" textAnchor="middle">BEAR</text>
                    {/* Right Extreme label (100%) */}
                    <text x="93" y="49" fill="#71717a" fontSize="3" fontFamily="monospace" textAnchor="middle">BULL</text>

                    {/* Needle Indicator rotating about coordinate (50, 46) */}
                    <g 
                      style={{ 
                        transform: `rotate(${(metrics.scoreVal / 100) * 180 - 90}deg)`,
                        transformOrigin: "50px 46px"
                      }}
                      className="transition-transform duration-700 ease-out"
                    >
                      {/* Needle body */}
                      <path
                        d="M 49 46 L 49.5 12 L 50.5 12 L 51 46 Z"
                        fill="#ff7a00"
                        filter="url(#glow)"
                      />
                    </g>

                    {/* Center Hub/Pivot Pin */}
                    <circle cx="50" cy="46" r="3.5" fill="#0d0e12" stroke="#ff7a00" strokeWidth="1.5" />
                    <circle cx="50" cy="46" r="1" fill="#fff" />
                  </svg>
                </div>

                {/* Score percentage text */}
                <div className="text-center mt-5">
                  <span className="text-3xl font-extrabold tracking-tight text-white font-mono hover:text-orange-400 transition-colors">
                    {metrics.scoreVal.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono block tracking-widest mt-0.5">BULLISH CONSENSUS</span>
                </div>
              </div>

              {/* Dynamic Consensus count details */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-3 border-t border-[#2a2d32]">
                <div className="p-2 border border-emerald-500/10 bg-emerald-500/[0.02] rounded-lg">
                  <span className="text-emerald-400 font-bold block">{metrics.buyCount}</span>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tight block mt-0.5">BULL SIGNALS</span>
                </div>
                <div className="p-2 border border-zinc-800 bg-zinc-900/10 rounded-lg">
                  <span className="text-zinc-400 font-bold block">{metrics.neutralCount}</span>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tight block mt-0.5">NEUTRAL</span>
                </div>
                <div className="p-2 border border-rose-500/10 bg-rose-500/[0.02] rounded-lg">
                  <span className="text-rose-400 font-bold block">{metrics.sellCount}</span>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-tight block mt-0.5">BEAR SIGNALS</span>
                </div>
              </div>
            </div>

            {/* Granular technical detail dashboard matrix */}
            <div className="xl:col-span-7 bg-[#0d0e12] border border-[#2a2d32] rounded-xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#2a2d32]">
                  <h3 className="text-xs font-bold tracking-wider font-mono text-white">
                    INDICATOR SCORING MATRIX
                  </h3>
                  
                  {/* Segment tabs */}
                  <div className="flex items-center space-x-1.5 bg-[#14161c] border border-zinc-850 p-0.5 rounded-md">
                    {(["summary", "trends", "momentum", "volatility"] as any[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveSegment(tab)}
                        className={`text-[8.5px] uppercase font-mono font-extrabold px-2 py-1 rounded transition-all cursor-pointer ${
                          activeSegment === tab
                            ? "bg-zinc-800 text-orange-400 border border-zinc-700/60"
                            : "text-[#8e9299] hover:text-white"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subsegment metric contents */}
                <div className="mt-4 space-y-2.5 font-mono text-xs text-zinc-350">
                  {activeSegment === "summary" && (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500 font-medium">Exponential MA Cross</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-zinc-400">EMA 10 vs 20</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            metrics.lastEma10 > metrics.lastEma20 ? "text-emerald-400 bg-emerald-950/20" : "text-rose-400 bg-rose-950/20"
                          }`}>
                            {metrics.lastEma10 > metrics.lastEma20 ? "BULL STACK" : "BEAR STACK"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500 font-medium">Relative Strength (RSI)</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-zinc-350 font-bold">{metrics.lastRsi?.toFixed(1) || "50"}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            metrics.lastRsi < 32 ? "text-emerald-400 bg-emerald-950/20" : metrics.lastRsi > 68 ? "text-rose-400 bg-rose-950/20" : "text-zinc-400 bg-zinc-900/40"
                          }`}>
                            {metrics.lastRsi < 32 ? "OVERSOLD" : metrics.lastRsi > 68 ? "OVERBOUGHT" : "STABLE"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500 font-medium">Trend SuperTrend Status</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-zinc-400">vs ST Support Line</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            metrics.isSTBullish ? "text-emerald-400 bg-emerald-950/20" : "text-rose-400 bg-rose-950/20"
                          }`}>
                            {metrics.isSTBullish ? "BULLISH ACTION" : "BEARISH REJECTION"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-500 font-medium">Trend WaveTrend (Fast/Slow)</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-zinc-350">WT1 ({metrics.lastWT1?.toFixed(1)}) / WT2 ({metrics.lastWT2?.toFixed(1)})</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            metrics.lastWT1 > metrics.lastWT2 ? "text-emerald-400 bg-emerald-950/20" : "text-rose-400 bg-rose-950/20"
                          }`}>
                            {metrics.lastWT1 > metrics.lastWT2 ? "BUY ACCEL" : "SELL ACCEL"}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {activeSegment === "trends" && (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">EMA Fast 10 Price</span>
                        <span className="text-zinc-300">₹{metrics.lastEma10?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">EMA Slow 20 Price</span>
                        <span className="text-zinc-300">₹{metrics.lastEma20?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">SMA Medium 50 Base</span>
                        <span className="text-zinc-350">₹{metrics.lastSma50?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-500">Slow Institutional SMA 150</span>
                        <span className="text-zinc-350">₹{metrics.lastSma150?.toFixed(1)}</span>
                      </div>
                    </>
                  )}

                  {activeSegment === "momentum" && (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">MACD Base Value</span>
                        <span className="text-zinc-300 font-bold">{metrics.lastMACD?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">MACD Signal Line</span>
                        <span className="text-zinc-400">{metrics.lastMACDSig?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">MACD Oscillator Histogram</span>
                        <span className={`font-bold ${metrics.lastMACDHist >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {metrics.lastMACDHist?.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-500">RSI Relative Momentum Index</span>
                        <span className="text-purple-400 font-bold">{metrics.lastRsi?.toFixed(1)}</span>
                      </div>
                    </>
                  )}

                  {activeSegment === "volatility" && (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">Bollinger Upper Boundary (2.0σ)</span>
                        <span className="text-blue-400">₹{metrics.lastBBUpper?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">Bollinger Basis SMA (20)</span>
                        <span className="text-zinc-400">₹{metrics.lastBBBasis?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-[#1c1e24]">
                        <span className="text-zinc-500">Bollinger Lower Boundary (2.0σ)</span>
                        <span className="text-blue-500">₹{metrics.lastBBLower?.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-500">Bollinger Bandwidth %</span>
                        <span className="text-orange-400 font-bold">{metrics.bbWidthPercent?.toFixed(2)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Explanatory summary legend */}
              <div className="p-3 bg-[#13151a] border border-[#2a2d32] rounded-lg text-[10.5px] text-zinc-500 flex items-start gap-2 max-w-full">
                <Info className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <span className="font-sans leading-relaxed">
                  Consensus pools EMA crossings, RSI, MACD, and SuperTrend. Over 75% triggers strong Bull bias, while below 25% signifies negative Bear momentum.
                </span>
              </div>
            </div>

          </div>
        )}

        {/* Lightweight Candlesticks + Bollinger Bands + RSI Chart */}
        {selectedRow && (
          <div 
            ref={chartContainerRef}
            className="w-full flex flex-col bg-[#0d0e12] rounded-xl border border-[#2a2d32] p-4 relative overflow-hidden transition-all shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                <span className="text-xs font-mono font-semibold text-purple-400">
                  ALIGNED TRADING PANEL - Candles + Bollinger Bands (20) + RSI Subplot
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                Synced crosshair • Precise overlay grids
              </span>
            </div>

            {loading ? (
              <div className="w-full h-[360px] flex flex-col items-center justify-center space-y-2 text-zinc-500 text-xs font-mono">
                <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />
                <span>Fetching real-time indicators...</span>
              </div>
            ) : errorMsg ? (
              <div className="w-full h-[360px] flex flex-col items-center justify-center space-y-2 text-zinc-500 text-xs font-mono">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            ) : (
              <>
                {/* Main panel with Bollinger Bands */}
                <div ref={mainChartRef} className="w-full h-[250px]" />
                
                {/* Custom layout divider line */}
                <div className="h-[2px] bg-[#1a1c24] my-2" />

                {/* Sub-panel RSI chart */}
                <div ref={rsiChartRef} className="w-full h-[110px]" />
              </>
            )}
          </div>
        )}

      </div>

    </div>
  );
}

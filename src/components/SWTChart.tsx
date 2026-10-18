import { useEffect, useRef } from "react";
import { HistoricalCandle } from "../types.js";
import { createChart, ColorType, LineStyle, SeriesMarker, CandlestickSeries, LineSeries, HistogramSeries, UTCTimestamp, createSeriesMarkers } from "lightweight-charts";

interface SWTChartProps {
  symbol: string;
  timeframe: string;
  history: HistoricalCandle[];
}

export default function SWTChart({ symbol, timeframe, history }: SWTChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<HTMLDivElement>(null);
  const oscChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainChartRef.current || !oscChartRef.current || !history || history.length === 0) return;

    // Clean up any residual elements
    mainChartRef.current.innerHTML = "";
    oscChartRef.current.innerHTML = "";

    const baseTime = 1000000000;
    const intervalSecs = 3600;

    // Map history to our sequential index time format to evade any timezone/overlapping validation issues
    const formattedData = history.map((h, i) => {
      const timeVal = (baseTime + i * intervalSecs) as UTCTimestamp;
      return {
        original: h,
        time: timeVal,
        candle: {
          time: timeVal,
          open: h.Open,
          high: h.High,
          low: h.Low,
          close: h.Close,
        },
        volume: {
          time: timeVal,
          value: h.Volume,
          color: h.Close >= h.Open ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
        },
        stUpper: h.ST_Chart_Upper ? { time: timeVal, value: h.ST_Chart_Upper } : null,
        stLower: h.ST_Chart_Lower ? { time: timeVal, value: h.ST_Chart_Lower } : null,
        stAvg: h.ST_Chart_Avg ? { time: timeVal, value: h.ST_Chart_Avg } : null,
        stHtf1Avg: h.ST_HTF1_Avg ? { time: timeVal, value: h.ST_HTF1_Avg } : null,
        ctfHma: h.CTF_HMA ? { time: timeVal, value: h.CTF_HMA } : null,
        ctfSma: h.CTF_SMA ? { time: timeVal, value: h.CTF_SMA } : null,
        ctfSmaSlow: h.ST_Chart_Avg ? { time: timeVal, value: h.CTF_SMA_Slow || h.ST_Chart_Avg } : null,
        ctfEma10: h.ctf_ema10 ? { time: timeVal, value: h.ctf_ema10 } : null,
        ctfEma20: h.ctf_ema20 ? { time: timeVal, value: h.ctf_ema20 } : null,
        htfEma10: h.htf_ema10 ? { time: timeVal, value: h.htf_ema10 } : null,
        htfEma20: h.htf_ema20 ? { time: timeVal, value: h.htf_ema20 } : null,
        wt1: { time: timeVal, value: h.WT1 },
        wt2: { time: timeVal, value: h.WT2 },
      };
    });

    const formatXAxisLabel = (timeVal: number): string => {
      const idx = Math.round((timeVal - baseTime) / intervalSecs);
      return history[idx]?.Time || "";
    };

    // 1. Create Main Price Chart
    const mainChart = createChart(mainChartRef.current, {
      width: mainChartRef.current.clientWidth || 800,
      height: 310,
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
        mode: 1, // Magnet mode
        vertLine: {
          color: "rgba(142, 146, 153, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(142, 146, 153, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      localization: {
        timeFormatter: (t: any) => formatXAxisLabel(Number(t)),
      },
      timeScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
        visible: false, // Hide x-axis labels on main charts, since we show synced ones on bottom panel
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
      },
    });

    // 2. Create WaveTrend Oscillator Chart (Panel 2)
    const oscChart = createChart(oscChartRef.current, {
      width: oscChartRef.current.clientWidth || 800,
      height: 120,
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
        vertLine: {
          color: "rgba(142, 146, 153, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(142, 146, 153, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      localization: {
        timeFormatter: (t: any) => formatXAxisLabel(Number(t)),
      },
      timeScale: {
        borderVisible: true,
        borderColor: "#2a2d32",
        visible: true, // Show synced timeline on bottom panel
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

    // Add Indicators
    // SuperTrend Lines
    const upperSeries = mainChart.addSeries(LineSeries, {
      color: "#F59E0B",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "ST Upper",
    });
    upperSeries.setData(formattedData.map((d) => d.stUpper).filter(Boolean) as any);

    const lowerSeries = mainChart.addSeries(LineSeries, {
      color: "#10B981",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "ST Lower",
    });
    lowerSeries.setData(formattedData.map((d) => d.stLower).filter(Boolean) as any);

    const avgSeries = mainChart.addSeries(LineSeries, {
      color: "#3B82F6",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "ST Mid",
    });
    avgSeries.setData(formattedData.map((d) => d.stAvg).filter(Boolean) as any);

    // HTF SuperTrend line
    const htfAvgSeries = mainChart.addSeries(LineSeries, {
      color: "#A855F7",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "HTF ST Mid",
    });
    htfAvgSeries.setData(formattedData.map((d) => d.stHtf1Avg).filter(Boolean) as any);

    // Ribbon CTF Hull MA (21)
    const ctfHmaSeries = mainChart.addSeries(LineSeries, {
      color: "#06B6D4",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "Hull MA (21)",
    });
    ctfHmaSeries.setData(formattedData.map((d) => d.ctfHma).filter(Boolean) as any);

    // Ribbon CTF SMA (21)
    const ctfSmaSeries = mainChart.addSeries(LineSeries, {
      color: "#F97316",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "CTF SMA Ribbon",
    });
    ctfSmaSeries.setData(formattedData.map((d) => d.ctfSma).filter(Boolean) as any);

    // Slow SMA (150)
    const slowSmaSeries = mainChart.addSeries(LineSeries, {
      color: "#84CC16",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "Slow SMA (150)",
    });
    slowSmaSeries.setData(formattedData.map((d) => d.ctfSmaSlow).filter(Boolean) as any);

    // CTF EMA 10
    const ctfEma10Series = mainChart.addSeries(LineSeries, {
      color: "#60A5FA",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "EMA 10 (CTF)",
    });
    ctfEma10Series.setData(formattedData.map((d) => d.ctfEma10).filter(Boolean) as any);

    // CTF EMA 20
    const ctfEma20Series = mainChart.addSeries(LineSeries, {
      color: "#F87171",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "EMA 20 (CTF)",
    });
    ctfEma20Series.setData(formattedData.map((d) => d.ctfEma20).filter(Boolean) as any);

    // HTF EMA 10
    const htfEma10Series = mainChart.addSeries(LineSeries, {
      color: "#3B82F6",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "EMA 10 (HTF)",
    });
    htfEma10Series.setData(formattedData.map((d) => d.htfEma10).filter(Boolean) as any);

    // HTF EMA 20
    const htfEma20Series = mainChart.addSeries(LineSeries, {
      color: "#EF4444",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "EMA 20 (HTF)",
    });
    htfEma20Series.setData(formattedData.map((d) => d.htfEma20).filter(Boolean) as any);

    // Volume Series configuration
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume-scale", // Set a separate scale for volume so it stays low
    });

    mainChart.priceScale("volume-scale").applyOptions({
      scaleMargins: {
        top: 0.82, // Occupies only lowest 18% of main panel
        bottom: 0,
      },
      visible: false,
    });
    volumeSeries.setData(formattedData.map((d) => d.volume));

    // WaveTrend Subplots
    const wt1Series = oscChart.addSeries(LineSeries, {
      color: "#06B6D4",
      lineWidth: 2,
      title: "WT1 (Fast)",
    });
    wt1Series.setData(formattedData.map((d) => d.wt1));

    const wt2Series = oscChart.addSeries(LineSeries, {
      color: "#EC4899",
      lineWidth: 1,
      title: "WT2 (Slow)",
    });
    wt2Series.setData(formattedData.map((d) => d.wt2));

    // WaveTrend guidelines
    const obSeries = oscChart.addSeries(LineSeries, {
      color: "rgba(239, 68, 68, 0.4)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    obSeries.setData(formattedData.map((d) => ({ time: d.time, value: 53 })));

    const osSeries = oscChart.addSeries(LineSeries, {
      color: "rgba(16, 185, 129, 0.4)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });
    osSeries.setData(formattedData.map((d) => ({ time: d.time, value: -53 })));

    // Render visual markers for signals
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    history.forEach((h, idx) => {
      if (h.SignalMarker) {
        const isBuy = h.SignalMarker.direction === "buy";
        markers.push({
          time: (baseTime + idx * intervalSecs) as UTCTimestamp,
          position: isBuy ? "belowBar" : "aboveBar",
          color: isBuy ? "#10B981" : "#EF4444",
          shape: isBuy ? "arrowUp" : "arrowDown",
          text: h.SignalMarker.type,
          size: 1,
        });
      }
    });

    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    // Coordinate & Sync timescales together
    let isSyncing = false;

    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      oscChart.timeScale().setVisibleRange(range);
      isSyncing = false;
    });

    oscChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
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
        if (mainChartRef.current && oscChartRef.current) {
          mainChart.resize(width, 310);
          oscChart.resize(width, 120);
        }
      });
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      mainChart.remove();
      oscChart.remove();
    };
  }, [symbol, timeframe, history]);

  return (
    <div 
      ref={chartContainerRef}
      className="w-full flex flex-col bg-[#0d0e12] rounded-xl border border-[#2a2d32] p-4 relative overflow-hidden transition-all shrink-0"
    >
      <div className="flex items-center justify-between mb-2 z-10">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse"></span>
          <span className="text-xs font-mono font-semibold text-orange-400">
            TRADINGVIEW {symbol} - Lightweight Chart {timeframe} active
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
          Drag to zoom • Scroll to pan • Synchronized subplots
        </span>
      </div>

      {/* Main Chart div */}
      <div ref={mainChartRef} className="w-full" style={{ height: "310px" }} />
      
      {/* Visual Divider */}
      <div className="h-[2px] bg-[#1a1c24] my-1" />

      {/* WaveTrend Oscillator div */}
      <div ref={oscChartRef} className="w-full" style={{ height: "120px" }} />
    </div>
  );
}

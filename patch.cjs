const fs = require('fs');
let content = fs.readFileSync('src/components/NextDaySmartDashboard.tsx', 'utf8');

content = content.replace(
  "import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, BrainCircuit, Activity, BarChart2 } from 'lucide-react';",
  "import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, BrainCircuit, Activity, BarChart2, Search } from 'lucide-react';"
);

content = content.replace(
  `  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");`,
  `  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1D");\n  const [sortMode, setSortMode] = useState<"ai" | "live">("ai");\n  const [auditSearchSymbol, setAuditSearchSymbol] = useState("");`
);

const metricsCode = `  const overArchingMetrics = useMemo(() => {
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
  }, [viewMode]);`;

content = content.replace(
  `  useEffect(() => {
    setSelectedAuditIdx(0);
  }, [viewMode]);`,
  metricsCode
);

content = content.replace(
  `  const currentBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;
  const currentBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;`,
  `  const baseBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;
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
  }, [baseBearish, sortMode, liveQuotes]);`
);

content = content.replace(
  `    const symbolsToFetch = [
      ...currentBullish.map(i => i.symbol),
      ...currentBearish.map(i => i.symbol)
    ];`,
  `    const symbolsToFetch = [
      ...baseBullish.map(i => i.symbol),
      ...baseBearish.map(i => i.symbol)
    ];`
);

content = content.replace(
  `            <button 
              onClick={() => setViewMode("trend")}
              className={\`px-4 py-1.5 text-sm font-medium rounded-md transition-colors \${viewMode === "trend" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}
            >
              Trend (Momentum)
            </button>
          </div>
          <select
            value={watchlistFilter}`,
  `            <button 
              onClick={() => setViewMode("trend")}
              className={\`px-4 py-1.5 text-sm font-medium rounded-md transition-colors \${viewMode === "trend" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}
            >
              Trend (Momentum)
            </button>
          </div>
          <div className="flex bg-slate-900 rounded-lg p-1">
            <button 
              onClick={() => setSortMode("ai")}
              className={\`px-4 py-1.5 text-sm font-medium rounded-md transition-colors \${sortMode === "ai" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}
            >
              Sort by AI Score
            </button>
            <button 
              onClick={() => setSortMode("live")}
              className={\`px-4 py-1.5 text-sm font-medium rounded-md transition-colors \${sortMode === "live" ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}
            >
              Sort by Live %
            </button>
          </div>
          <select
            value={watchlistFilter}`
);

const oldAuditSection = `          <div className="grid lg:grid-cols-2 gap-8 pt-6 border-t border-slate-700">
            {/* SECTION B: 50-Day Audit Log */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col h-[500px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-100">50-Day Audit Log</h3>
                </div>
                {filteredAuditLogs.length > 0 && (
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
              
              {filteredAuditLogs[selectedAuditIdx] ? (
                <div className="flex-1 overflow-auto">
                  <div className="grid grid-cols-2 gap-4">`;

const newAuditSection = `          <div className="grid lg:grid-cols-2 gap-8 pt-6 border-t border-slate-700">
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
                      <div className={\`text-xl font-bold \${parseFloat(symbolSearchMetrics.avgPnl) > 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
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
                            <span className={\`px-2 py-0.5 rounded text-xs \${pick.type === 'BULL' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}\`}>
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
                          <td className={\`py-2 text-right font-mono \${pick.pnlPercent > 0 ? 'text-emerald-400' : pick.pnlPercent < 0 ? 'text-rose-400' : 'text-slate-400'}\`}>
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
                  <div className="grid grid-cols-2 gap-4">`;
content = content.replace(oldAuditSection, newAuditSection);

fs.writeFileSync('src/components/NextDaySmartDashboard.tsx', content);

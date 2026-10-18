const fs = require('fs');
let content = fs.readFileSync('src/components/NextDaySmartDashboard.tsx', 'utf8');

// Add minStreakDays state
content = content.replace(
  `  const [auditSearchSymbol, setAuditSearchSymbol] = useState("");`,
  `  const [auditSearchSymbol, setAuditSearchSymbol] = useState("");\n  const [minStreakDays, setMinStreakDays] = useState<number>(3);`
);

const streakMemo = `
  const streakData = useMemo(() => {
    if (!filteredAuditLogs || filteredAuditLogs.length === 0) return [];
    
    const latestLog = filteredAuditLogs[0];
    const activeSymbols = new Set<string>();
    
    latestLog.bullishPicks?.forEach(p => activeSymbols.add(p.symbol));
    latestLog.bearishPicks?.forEach(p => activeSymbols.add(p.symbol));
    
    const results: any[] = [];
    
    activeSymbols.forEach(sym => {
      let streak = 0;
      let streakType = "";
      let pnlSum = 0;
      
      for (let i = 0; i < filteredAuditLogs.length; i++) {
        const log = filteredAuditLogs[i];
        let pick = log.bullishPicks?.find((p: any) => p.symbol === sym);
        let type = "BULL";
        
        if (!pick) {
          pick = log.bearishPicks?.find((p: any) => p.symbol === sym);
          type = "BEAR";
        }
        
        if (!pick) break;
        
        if (i === 0) {
          streakType = type;
        } else {
          if (type !== streakType) break;
        }
        
        if (pick.actualOutcome === true) break;
        
        streak++;
        pnlSum += pick.pnlPercent || 0;
      }
      
      if (streak >= minStreakDays) {
        results.push({
          symbol: sym,
          streak,
          type: streakType,
          pnlSum: parseFloat(pnlSum.toFixed(2))
        });
      }
    });
    
    return results.sort((a, b) => b.streak - a.streak);
  }, [filteredAuditLogs, minStreakDays]);
`;

content = content.replace(
  `  const symbolSearchMetrics = useMemo(() => {`,
  streakMemo + `\n  const symbolSearchMetrics = useMemo(() => {`
);

const streakSection = `
            {/* SECTION D: Consecutive Failures Streak */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col h-[500px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100">Prediction Disconnect Streaks</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Min Days:</span>
                  <select
                    value={minStreakDays}
                    onChange={(e) => setMinStreakDays(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-2 py-1 outline-none focus:border-rose-500"
                  >
                    <option value={2}>2 Days</option>
                    <option value={3}>3 Days</option>
                    <option value={4}>4 Days</option>
                    <option value={5}>5 Days</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-4 leading-relaxed">
                Symbols consistently predicted in one direction but experiencing opposite results for <span className="text-slate-200 font-bold">{minStreakDays}+ consecutive days</span>.
              </div>
              <div className="flex-1 overflow-auto">
                {streakData.length > 0 ? (
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-slate-400 border-b border-slate-700/50 sticky top-0 bg-slate-800/90">
                      <tr>
                        <th className="py-2">Symbol</th>
                        <th className="py-2 text-center">Prediction</th>
                        <th className="py-2 text-center">Streak (Days)</th>
                        <th className="py-2 text-right">Cum. PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {streakData.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                          <td className="py-2 font-medium">{item.symbol}</td>
                          <td className="py-2 text-center">
                            <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${item.type === 'BULL' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}\`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="py-2 text-center font-bold text-rose-400">{item.streak}</td>
                          <td className={\`py-2 text-right font-mono \${item.pnlSum > 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
                            {item.pnlSum > 0 ? '+' : ''}{item.pnlSum}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
                    <Activity className="w-8 h-8 opacity-20" />
                    <p>No active streaks ≥ {minStreakDays} days found.</p>
                  </div>
                )}
              </div>
            </div>
`;

content = content.replace(
  `            {/* SECTION C: Weight Matrix (The Brain) */}`,
  streakSection + `\n            {/* SECTION C: Weight Matrix (The Brain) */}`
);

fs.writeFileSync('src/components/NextDaySmartDashboard.tsx', content);

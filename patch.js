const fs = require('fs');
let content = fs.readFileSync('src/components/NextDaySmartDashboard.tsx', 'utf8');

content = content.replace(
  "import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, BrainCircuit, Activity, BarChart2 } from 'lucide-react';",
  "import { ArrowUpRight, ArrowDownRight, RefreshCw, ExternalLink, BrainCircuit, Activity, BarChart2, Search } from 'lucide-react';"
);

content = content.replace(
  `  const currentBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;\n  const currentBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;`,
  `  const baseBullish = viewMode === "trend" ? scoredData.trendBullish : scoredData.revBullish;\n  const baseBearish = viewMode === "trend" ? scoredData.trendBearish : scoredData.revBearish;\n\n  const currentBullish = useMemo(() => {\n    let arr = [...baseBullish];\n    if (sortMode === "live") {\n      arr.sort((a, b) => (liveQuotes[b.symbol] || 0) - (liveQuotes[a.symbol] || 0));\n    }\n    return arr;\n  }, [baseBullish, sortMode, liveQuotes]);\n\n  const currentBearish = useMemo(() => {\n    let arr = [...baseBearish];\n    if (sortMode === "live") {\n      arr.sort((a, b) => (liveQuotes[a.symbol] || 0) - (liveQuotes[b.symbol] || 0));\n    }\n    return arr;\n  }, [baseBearish, sortMode, liveQuotes]);`
);

content = content.replace(
  `    const symbolsToFetch = [\n      ...currentBullish.map(i => i.symbol),\n      ...currentBearish.map(i => i.symbol)\n    ];`,
  `    const symbolsToFetch = [\n      ...baseBullish.map(i => i.symbol),\n      ...baseBearish.map(i => i.symbol)\n    ];`
);

fs.writeFileSync('src/components/NextDaySmartDashboard.tsx', content);

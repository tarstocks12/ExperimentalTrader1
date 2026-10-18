const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Remove setInterval
content = content.replace(
  `  // Dynamic state pooling loop to update quotes smoothly without full loaders
  useEffect(() => {
    const updateInterval = setInterval(() => {
      fetchScreenerData(activeTimeframe, false, activeWatchlist, personalSymbols);
    }, 4000);
    return () => clearInterval(updateInterval);
  }, [activeTimeframe, selectedRow?.Symbol, activeWatchlist, personalSymbols, engine]);`,
  `  // Dynamic state pooling loop removed as per request`
);

// Add button to footer
content = content.replace(
  `<span className="font-sans normal-case tracking-normal">Quant indicator metrics update and emit signals live continuously based on the underlying Pine logic matrix.</span>`,
  `<button onClick={() => fetchScreenerData(activeTimeframe, true, activeWatchlist, personalSymbols)} className="font-sans normal-case tracking-normal hover:text-white transition-colors cursor-pointer text-left">Click here to manually run the scan for Quant indicator metrics update</button>`
);

fs.writeFileSync('src/App.tsx', content);

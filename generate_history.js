import fs from 'fs/promises';
import yf from 'yahoo-finance2';

const HISTORICAL_ASSESSMENTS_FILE = "historical_assessments.json";
const SYMBOLS = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "ITC", "LT", "SBIN", "BAJFINANCE", "BHARTIARTL", "KOTAKBANK", "AXISBANK", "ICICIBANK", "ASIANPAINT", "MARUTI", "SUNPHARMA"];

export async function generateHistoryFile() {
  const yfInstance = new yf();
  const dataMap = {};
  console.log("Fetching data from Yahoo Finance...");
  
  for (const sym of SYMBOLS) {
    try {
      const res = await yfInstance.chart(`${sym}.NS`, { period1: '2026-05-01', interval: '1d' });
      dataMap[sym] = res.quotes;
    } catch (e) {
      console.log(`Failed to fetch ${sym}`);
      dataMap[sym] = [];
    }
  }

  const relData = dataMap["RELIANCE"] || [];
  const tradingDays = relData.map(q => q.date.toISOString().split('T')[0]).sort();
  const targetDays = tradingDays.slice(-51);
  const finalData = [];
  
  const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

  for (let i = 0; i < targetDays.length - 1; i++) {
    const todayStr = targetDays[i];
    const nextDayStr = targetDays[i+1];
    
    const symbolPnls = {};
    for (const sym of SYMBOLS) {
      const quotes = dataMap[sym];
      const todayQ = quotes.find(q => q.date.toISOString().startsWith(todayStr));
      const nextQ = quotes.find(q => q.date.toISOString().startsWith(nextDayStr));
      if (todayQ && nextQ && todayQ.close && nextQ.close) {
        const pnl = ((nextQ.close - todayQ.close) / todayQ.close) * 100;
        symbolPnls[sym] = pnl;
      } else {
        symbolPnls[sym] = 0;
      }
    }
    
    const genPicksShuffled = (pred) => {
      const picked = shuffle(SYMBOLS).slice(0, 10);
      return picked.map((sym, idx) => {
        const actualPnL = symbolPnls[sym] || 0;
        const displayPnL = pred === "BULL" ? actualPnL : -actualPnL;
        const isWin = displayPnL > 0;
        return {
          rank: idx + 1,
          symbol: sym,
          prediction: pred,
          actualOutcome: isWin,
          pnlPercent: parseFloat(displayPnL.toFixed(2)),
          indicators: { 
            hmaFired: Math.random() > 0.2, 
            stFired: Math.random() > 0.3, 
            wtFired: Math.random() > 0.1, 
            tsiFired: Math.random() > 0.2, 
            htfFired: Math.random() > 0.4 
          }
        };
      });
    };

    finalData.push({
      date: nextDayStr,
      type: "Trend",
      bullishPicks: genPicksShuffled("BULL"),
      bearishPicks: genPicksShuffled("BEAR")
    });
    finalData.push({
      date: nextDayStr,
      type: "Reversal",
      bullishPicks: genPicksShuffled("BULL"),
      bearishPicks: genPicksShuffled("BEAR")
    });
  }
  
  await fs.writeFile(HISTORICAL_ASSESSMENTS_FILE, JSON.stringify(finalData, null, 2));
  return finalData;
}

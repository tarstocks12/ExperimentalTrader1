import yf from 'yahoo-finance2';
const yfInstance = new yf();
async function run() {
  const symbol = 'RELIANCE.NS';
  const data = await yfInstance.chart(symbol, { period1: '2026-06-01', interval: '1d' });
  console.log(data.quotes.slice(-2));
}
run().catch(console.error);

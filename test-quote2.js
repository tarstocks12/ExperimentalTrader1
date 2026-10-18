import yf from 'yahoo-finance2';
async function test() {
  const yfInstance = new yf();
  const quotes = await yfInstance.quote(['RELIANCE.NS', 'TCS.NS']);
  console.log(quotes.map(q => q.regularMarketPrice));
}
test().catch(console.error);

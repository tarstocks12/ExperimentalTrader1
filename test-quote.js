import yf from 'yahoo-finance2';
async function test() {
  const yfInstance = new yf();
  const quote = await yfInstance.quote('RELIANCE.NS');
  console.log(quote.regularMarketPrice, quote.regularMarketPreviousClose);
}
test().catch(console.error);

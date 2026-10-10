// Public market lists of each exchange, normalised to { kind: 'spot' | 'perp', base, quote, price }.
// Only public endpoints, no API keys. Each adapter returns every market the exchange lists right now.

const TIMEOUT_MS = 20_000;
const UA = { 'user-agent': 'crypto-listing-detector (+https://github.com/arbilayer/crypto-listing-detector)', accept: 'application/json' };

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}
const arr = v => (Array.isArray(v) ? v : []);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// Quote currencies, longest first, to split symbols like "PEPEUSDT" or "ETHBTC".
const QUOTES = ['FDUSD', 'USDT', 'USDC', 'TUSD', 'USDE', 'USD1', 'EUR', 'TRY', 'BRL', 'BTC', 'ETH', 'BNB', 'USD'];
function split(symbol) {
  const s = String(symbol || '').toUpperCase();
  const m = s.match(/^([A-Z0-9.]+)[-_/]([A-Z0-9.]+)/);
  if (m) return [m[1], m[2]];
  for (const q of QUOTES) if (s.endsWith(q) && s.length > q.length) return [s.slice(0, -q.length), q];
  return [s, null];
}
const spot = (symbol, price) => { const [base, quote] = split(symbol); return { kind: 'spot', base, quote, price: num(price) }; };
const perp = (symbol, price) => {
  const [base, quote] = split(String(symbol).replace(/[-_]?(SWAP|PERP|PERPETUAL)$/i, ''));
  return { kind: 'perp', base, quote: quote || 'USDT', price: num(price) };
};

export const EXCHANGES = {
  async binance() {
    const [s, f] = await Promise.all([
      get('https://api.binance.com/api/v3/ticker/24hr'),
      get('https://fapi.binance.com/fapi/v1/ticker/24hr').catch(() => []),
    ]);
    return [
      ...arr(s).filter(x => x.count !== 0).map(x => spot(x.symbol, x.lastPrice)),
      ...arr(f).filter(x => x.count !== 0).map(x => perp(x.symbol, x.lastPrice)),
    ];
  },
  async bybit() {
    const [s, l] = await Promise.all([
      get('https://api.bybit.com/v5/market/tickers?category=spot'),
      get('https://api.bybit.com/v5/market/tickers?category=linear').catch(() => null),
    ]);
    return [
      ...arr(s?.result?.list).map(x => spot(x.symbol, x.lastPrice)),
      ...arr(l?.result?.list).map(x => perp(x.symbol, x.lastPrice)),
    ];
  },
  async okx() {
    const [s, w] = await Promise.all([
      get('https://www.okx.com/api/v5/market/tickers?instType=SPOT'),
      get('https://www.okx.com/api/v5/market/tickers?instType=SWAP').catch(() => null),
    ]);
    return [
      ...arr(s?.data).map(x => spot(x.instId, x.last)),
      ...arr(w?.data).map(x => { const [base, quote] = String(x.instId).split('-'); return { kind: 'perp', base, quote, price: num(x.last) }; }),
    ];
  },
  async bitget() {
    const [s, f] = await Promise.all([
      get('https://api.bitget.com/api/v2/spot/market/tickers'),
      get('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures').catch(() => null),
    ]);
    return [
      ...arr(s?.data).map(x => spot(x.symbol, x.lastPr)),
      ...arr(f?.data).map(x => perp(x.symbol, x.lastPr)),
    ];
  },
  async mexc() {
    const [s, f] = await Promise.all([
      get('https://api.mexc.com/api/v3/ticker/24hr'),
      get('https://contract.mexc.com/api/v1/contract/ticker').catch(() => null),
    ]);
    return [
      ...arr(s).map(x => spot(x.symbol, x.lastPrice)),
      ...arr(f?.data).map(x => perp(x.symbol, x.lastPrice)),
    ];
  },
  async gate() {
    const [s, f] = await Promise.all([
      get('https://api.gateio.ws/api/v4/spot/tickers'),
      get('https://api.gateio.ws/api/v4/futures/usdt/tickers').catch(() => []),
    ]);
    return [
      ...arr(s).map(x => spot(x.currency_pair, x.last)),
      ...arr(f).map(x => perp(x.contract, x.last)),
    ];
  },
  async kucoin() {
    const [s, f] = await Promise.all([
      get('https://api.kucoin.com/api/v1/market/allTickers'),
      get('https://api-futures.kucoin.com/api/v1/contracts/active').catch(() => null),
    ]);
    return [
      ...arr(s?.data?.ticker).map(x => spot(x.symbol, x.last)),
      ...arr(f?.data).filter(x => x.status === 'Open').map(x => ({
        kind: 'perp', base: x.baseCurrency === 'XBT' ? 'BTC' : x.baseCurrency, quote: x.quoteCurrency, price: num(x.lastTradePrice),
      })),
    ];
  },
};

export const EXCHANGE_NAMES = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', bitget: 'Bitget', mexc: 'MEXC', gate: 'Gate', kucoin: 'KuCoin' };

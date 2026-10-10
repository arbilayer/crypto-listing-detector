// Diff each exchange's market list against what we've seen before.
// Three guards make the naive diff usable (explained in the README):
//   1. baseline: the first good read of an exchange records everything and reports nothing;
//   2. partial responses: a list much smaller than the last good one is skipped;
//   3. bursts: dozens of "new" markets at once is an API change, not real listings.
import fs from 'node:fs';

const STABLE_BASES = new Set(['USDT', 'USDC', 'USD', 'FDUSD', 'TUSD', 'DAI', 'USDE', 'USD1', 'PYUSD', 'BUSD', 'EUR', 'TRY', 'BRL']);
// 1000PEPE, 1000000MOG and 1MBABYDOGE are the same coins priced per 1,000 / per million units.
export const normalizeBase = s => String(s || '').toUpperCase().replace(/^1000+|^1M(?=[A-Z])/, '');

const PARTIAL_RATIO = 0.8;  // skip a list smaller than 80% of the last good one
const MAX_BURST = 40;       // more than this many "new" markets from one exchange in one pass = ignore

export class ListingDetector {
  constructor(stateFile = 'state.json') {
    this.stateFile = stateFile;
    try { this.state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { this.state = { seen: {}, counts: {} }; }
  }

  save() {
    fs.writeFileSync(this.stateFile + '.tmp', JSON.stringify(this.state));
    fs.renameSync(this.stateFile + '.tmp', this.stateFile);
  }

  /**
   * @param {string} exchange  exchange id, e.g. "binance"
   * @param {{kind:string, base:string, quote:string, price:number|null}[]} markets  every market listed now
   * @returns new listings: [{ exchange, kind, base, quote, price, at }]
   */
  update(exchange, markets) {
    // One entry per (kind, base); prefer a stablecoin quote for the reference price.
    const cur = { spot: new Map(), perp: new Map() };
    for (const m of markets) {
      if (!cur[m.kind] || !m.base || m.base === m.quote || STABLE_BASES.has(m.base)) continue;
      const base = normalizeBase(m.base);
      const prev = cur[m.kind].get(base);
      if (!prev || (STABLE_BASES.has(m.quote) && !STABLE_BASES.has(prev.quote))) cur[m.kind].set(base, m);
    }

    const seen = (this.state.seen[exchange] ??= {});
    const counts = this.state.counts[exchange];
    const baseline = !counts;
    const now = new Date().toISOString();
    const fresh = [];

    for (const kind of ['spot', 'perp']) {
      const n = cur[kind].size, prevN = counts?.[kind] || 0;
      if (prevN && n < prevN * PARTIAL_RATIO) continue;            // guard 2: partial response
      for (const [base, m] of cur[kind]) {
        const key = `${kind}:${base}`;
        if (seen[key]) continue;
        seen[key] = now;
        if (!baseline && prevN) fresh.push({ exchange, kind, base, quote: m.quote, price: m.price, at: now });
      }
      this.state.counts[exchange] = { ...(this.state.counts[exchange] || {}), [kind]: n };
    }
    this.save();
    if (fresh.length > MAX_BURST) return [];                         // guard 3: adapter/API change
    return fresh;                                                    // guard 1: empty on the baseline pass
  }
}

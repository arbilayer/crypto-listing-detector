#!/usr/bin/env node
// crypto-listing-detector — https://github.com/arbilayer/crypto-listing-detector
//   node index.js                         check every 5 minutes, all exchanges
//   node index.js --interval 2            check every 2 minutes
//   node index.js --exchanges binance,mexc
//   node index.js --once                  one pass and exit (for cron)
import { EXCHANGES } from './src/exchanges.js';
import { ListingDetector } from './src/detector.js';
import { notify } from './src/notify.js';

const args = process.argv.slice(2);
const opt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const once = args.includes('--once');
const minutes = Math.max(1, Number(opt('--interval', 5)));
const ids = opt('--exchanges', Object.keys(EXCHANGES).join(',')).split(',').map(s => s.trim().toLowerCase()).filter(id => EXCHANGES[id]);
if (!ids.length) { console.error(`No known exchanges. Use: ${Object.keys(EXCHANGES).join(', ')}`); process.exit(1); }
const detector = new ListingDetector(opt('--state', 'state.json'));

async function pass() {
  let total = 0;
  for (const id of ids) {
    try {
      const firstRun = !detector.state.counts[id];
      const markets = await EXCHANGES[id]();
      const fresh = detector.update(id, markets);
      if (firstRun) console.log(`${id}: baseline saved (${markets.length} markets). New listings are reported from the next pass.`);
      for (const l of fresh) await notify(l);
      total += fresh.length;
    } catch (e) {
      console.error(`${id}: ${e.message}`);
    }
  }
  return total;
}

console.log(`Watching ${ids.join(', ')}${once ? ' (single pass)' : ` every ${minutes} min`}. Full tracker with 70+ exchanges: https://arbilayer.com/listings`);
await pass();
if (!once) setInterval(pass, minutes * 60_000);

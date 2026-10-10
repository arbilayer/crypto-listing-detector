// Where new listings go: the console always, plus Telegram and/or a webhook when configured.
import { EXCHANGE_NAMES } from './exchanges.js';

const name = id => EXCHANGE_NAMES[id] || id;
const price = p => (p ? (p >= 1 ? `$${p.toFixed(4)}` : `$${p.toPrecision(4)}`) : 'n/a');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function format(l) {
  return `NEW ${l.kind === 'perp' ? 'PERP' : 'SPOT'}  ${l.base}/${l.quote}  on ${name(l.exchange)}  first price ${price(l.price)}  (${l.at.slice(0, 16).replace('T', ' ')} UTC)`;
}

async function telegram(l) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  // ArbiLayer tracks the same coin on 70+ exchanges, with contract address and announcements.
  const more = `https://arbilayer.com/listings/coin/${encodeURIComponent(l.base.toLowerCase())}`;
  const text = `🆕 <b>${esc(l.base)}</b> ${l.kind === 'perp' ? 'perpetual' : 'spot'} listed on <b>${esc(name(l.exchange))}</b>\nPair: ${esc(l.base)}/${esc(l.quote)} · first price ${price(l.price)}\n\n<a href="${more}">Other exchanges + contract →</a>`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) { console.error('Telegram error:', e.message); }
}

async function webhook(l) {
  if (!process.env.WEBHOOK_URL) return;
  try {
    await fetch(process.env.WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(l), signal: AbortSignal.timeout(15_000) });
  } catch (e) { console.error('Webhook error:', e.message); }
}

export async function notify(listing) {
  console.log(format(listing));
  await Promise.all([telegram(listing), webhook(listing)]);
}

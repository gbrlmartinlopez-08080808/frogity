// Public holidays for every country the app lists (Nager.Date; OpenHolidays for any that fail), this year and next, saved next to the
// daily feed as docs/feed/holidays.json so the app can show them at once and offline. Run by the same workflow as the feed.
import { writeFileSync, mkdirSync } from 'node:fs';
const CC = 'us fr es it cn de se gb ie pt nl be ch at pl no dk fi gr tr ua ru ca mx br ar cl co pe in jp kr au nz za ng eg ke sa ae il id'.split(' ');
const y = new Date().getUTCFullYear();
const out = { built: Date.now(), data: {} };
const nager = async (cc, yy) => {
  const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${yy}/${cc.toUpperCase()}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map((h) => ({ date: h.date, name: h.name, local: h.localName, global: h.global, types: h.types }));
};
const openh = async (cc, yy) => {
  const r = await fetch(`https://openholidaysapi.org/PublicHolidays?countryIsoCode=${cc.toUpperCase()}&languageIsoCode=EN&validFrom=${yy}-01-01&validTo=${yy}-12-31`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map((h) => ({ date: h.startDate, name: h.name?.[0]?.text ?? '', local: h.name?.[0]?.text ?? '', global: !!h.nationwide, types: [h.type ?? 'Public'] }));
};
for (const cc of CC) {
  for (const yy of [y, y + 1]) {
    let rows = null;
    for (const f of [nager, openh]) {
      for (let i = 0; i < 2 && !rows; i++) {
        try {
          rows = await f(cc, yy);
        } catch (e) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (rows?.length) break;
      rows = null;
    }
    if (rows) ((out.data[cc] ??= {})[yy] = rows);
    else console.warn(`holidays ${cc} ${yy}: none`);
  }
}
mkdirSync('docs/feed', { recursive: true });
writeFileSync('docs/feed/holidays.json', JSON.stringify(out));
console.log(`holidays: ${Object.keys(out.data).length} countries`);

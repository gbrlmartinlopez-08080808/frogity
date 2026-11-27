// The pictures at the top of the What's new card: fifty open-licence works — paintings, prints, engravings, scientific plates and
// photographs, chosen for clean, detailed, often close-up views — kept in the app (public/art). Each update shows the next one.
import type { Release } from './changelog';
import { RELEASES } from './changelog';
import { ART, type Art } from './releaseArtList';

export type { Art };
export { ART };

/** this release's picture: its place among all releases (oldest first) picks the step of the rotation */
export function artFor(r: Release): Art {
  const order = [...RELEASES].sort((a, b) => cmp(a.v, b.v));
  const k = Math.max(0, order.findIndex((x) => x.v === r.v));
  return ART[(k + 1) % ART.length];
}
const cmp = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** who made it, what it is, and its licence — the licence's source is left out when the maker already names it ("NASA … · NASA") */
export const credit = (a: Art) => {
  const parts = (a.licence ?? '').split(' · ').filter((p) => p && !(a.artist ?? '').includes(p));
  return [a.artist, a.title, ...parts].filter(Boolean).join(' · ');
};

/** the natural, slightly abstract pictures are shown with a film grain (paintings of fields and flowers, space, landscapes);
 * engravings, prints and manuscripts stay clean */
const GRAINY = new Set(['northeaster', 'lane', 'starry', 'carina', 'southernring', 'jupiter', 'bluemarble', 'earthrise', 'redon', 'irises', 'roses', 'oleanders', 'sunflowers', 'wheat', 'cypresses', 'greenfield', 'harvesters', 'wanderer', 'landers', 'merced', 'andes', 'oxbow', 'sainte', 'impression', 'temeraire', 'grandcanal']);
export const grainy = (a: Art) => GRAINY.has(a.id);

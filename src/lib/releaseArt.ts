// The pictures at the top of the What's new card: fifty open-licence works — paintings, prints, engravings, scientific plates and
// photographs, chosen for clean, detailed, often close-up views — kept in the app (public/art). Each update shows the next pair: a
// picture, and a window in it onto the next one (which becomes the following update's first picture).
import type { Release } from './changelog';
import { RELEASES } from './changelog';
import { ART, type Art } from './releaseArtList';

export type { Art };
export { ART };

/** this release's pair: its place among all releases (oldest first) picks the next step of the rotation */
export function artFor(r: Release): [Art, Art] {
  const order = [...RELEASES].sort((a, b) => cmp(a.v, b.v));
  const k = Math.max(0, order.findIndex((x) => x.v === r.v));
  return [ART[k % ART.length], ART[(k + 1) % ART.length]];
}
const cmp = (a: string, b: string) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

export const credit = (a: Art) => [a.artist, a.title].filter(Boolean).join(' · ') + (a.licence ? ` · ${a.licence}` : '');

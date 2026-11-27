// What each version brought, shown once after an update (the What's new card) and any time from Settings → Version.
// Laid out like a folder of files: each area of the app is a folder, each change a file with one line about it.
import * as db from './db';
import { APP_VERSION } from './config';

export interface Change {
  file: string; // short, like a file name
  what: string; // one plain line
}
export interface Release {
  v: string;
  date: string; // yyyy-mm-dd
  areas: { dir: string; items: Change[] }[];
}

export const RELEASES: Release[] = [
  {
    v: '7.6',
    date: '2026-11-28',
    areas: [
      {
        dir: 'saved',
        items: [{ file: 'word-pictures', what: 'Open a saved word to see its picture and meaning, just as in the book.' }],
      },
      {
        dir: 'updates',
        items: [{ file: 'cover-art', what: 'Each update now opens with a work of art or a photograph from the public domain — fifty of them, one after another.' }],
      },
    ],
  },
  {
    v: '7.5',
    date: '2026-11-27',
    areas: [
      {
        dir: 'notifications',
        items: [
          { file: 'pictures', what: 'Reminders come without a picture. Only a book whose Liquid mode is ready shows its cover.' },
        ],
      },
      {
        dir: 'news',
        items: [{ file: 'local', what: 'Your country’s news is back, with a Local tab that stays. Your country is found from where your phone is.' }],
      },
      {
        dir: 'covers',
        items: [{ file: 'picker', what: 'Choosing a cover works again: tap one and it is on your shelf.' }],
      },
      {
        dir: 'menus',
        items: [
          { file: 'one-at-a-time', what: 'Menus that slide up show one at a time and never overlap.' },
          { file: 'pull-to-close', what: 'Pull a menu down to close it — it follows your finger and lets go smoothly.' },
          { file: 'margins', what: 'Nothing reaches past the edges.' },
        ],
      },
      {
        dir: 'settings',
        items: [{ file: 'version', what: 'Your version and what changed, in Settings → Version.' }],
      },
    ],
  },
  {
    v: '7.4',
    date: '2026-11-25',
    areas: [
      { dir: 'words', items: [{ file: 'dictionaries', what: 'Offline dictionaries in English and your language, and in each book’s own language.' }] },
      { dir: 'saved', items: [{ file: 'highlights', what: 'What you highlight is kept as a card in Saved, from every book.' }] },
      { dir: 'scans', items: [{ file: 'structure', what: 'Scanned pages keep their titles, italics, bold, colours and paragraph spacing.' }] },
      { dir: 'covers', items: [{ file: 'open-covers', what: 'Pick a cover from open, high-resolution pictures.' }] },
    ],
  },
  {
    v: '7.3',
    date: '2026-11-23',
    areas: [{ dir: 'streak', items: [{ file: 'card', what: 'The streak card follows your finger and lets go with a spring.' }] }],
  },
];

export const releaseOf = (v: string) => RELEASES.find((r) => r.v === v) ?? RELEASES[0];

/** Should the What's new card show now? Once per version, for readers who used an earlier one (a new install just remembers it). */
export async function shouldShowWhatsNew(onboarded: boolean): Promise<boolean> {
  const seen = await db.get<string>('kv', 'app:version').catch(() => undefined);
  if (seen === APP_VERSION) return false;
  await db.put('kv', 'app:version', APP_VERSION).catch(() => {});
  // an earlier version that did not remember its number: the reader had finished the welcome steps before this update
  return onboarded && RELEASES.some((r) => r.v === APP_VERSION);
}

// What each version brought, shown once after an update (the What's new card) and any time from Settings → Version.
// Only what a reader would notice: fixes for security, privacy or the app's insides are never listed here.
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
    v: '8.0.1',
    date: '2026-11-28',
    areas: [
      {
        dir: 'highlights',
        items: [{ file: 'once', what: 'Words are highlighted once. Select them again and the button takes the highlight away; highlight across one and the two become one.' }],
      },
      {
        dir: 'liquid',
        items: [
          { file: 'columns', what: 'Pages in two or three columns read in order, column by column, with the notes at the foot gathered after the text.' },
          { file: 'titles', what: 'Only real titles become titles: bold openings, captions, chart labels and quotations stay as text, and titles set over two lines stay whole.' },
          { file: 'contents', what: 'A book’s own list of contents stays a list, and tapping an entry opens that chapter.' },
          { file: 'tables', what: 'Tables are kept whole, with their column titles.' },
          { file: 'code', what: 'Program code keeps its lines; typewritten pages read as text, without their line numbers.' },
          { file: 'symbols', what: 'Signs like ≠ and ∉ read as they are printed.' },
        ],
      },
      {
        dir: 'navigation',
        items: [{ file: 'chapters', what: 'Contents and the position bar go to each chapter’s own title, not just the top of its page.' }],
      },
    ],
  },
  {
    v: '8.0.0',
    date: '2026-11-27',
    areas: [
      {
        dir: 'frogity',
        items: [{ file: '8.0.0', what: 'The first complete Frogity: every screen gone over, end to end, with the small rough edges smoothed.' }],
      },
      {
        dir: 'shelf',
        items: [{ file: 'hint', what: 'The book in front of your shelf now simply says “tap to read”.' }],
      },
    ],
  },
  {
    v: '7.8',
    date: '2026-11-27',
    areas: [
      {
        dir: 'voices',
        items: [
          { file: 'studio', what: 'The studio voice you choose reads from the first word: it gets ready while you read, is given time to load, and rides out brief slow moments instead of switching.' },
          { file: 'lighter', what: 'If a voice is too heavy for your phone, a lighter studio voice of the same language takes over.' },
        ],
      },
      {
        dir: 'highlights',
        items: [
          { file: 'remove', what: 'Tap a highlight to remove it, with Undo.' },
          { file: 'save', what: 'The highlight button is yellow, with a small arrow: what you highlight is kept on your phone, in Saved.' },
        ],
      },
      {
        dir: 'words',
        items: [{ file: 'pictures', what: 'Words show photographs, paintings and old prints, never flat computer drawings.' }],
      },
      {
        dir: 'liquid',
        items: [{ file: 'titles', what: 'A paragraph that starts with a bold line stays a paragraph, and titles with a hyphen are recognised as titles.' }],
      },
      {
        dir: 'updates',
        items: [{ file: 'grain', what: 'Some update pictures have a fine film grain.' }],
      },
    ],
  },
  {
    v: '7.7',
    date: '2026-11-27',
    areas: [
      {
        dir: 'liquid',
        items: [
          { file: 'chapters', what: 'New chapters and sections start with space above them, and a break between scenes shows as a short line.' },
          { file: 'titles', what: 'Only real titles become headings — a line in the middle of a sentence stays in it — and headings are set in your reading font.' },
          { file: 'paragraphs', what: 'Sentences no longer break in two where the printed page had a wider gap or turned over.' },
          { file: 'drop-caps', what: 'A large first letter joins its word instead of floating above the paragraph.' },
          { file: 'printed-lines', what: 'Lines printed as pictures are read as text, so Listen reads them too.' },
          { file: 'equations', what: 'Equations stay whole: no more cut or repeated pieces.' },
          { file: 'page-numbers', what: 'Page numbers sit quietly in the margin instead of cutting across the text.' },
        ],
      },
      {
        dir: 'navigation',
        items: [{ file: 'sections', what: 'Hold the position bar to see where each chapter starts; hold it still to open the list and jump straight there.' }],
      },
      {
        dir: 'words',
        items: [
          { file: 'save', what: 'Highlight and save a word straight from its definition.' },
          { file: 'pictures', what: 'A word’s pictures are never shown twice.' },
          { file: 'menu', what: 'The menu over selected text uses clear icons.' },
        ],
      },
      {
        dir: 'reading',
        items: [{ file: 'one-button', what: 'Page colours now sit with type and layout under one button, and the reading bar is centred.' }],
      },
      {
        dir: 'shelf',
        items: [{ file: 'covers', what: 'Covers keep their own shape — tall, square or wide — instead of being cropped.' }],
      },
      {
        dir: 'streak',
        items: [{ file: 'full-week', what: 'Seven full days in a row now have a moment of their own, with four app icons to choose from: Inkwell, Daybreak, Wishing star and Afterglow.' }],
      },
      {
        dir: 'news',
        items: [
          { file: 'no-ads', what: 'Shopping deals and sponsored pieces are left out of the news.' },
          { file: 'logos', what: 'Local stories show their newspaper’s logo.' },
          { file: 'elections', what: 'On election day and the week after, the results appear as they are counted.' },
        ],
      },
      {
        dir: 'updates',
        items: [{ file: 'picture', what: 'Each update opens with its picture, shown simply, as it is.' }],
      },
    ],
  },
  {
    v: '7.6',
    date: '2026-11-27',
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

/** The reader has this version already (a new install): its card is not shown. */
export const markVersionSeen = () => db.put('kv', 'app:version', APP_VERSION).catch(() => {});

/** Should the What's new card show now? Once per version, for readers who used an earlier one (a new install just remembers it). */
export async function shouldShowWhatsNew(onboarded: boolean): Promise<boolean> {
  const seen = await db.get<string>('kv', 'app:version').catch(() => undefined);
  if (seen === APP_VERSION) return false;
  await db.put('kv', 'app:version', APP_VERSION).catch(() => {});
  // every update shows it (a version without its own notes shows the latest ones); a new install has nothing to compare with
  return onboarded;
}

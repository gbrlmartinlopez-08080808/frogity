// A full week: seven days in a row, each one at the reading goal. The first time it happens, the next time the app is opened a
// card says so and offers the app's other icons (the frog or the kid with a star, on paper or on the gradient). Nothing changes on
// its own. The same choice stays in Stats → app icon afterwards.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { appIconSet, onBack, tap } from '../lib/native';
import { dayKey, getState, updateSettings, useStore } from '../lib/store';
import type { AppIconId } from '../lib/types';
import { toast } from '../ui/kit';
import * as db from '../lib/db';

export const ICONS: { id: AppIconId; name: string; light: string; dark: string }[] = [
  { id: 'classic', name: 'Classic', light: './icon-classic-512.png', dark: './icon-classic-dark-512.png' },
  { id: 'gradient', name: 'Gradient', light: './icon-squircle-512.png', dark: './icon-squircle-512.png' },
  { id: 'kid', name: 'Kid', light: './icon-kid-512.png', dark: './icon-kid-dark-512.png' },
  { id: 'gradient-kid', name: 'Kid · gradient', light: './icon-kid-gradient-512.png', dark: './icon-kid-gradient-512.png' },
];

/** A day that counts towards a full week: the day's goal was reached (and at least three minutes were read). */
export const fullDay = (ms: number, goalMin: number) => ms >= Math.max(3, goalMin) * 60_000;

/** The longest run of consecutive full days (a missed or short day starts the count again; freeze days do not count). */
export function longestFullRun(days: Record<string, number>, goalMin: number): number {
  const keys = Object.keys(days)
    .filter((k) => fullDay(days[k], goalMin))
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of keys) {
    const [y, m, d] = k.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    run = prev && Math.round((date.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** Has a full week happened that the reader has not been told about yet? */
export async function weekAwardDue(): Promise<boolean> {
  const s = getState();
  if (longestFullRun(s.days, s.settings.dailyGoal) < 7) return false;
  return !(await db.get<string>('kv', 'award:week').catch(() => undefined));
}
const markShown = () => db.put('kv', 'award:week', dayKey()).catch(() => {});

/** The four icons side by side; the one in use is marked. `pick` is the one chosen on this screen (before it is applied). */
export function IconChooser({ pick, onPick, dark }: { pick: AppIconId; onPick: (i: AppIconId) => void; dark: boolean }) {
  const using = useStore((s) => s.settings.appIcon ?? 'classic');
  return (
    <div className="ichoose" role="radiogroup" aria-label={tr('App icon')}>
      {ICONS.map((i) => (
        <button key={i.id} role="radio" aria-checked={pick === i.id} className={`ich${pick === i.id ? ' on' : ''}`} onClick={() => (tap('select'), onPick(i.id))}>
          <img src={dark ? i.dark : i.light} alt="" draggable={false} />
          <b>{tr(i.name)}</b>
          <small className="mono">{using === i.id ? tr('in use') : ' '}</small>
        </button>
      ))}
    </div>
  );
}

export async function applyIcon(icon: AppIconId) {
  await updateSettings({ appIcon: icon, iconUnlocked: true });
  const ok = await appIconSet(icon);
  toast(ok ? tr('Your icon is changing — the home screen may take a moment to show it') : tr('Saved'));
}

export function WeekAward({ open, onClose, test }: { open: boolean; onClose: () => void; test?: boolean }) {
  const using = useStore((s) => s.settings.appIcon ?? 'classic');
  const theme = useStore((s) => s.settings.appTheme);
  const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  const [pick, setPick] = useState<AppIconId>(using === 'classic' ? 'gradient' : using);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (!open) return;
    setOut(false);
    setPick(using === 'classic' ? 'gradient' : using);
    if (!test) void markShown();
    void updateSettings({ iconUnlocked: true });
    return onBack(() => {
      close();
      return true;
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  function close() {
    setOut(true);
    setTimeout(onClose, 220);
  }
  const days = Array.from({ length: 7 });
  return createPortal(
    <div className={`wn wk${out ? ' out' : ''}`} role="dialog" aria-modal="true" aria-label={tr('A full week')}>
      <div className="wn-scrim" onClick={close} />
      <div className="wn-card">
        <div className="wk-top" aria-hidden>
          <div className="wk-days">
            {days.map((_, i) => (
              <i key={i} style={{ animationDelay: `${0.25 + i * 0.12}s` }} />
            ))}
          </div>
          <div className="wk-n mono">7 / 7</div>
        </div>
        <div className="wn-body">
          <div className="wn-kicker mono">{test ? tr('preview') : tr('a full week')}</div>
          <h2>{tr('Seven full days in a row.')}</h2>
          <p className="wk-p">{tr('You reached your goal every day for a week. Frogity has new icons for your home screen — choose the one you like, or keep yours.')}</p>
          <IconChooser pick={pick} onPick={setPick} dark={dark} />
        </div>
        <div className="wn-foot">
          <button className="txtbtn mono" onClick={close}>
            {tr('Keep mine')}
          </button>
          <button
            className="pill"
            onClick={() => {
              tap('medium');
              if (pick !== using) void applyIcon(pick);
              close();
            }}
          >
            {pick === using ? tr('Done') : tr('Use this icon')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

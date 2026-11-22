// A month calendar of a country's public holidays: the days that have one are marked, and tapping a day says what it is.
import { useEffect, useMemo, useState } from 'react';
import { tr, loc } from '../lib/i18n';
import { emojiFor, holidaysYear, type Holiday } from '../lib/worldx';
import { tap } from '../lib/native';
import { Icon } from '../ui/Icon';

const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function HolidayCalendar({ cc }: { cc: string }) {
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [pick, setPick] = useState<string | null>(key(now.getFullYear(), now.getMonth(), now.getDate()));
  const [rows, setRows] = useState<Record<number, Holiday[] | 'err'>>({});
  const [again, setAgain] = useState(0);
  // the year on show, and the one the month may spill into
  useEffect(() => {
    let live = true;
    for (const y of [cur.y]) {
      if (Array.isArray(rows[y])) continue;
      holidaysYear(cc, y).then(
        (r) => live && setRows((o) => ({ ...o, [y]: r })),
        () => live && setRows((o) => ({ ...o, [y]: 'err' })),
      );
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc, cur.y, again]);
  useEffect(() => setRows({}), [cc]);
  const year = rows[cur.y];
  const byDay = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    if (Array.isArray(year)) for (const h of year) (m.get(h.date) ?? m.set(h.date, []).get(h.date)!).push(h);
    return m;
  }, [year]);
  const first = new Date(cur.y, cur.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => (i >= lead && i < lead + days ? i - lead + 1 : 0));
  const today = key(now.getFullYear(), now.getMonth(), now.getDate());
  const go = (d: number) => {
    tap('select');
    const dt = new Date(cur.y, cur.m + d, 1);
    setCur({ y: dt.getFullYear(), m: dt.getMonth() });
    setPick(null);
  };
  const monthName = first.toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  const wk = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc(), { weekday: 'narrow' }));
  const inMonth = [...byDay.entries()].filter(([d]) => d.startsWith(`${cur.y}-${String(cur.m + 1).padStart(2, '0')}`)).sort((a, b) => a[0].localeCompare(b[0]));
  const shown = pick ? byDay.get(pick) ?? [] : [];
  return (
    <section className="hcal">
      <header>
        <button onClick={() => go(-1)} aria-label={tr("Previous month")}>
          <Icon name="back" size={18} />
        </button>
        <b>{monthName}</b>
        <button onClick={() => go(1)} aria-label={tr("Next month")}>
          <Icon name="right" size={18} />
        </button>
      </header>
      <div className="hcal-grid mono" role="grid">
        {wk.map((w, i) => (
          <span key={i} className="wd" aria-hidden>
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="blank" />;
          const k = key(cur.y, cur.m, d);
          const has = byDay.has(k);
          return (
            <button key={i} className={`d${has ? ' has' : ''}${k === today ? ' today' : ''}${k === pick ? ' sel' : ''}`} onClick={() => (tap('select'), setPick(k))} aria-label={`${d}${has ? ' · ' + byDay.get(k)![0].name : ''}`}>
              {d}
              {has && <i aria-hidden />}
            </button>
          );
        })}
      </div>
      {year === 'err' ? (
        <div className="hcal-note">
          <p className="mono">{tr("holidays need a connection")}</p>
          <button className="wd-more" onClick={() => (setRows({}), setAgain((n) => n + 1))}>{tr("Try again")}</button>
        </div>
      ) : !year ? (
        <p className="hcal-note mono">{tr("loading holidays…")}</p>
      ) : (
        <div className="hcal-list">
          {pick && (
            <div className="hcal-day">
              <small className="mono">{new Date(`${pick}T12:00:00`).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</small>
              {shown.length ? (
                shown.map((h) => (
                  <b key={h.name}>
                    {emojiFor(h.name)} {h.local !== h.name ? h.local : h.name}
                    {h.local !== h.name && <small className="mono"> · {h.name}</small>}
                    {!h.global && <small className="mono"> · {tr("some regions")}</small>}
                  </b>
                ))
              ) : (
                <span className="mono dim">{tr("no public holiday")}</span>
              )}
            </div>
          )}
          {!!inMonth.length && (
            <ul>
              {inMonth.map(([d, hs]) => (
                <li key={d}>
                  <button onClick={() => (tap('select'), setPick(d))} className={d === pick ? 'on' : ''}>
                    <span className="mono">{Number(d.slice(8))}</span>
                    <span>{hs.map((h) => (h.local !== h.name ? h.local : h.name)).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!inMonth.length && <p className="hcal-note mono">{tr("no public holidays this month")}</p>}
        </div>
      )}
    </section>
  );
}

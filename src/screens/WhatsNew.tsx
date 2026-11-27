// The card shown once after an update (and from Settings → Version): a small scene at the top — a sun rising over hills that
// match-cuts into the version's badge at night — and below it, what changed, laid out like a folder of files.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loc, tr } from '../lib/i18n';
import { RELEASES, releaseOf, type Release } from '../lib/changelog';
import { onBack, tap } from '../lib/native';

function Scene({ r }: { r: Release }) {
  const [a, b, c] = r.sky;
  return (
    <div className="wn-scene" aria-hidden style={{ ['--a' as string]: a, ['--b' as string]: b, ['--c' as string]: c }}>
      {/* day: the sun comes up over the hills */}
      <div className="wn-day">
        <div className="wn-sky" />
        <div className="wn-sun" />
        <svg className="wn-hills" viewBox="0 0 400 120" preserveAspectRatio="none">
          <path className="h1" d="M0 70 C60 40 110 44 170 66 S290 96 400 58 L400 120 L0 120Z" />
          <path className="h2" d="M0 92 C80 70 150 74 220 92 S340 110 400 88 L400 120 L0 120Z" />
        </svg>
      </div>
      {/* the cut: the same circle, now the version, under a night sky */}
      <div className="wn-night">
        <div className="wn-sky2" />
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} className="wn-star" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 60}%`, animationDelay: `${1.6 + (i % 5) * 0.25}s` }} />
        ))}
        <div className="wn-badge mono">{r.v}</div>
        <svg className="wn-hills dark" viewBox="0 0 400 120" preserveAspectRatio="none">
          <path className="h1" d="M0 70 C60 40 110 44 170 66 S290 96 400 58 L400 120 L0 120Z" />
          <path className="h2" d="M0 92 C80 70 150 74 220 92 S340 110 400 88 L400 120 L0 120Z" />
        </svg>
      </div>
    </div>
  );
}

function Tree({ r, delay = 0 }: { r: Release; delay?: number }) {
  let n = 0;
  return (
    <div className="wn-tree">
      <div className="wn-root mono">
        frogity/<b>v{r.v}</b>/
      </div>
      <ul>
        {r.areas.map((area) => (
          <li key={area.dir} className="wn-dir" style={{ animationDelay: `${delay + n++ * 0.07}s` }}>
            <span className="wn-name mono">{tr(area.dir)}/</span>
            <ul>
              {area.items.map((it) => (
                <li key={it.file} className="wn-file" style={{ animationDelay: `${delay + n++ * 0.07}s` }}>
                  <span className="wn-name mono">{tr(it.file)}</span>
                  <span className="wn-what">{tr(it.what)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WhatsNew({ open, version, onClose }: { open: boolean; version?: string; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const [out, setOut] = useState(false);
  const r = releaseOf(version ?? RELEASES[0].v);
  useEffect(() => {
    if (!open) return;
    setAll(false);
    setOut(false);
    return onBack(() => {
      close();
      return true;
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  function close() {
    tap('light');
    setOut(true);
    setTimeout(onClose, 220);
  }
  return createPortal(
    <div className={`wn${out ? ' out' : ''}`} role="dialog" aria-modal="true" aria-label={tr("What's new")}>
      <div className="wn-scrim" onClick={close} />
      <div className="wn-card">
        <Scene r={r} />
        <div className="wn-body">
          <div className="wn-kicker mono">
            {tr('new features')} · {new Date(r.date + 'T12:00').toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <h2>{tr("What's new")}</h2>
          <Tree r={r} delay={1.7} />
          {all &&
            RELEASES.filter((x) => x.v !== r.v).map((x) => (
              <div key={x.v} className="wn-older">
                <Tree r={x} />
              </div>
            ))}
        </div>
        <div className="wn-foot">
          {RELEASES.length > 1 && (
            <button className="txtbtn mono" onClick={() => (tap('select'), setAll((v) => !v))}>
              {all ? tr('Hide earlier versions') : tr('Earlier versions')}
            </button>
          )}
          <button className="pill" onClick={close}>
            {tr('Continue')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

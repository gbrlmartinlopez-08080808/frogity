// The card shown once after an update (and from Settings → Version): a small scene at the top — a sun rising over hills that
// match-cuts into the version's badge at night — and below it, what changed, laid out like a folder of files.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { loc, tr } from '../lib/i18n';
import { RELEASES, releaseOf, type Release } from '../lib/changelog';
import { artFor, credit } from '../lib/releaseArt';
import { onBack, tap } from '../lib/native';

/**
 * The release picture, like a new model's announcement: an open-licence work of art or photograph fills the top of the card, a
 * framed window opens in it onto the next picture, and the window grows until it is the whole scene (a match cut through the
 * frame). Each update brings the next pair from a rotation of fifty.
 */
function Scene({ r }: { r: Release }) {
  const [a, b] = artFor(r);
  return (
    <div className="wn-scene" aria-hidden>
      <div className="wn-a" style={{ backgroundImage: `url(./art/${a.id}.webp)` }} />
      <div className="wn-b" style={{ backgroundImage: `url(./art/${b.id}.webp)` }} />
      <div className="wn-frame" />
      <div className="wn-tag mono">
        frogity <b>{r.v}</b>
      </div>
      <div className="wn-credit mono">
        <span className="c1">{credit(a)}</span>
        <span className="c2">{credit(b)}</span>
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

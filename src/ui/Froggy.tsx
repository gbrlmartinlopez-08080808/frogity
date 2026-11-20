import { useEffect, useRef, useState } from 'react';
import { froggyFace, type Mood } from '../lib/froggy';

/**
 * Froggy's face in ASCII, alive: it breathes, blinks every few seconds, glances to one side now and then, hops when its mood
 * changes to a happy one, trembles when worried, wobbles while it thinks, and drifts off when sleepy; with `talk` its mouth moves
 * (while it is answering). Always the same size on the grid, so changing mood never makes anything jump.
 */
export function Froggy({ mood = 'neutral', talk = false, size = 'md', className = '', label }: { mood?: Mood; talk?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string; label?: string }) {
  const [blink, setBlink] = useState(false);
  const [mouth, setMouth] = useState<string | undefined>();
  const [glance, setGlance] = useState(0); // -1 looks left, 1 looks right
  const [hop, setHop] = useState(0); // counts up on every change of mood: the animation restarts with it
  const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!calm) setHop((n) => n + 1);
  }, [mood, calm]);
  useEffect(() => {
    if (calm) return;
    let t = 0;
    const go = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        t = window.setTimeout(() => {
          setBlink(false);
          // now and then a quick look to the side before the next blink
          if (Math.random() < 0.35) {
            setGlance(Math.random() < 0.5 ? -1 : 1);
            t = window.setTimeout(() => {
              setGlance(0);
              go();
            }, 900);
          } else go();
        }, 130);
      }, 2600 + Math.random() * 2600);
    };
    go();
    return () => clearTimeout(t);
  }, [calm]);
  useEffect(() => {
    if (!talk) return setMouth(undefined);
    const seq = ['o', '-', 'O', 'v', '-'];
    let i = 0;
    const iv = window.setInterval(() => setMouth(seq[i++ % seq.length]), 170);
    return () => clearInterval(iv);
  }, [talk]);
  // a silly face pokes its tongue in and out by itself
  useEffect(() => {
    if (mood !== 'silly' || talk || calm) return;
    let on = false;
    const iv = window.setInterval(() => setMouth((on = !on) ? 'p' : undefined), 420);
    return () => (clearInterval(iv), setMouth(undefined));
  }, [mood, talk, calm]);
  let face = froggyFace(mood, { blink, mouth });
  if (glance && mood !== 'sleepy') {
    const rows = face.split('\n');
    rows[1] = glance < 0 ? rows[1].replace(/^ /, '') + ' ' : ' ' + rows[1].replace(/ $/, '');
    face = rows.join('\n');
  }
  return (
    <pre className={`froggy ${size} m-${mood}${talk ? ' talking' : ''}${hop ? (hop % 2 ? ' hopA' : ' hopB') : ''} ${className}`} role="img" aria-label={label ?? `Froggy, looking ${mood}`}>
      {face}
    </pre>
  );
}

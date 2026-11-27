// A race or event as Wikipedia tells it: the short description, and the candidates read from the lists on its page.
export interface Wp {
  extract: string;
  url: string;
}
export async function summary(title: string): Promise<Wp | null> {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const j = await r.json();
    return { extract: j.extract ?? '', url: j.content_urls?.desktop?.page ?? '' };
  } catch {
    return null;
  }
}
export interface Cand {
  group: string;
  items: { text: string; wiki?: string }[];
}
/** the candidates, read from the race's Wikipedia page: each list item under the primaries and the general election */
export async function candidates(title: string): Promise<Cand[]> {
  try {
    const base = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&redirects=1&action=parse&page=' + encodeURIComponent(title);
    const secs = (await (await fetch(`${base}&prop=sections`, { signal: AbortSignal.timeout(9000) })).json())?.parse?.sections as { index: string; line: string; level: string; toclevel: number }[] | undefined;
    const tops = (secs ?? []).filter((x) => x.toclevel === 1 && /^candidates$|^general election$|primar/i.test(x.line.replace(/<[^>]+>/g, ''))).slice(0, 3);
    if (!tops.length) return [];
    const out: Cand[] = [];
    for (const top of tops) {
      const html = (await (await fetch(`${base}&prop=text&section=${top.index}`, { signal: AbortSignal.timeout(12000) })).json())?.parse?.text?.['*'] as string | undefined;
      if (!html) continue;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let group = top.line.replace(/<[^>]+>/g, '');
      doc.body.querySelectorAll('h2,h3,h4,h5,ul').forEach((el) => {
        if (/^H\d$/.test(el.tagName)) {
          const t = (el.textContent ?? '').replace(/\[edit\]/g, '').trim();
          // a heading names the group: "Republican primary", "Declared"
          group = /^(declared|candidates|withdrawn|declined|failed to qualify|disqualified|eliminated|potential)/i.test(t) ? `${top.line.replace(/<[^>]+>/g, '')} · ${t}` : t;
          return;
        }
        if (el.closest('table, .reflist, .navbox, .hatnote') || el.parentElement?.closest('li')) return;
        const items = Array.from(el.querySelectorAll(':scope > li'))
          .map((li) => {
            const a = li.querySelector('a[href^="/wiki/"]:not([href*=":"])');
            const text = (li.textContent ?? '').replace(/\[\d+\]|\[[a-z]\]/g, '').replace(/\s+/g, ' ').trim();
            return { text: text.length > 150 ? text.slice(0, 147) + '…' : text, wiki: a ? decodeURIComponent(a.getAttribute('href')!.slice(6)).replace(/_/g, ' ') : undefined };
          })
          .filter((x) => x.text.length > 3);
        if (items.length && !/^(withdrawn|declined|potential|failed|disqualified)/i.test(group.split(' · ').pop() ?? '')) out.push({ group: group || 'Candidates', items: items.slice(0, 10) });
      });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}


export interface LiveParty {
  name: string;
  seats?: number;
  pct?: number;
  wiki?: string;
}
/**
 * An election's results as its Wikipedia page shows them (the box at the top, which editors fill in as the counts come in): for each
 * party, the seats won and the share of the vote. Empty while the page has no results yet.
 */
export async function liveResults(title: string): Promise<LiveParty[]> {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&redirects=1&action=parse&prop=text&section=0&page=' + encodeURIComponent(title);
    const html = (await (await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-cache' })).json())?.parse?.text?.['*'] as string | undefined;
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const box = doc.querySelector('table.infobox');
    if (!box) return [];
    const out: LiveParty[] = [];
    // the box lists parties in groups of columns; each group has a "Party" row, then "Seats won"/"Popular vote"/"Percentage" rows
    let names: { name: string; wiki?: string }[] = [];
    const num = (t: string) => {
      const m = t.replace(/\[\d+\]/g, '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : undefined;
    };
    for (const tr of Array.from(box.querySelectorAll('tr'))) {
      const th = (tr.querySelector('th')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const cells = Array.from(tr.querySelectorAll('td'));
      if (!cells.length) continue;
      if (/^(party|alliance|coalition)$/i.test(th)) {
        names = cells.map((c) => {
          const a = c.querySelector('a[href^="/wiki/"]:not([href*=":"])');
          return { name: (c.textContent ?? '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim(), wiki: a ? decodeURIComponent(a.getAttribute('href')!.slice(6)).replace(/_/g, ' ') : undefined };
        });
        for (const n of names) if (n.name && !out.some((o) => o.name === n.name)) out.push({ ...n });
        continue;
      }
      if (!names.length) continue;
      const field = /^seats (won|after)|^seats$/i.test(th) ? 'seats' : /^percentage|^% of vote|^vote share/i.test(th) ? 'pct' : null;
      if (!field) continue;
      cells.forEach((c, i) => {
        const p = out.find((o) => o.name === names[i]?.name);
        const v = num(c.textContent ?? '');
        if (p && v !== undefined) p[field] = v;
      });
    }
    return out.filter((p) => p.name && (p.seats !== undefined || p.pct !== undefined));
  } catch {
    return [];
  }
}

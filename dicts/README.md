# Offline dictionaries

Downloaded by the app (Settings → Dictionaries, and the word sheet for a book in another language). Built by
`scripts/build-dicts.mjs` from Wiktionary data extracted by wiktextract and published at kaikki.org.

Licence: the definitions and translations come from Wiktionary and are available under CC BY-SA 4.0 (and the GFDL).

- `<lang>.ndjson.gz`: the language's own dictionary (en, es, fr, de, it, pt), definitions in that language
- `<from>_<to>.ndjson.gz`: translations between two of those languages
- `index.json`: the list, with sizes

Each file is gzip of one JSON line of facts, then one line per piece: `{"k": "ca", "v": {word: entry}}`.

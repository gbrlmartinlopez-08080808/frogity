import * as XLSX from 'xlsx';
self.onmessage = (
  event: MessageEvent<{ buffer: ArrayBuffer; name: string }>,
) => {
  try {
    const { buffer, name } = event.data;
    const bytes = new Uint8Array(buffer);
    const csv = /\.(csv|tsv)$/i.test(name);
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    const workbook = csv
      ? XLSX.read(new TextDecoder(encoding).decode(bytes), {
          type: 'string',
          FS: /\.tsv$/i.test(name) ? '\t' : undefined,
          raw: false,
        })
      : XLSX.read(bytes, { type: 'array', cellDates: true });
    let cells = 0;
    const sheets = workbook.SheetNames.map((name) => {
      const rows = (
        XLSX.utils.sheet_to_json(workbook.Sheets[name], {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        }) as unknown[][]
      ).map((row) => row.map((v) => String(v ?? '')));
      cells += rows.reduce((n, r) => n + r.length, 0);
      if (cells > 500000)
        throw new Error(
          'This spreadsheet has too many cells to display safely.',
        );
      return { name, rows };
    });
    self.postMessage({ sheets });
  } catch (e) {
    self.postMessage({
      error: (e as Error).message || 'Could not read this spreadsheet.',
    });
  }
};

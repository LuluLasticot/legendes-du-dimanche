// A small RFC 4180 CSV reader (quoted fields, doubled quotes, CRLF). The club list is edited by
// hand in a spreadsheet, so it has to survive what spreadsheets do to a file.

/** Rows of a CSV as arrays of fields; empty lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (src.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src.charAt(i + 1) === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** Rows as objects keyed by the header line. Lines starting with `#` are comments. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => !(r[0] ?? '').startsWith('#'));
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((r, line) => {
    if (r.length > header.length)
      throw new Error(`CSV line ${line + 2}: ${r.length} fields for ${header.length} columns`);
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name.trim()] = (r[i] ?? '').trim();
    });
    return record;
  });
}

/**
 * Shared client-side spreadsheet reading for bulk-import modals (students,
 * invoices, …). Reads CSV as text and any Excel-savable workbook (.xlsx, .xls,
 * .xlsm, .xlsb, .ods) via SheetJS — loaded on demand so the library only ships
 * when someone actually imports a file. Callers get back a plain grid of string
 * cells starting at the real header row, then do their own column mapping.
 */

/** Minimal CSV parser: handles quoted fields, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/**
 * Find the header row in a grid that may carry title/notes rows above the table
 * (common in "sample" spreadsheets). A header is the first row with an identity
 * column (`identity`, e.g. name/admission) AND at least two known labels in
 * *separate* cells — so a prose line (one long cell) is never mistaken for a
 * header. Returns -1 when none is found.
 */
export function findHeaderRow(grid: string[][], keys: string[], identity: string[]): number {
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const cells = (grid[i] ?? []).map((c) => c.trim().toLowerCase());
    const known = cells.filter((c) => c && keys.some((k) => c === k || c.includes(k))).length;
    const hasId = cells.some((c) => c && identity.some((k) => c === k || c.includes(k)));
    if (hasId && known >= 2) return i;
  }
  return -1;
}

/** True for file names Excel can save that we decode as a workbook. */
export function isSpreadsheetFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext);
}

/**
 * Read a CSV or spreadsheet file into one best grid of string cells. For
 * multi-sheet workbooks the sheet with a real header (per findHeaderRow) is
 * chosen — ignoring a separate Notes/README sheet — and the largest wins.
 * Rejects if the file can't be decoded.
 */
export async function readFileToGrid(file: File, keys: string[], identity: string[]): Promise<string[][]> {
  if (isSpreadsheetFile(file.name)) {
    const buf = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    const grids = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      if (!ws) return [];
      return (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '', raw: false }) as unknown[][])
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
        .filter((r) => r.some((c) => c.trim() !== ''));
    });
    const withHeader = grids.filter((g) => findHeaderRow(g, keys, identity) >= 0);
    return [...(withHeader.length ? withHeader : grids)].sort((a, b) => b.length - a.length)[0] ?? [];
  }
  return parseCsv(await file.text());
}

/** The file-picker `accept` value covering CSV plus every spreadsheet format. */
export const SPREADSHEET_ACCEPT =
  '.csv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet';

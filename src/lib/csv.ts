/** CSV for spreadsheets (Excel opens UTF-8 with the BOM). Cells that start like a formula are neutralised. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (x: string | number) => {
    if (typeof x === 'number') return String(x);
    const v = /^[=+\-@\t\r]/.test(x) ? "'" + x : x; // spreadsheet formula injection
    return '"' + v.replace(/"/g, '""') + '"';
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

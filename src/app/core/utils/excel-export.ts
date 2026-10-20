import * as XLSX from 'xlsx';

/** Exports rows (plain objects, keys become the header row) as a downloaded .xlsx file. */
export function exportToExcel(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportReportsToExcel(
  filename: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[]
): void {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    const headers = Object.keys(sheet.rows[0]);
    worksheet['!cols'] = headers.map((header) => {
      const maxLength = sheet.rows.reduce(
        (max, row) => Math.max(max, String(row[header] ?? '').length),
        header.length
      );
      return { wch: Math.min(54, Math.max(12, maxLength)) };
    });
    if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  if (workbook.SheetNames.length === 0) throw new Error('NO_REPORT_DATA');
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

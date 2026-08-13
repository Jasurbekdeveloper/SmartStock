import * as XLSX from 'xlsx';

/** Exports rows (plain objects, keys become the header row) as a downloaded .xlsx file. */
export function exportToExcel(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

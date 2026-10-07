import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: any[];
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function addPlainSheet(workbook: ExcelJS.Workbook, s: ExcelSheet): void {
  const sheet = workbook.addWorksheet(s.name);
  sheet.columns = s.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0E3' } };

  s.rows.forEach(row => sheet.addRow(row));

  s.columns.forEach((c, index) => {
    if (c.numFmt) sheet.getColumn(index + 1).numFmt = c.numFmt;
  });
}

// Shared "export this grid to .xlsx" helper - any report/form component can call this with its
// own sheet(s) of column list + row data instead of each one wiring up ExcelJS/file-download
// plumbing itself.
export async function exportSheetsToExcel(fileName: string, sheets: ExcelSheet[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  sheets.forEach(s => addPlainSheet(workbook, s));
  await downloadWorkbook(workbook, fileName);
}

// Convenience wrapper for the common single-sheet case (Resource Report, Material Expiry Report).
export function exportRowsToExcel(fileName: string, sheetName: string, columns: ExcelColumn[], rows: any[]): Promise<void> {
  return exportSheetsToExcel(fileName, [{ name: sheetName, columns, rows }]);
}

export interface GroupedExcelGroup {
  // One value per groupColumns[i].key - written once per group and merged down across every
  // detail row in that group (e.g. SONo/Driver/Vehicle/Client, matching an RDLC-style grouped
  // report where those repeat-but-merge per job while the detail rows vary per employee).
  groupValues: Record<string, any>;
  details: Record<string, any>[];
}

function addGroupedSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  groupColumns: ExcelColumn[],
  detailColumns: ExcelColumn[],
  groups: GroupedExcelGroup[],
  titleBlock?: { title: string; infoRows: { label: string; value: string }[][] }
): void {
  const sheet = workbook.addWorksheet(sheetName);
  const allColumns = [...groupColumns, ...detailColumns];

  allColumns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width ?? 18; });

  let currentRow = 1;

  if (titleBlock) {
    sheet.mergeCells(currentRow, 1, currentRow, allColumns.length);
    const titleCell = sheet.getCell(currentRow, 1);
    titleCell.value = titleBlock.title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(currentRow).height = 24;
    currentRow++;

    for (const infoRow of titleBlock.infoRows) {
      let col = 1;
      for (const { label, value } of infoRow) {
        sheet.getCell(currentRow, col).value = label;
        sheet.getCell(currentRow, col).font = { bold: true };
        col++;
        sheet.getCell(currentRow, col).value = value;
        col++;
      }
      currentRow++;
    }
    currentRow++; // blank spacer row before the table
  }

  const headerRowIndex = currentRow;
  allColumns.forEach((c, i) => {
    const cell = sheet.getCell(headerRowIndex, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E0E3' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  currentRow++;

  for (const group of groups) {
    const startRow = currentRow;
    const detailCount = Math.max(group.details.length, 1);

    groupColumns.forEach((c, i) => {
      const col = i + 1;
      sheet.getCell(startRow, col).value = group.groupValues[c.key] ?? '';
      if (detailCount > 1) sheet.mergeCells(startRow, col, startRow + detailCount - 1, col);
    });

    if (group.details.length === 0) {
      currentRow++;
    } else {
      group.details.forEach((detail, di) => {
        const rowIndex = startRow + di;
        detailColumns.forEach((c, i) => {
          sheet.getCell(rowIndex, groupColumns.length + i + 1).value = detail[c.key] ?? '';
        });
        currentRow++;
      });
    }
  }

  for (let r = headerRowIndex; r < currentRow; r++) {
    for (let c = 1; c <= allColumns.length; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true, ...(r === headerRowIndex ? { horizontal: 'center' } : {}) };
    }
  }
}

// Matches a desktop RDLC-style grouped report: a title block, then a table where the "group"
// columns are merged down the full height of their group and the "detail" columns vary per row
// within it (Manpower Schedule's print/export: Sl No/SONo/Driver/Vehicle/Client merged per job,
// Employee/Supervisor/Material/... one row per employee). extraSheets adds plain (non-grouped)
// sheets to the same workbook - e.g. Manpower Schedule's Idle Employees list, which has no
// job-level grouping of its own.
export async function exportGroupedSheetToExcel(
  fileName: string,
  sheetName: string,
  groupColumns: ExcelColumn[],
  detailColumns: ExcelColumn[],
  groups: GroupedExcelGroup[],
  titleBlock?: { title: string; infoRows: { label: string; value: string }[][] },
  extraSheets?: ExcelSheet[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  addGroupedSheet(workbook, sheetName, groupColumns, detailColumns, groups, titleBlock);
  (extraSheets ?? []).forEach(s => addPlainSheet(workbook, s));
  await downloadWorkbook(workbook, fileName);
}

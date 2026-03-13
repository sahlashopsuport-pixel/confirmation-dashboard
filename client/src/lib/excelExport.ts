/**
 * Excel Export Utility — Multi-company support
 * 
 * Generates .xlsx files matching each company's expected format.
 * - Sellmax: 29 columns, shared strings, numeric offerValue/value/quantity
 * - Ecomamanager: 14 columns, Commandes sheet
 */

import * as XLSX from 'xlsx';
import {
  SELLMAX_HEADERS,
  ECOMAMANAGER_HEADERS,
  COLIVRAISON_HEADERS,
  ECOTRACK_HEADERS,
  type SellmaxRow,
  type EcomamanagerRow,
  type ColivraisonRow,
  type EcotrackRow,
  type CompanyId,
} from './leadParser';

// Sellmax columns that should be stored as numbers
const SELLMAX_NUMERIC = new Set(['offerValue', 'value', 'quantity']);

// Ecomamanager columns that should be stored as numbers
const ECOMA_NUMERIC = new Set(['Quantité*', 'Prix unitaire', 'Frais de livraison', 'Réduction']);

// Colivraison columns that should be stored as numbers
const COLIV_NUMERIC = new Set(['Qte', 'Prix', 'Weight']);

// Ecotrack columns that should be stored as numbers
const ECOTRACK_NUMERIC = new Set(['code wilaya*', 'montant du colis*']);

function buildWorksheet(
  headers: string[],
  rows: Record<string, string>[],
  numericCols: Set<string>,
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};

  // Write header row
  headers.forEach((header, colIdx) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    ws[addr] = { t: 's', v: header };
  });

  // Write data rows
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const excelRow = rowIdx + 1;

    headers.forEach((header, colIdx) => {
      const value = row[header];
      // Skip empty cells entirely
      if (value === null || value === undefined || value === '') return;

      const addr = XLSX.utils.encode_cell({ r: excelRow, c: colIdx });

      if (numericCols.has(header) && value !== '') {
        const num = Number(value);
        if (!isNaN(num)) {
          ws[addr] = { t: 'n', v: num };
          return;
        }
      }
      ws[addr] = { t: 's', v: String(value) };
    });
  }

  // Set range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: headers.length - 1 },
  });

  // Column widths
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));

  return ws;
}

export function exportSellmax(rows: SellmaxRow[], filename?: string): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet(
    SELLMAX_HEADERS,
    rows as unknown as Record<string, string>[],
    SELLMAX_NUMERIC,
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const defaultFilename = `sellmax-leads-${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename || defaultFilename, { bookSST: true, type: 'binary' });
}

export function exportEcomamanager(rows: EcomamanagerRow[], filename?: string): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet(
    ECOMAMANAGER_HEADERS,
    rows as unknown as Record<string, string>[],
    ECOMA_NUMERIC,
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Commandes');

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const defaultFilename = `ecomamanager-leads-${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename || defaultFilename, { bookSST: true, type: 'binary' });
}

export function exportColivraison(rows: ColivraisonRow[], filename?: string): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet(
    COLIVRAISON_HEADERS,
    rows as unknown as Record<string, string>[],
    COLIV_NUMERIC,
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Colivraison Template');

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
  const defaultFilename = `Colivraison_${dateStr}_${timeStr}.xlsx`;

  XLSX.writeFile(wb, filename || defaultFilename, { bookSST: true, type: 'binary' });
}

export function exportEcotrack(rows: EcotrackRow[], filename?: string): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet(
    ECOTRACK_HEADERS,
    rows as unknown as Record<string, string>[],
    ECOTRACK_NUMERIC,
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
  const defaultFilename = `EcotrackDHD_${dateStr}_${timeStr}.xlsx`;

  XLSX.writeFile(wb, filename || defaultFilename, { bookSST: true, type: 'binary' });
}

export function exportToExcel(company: CompanyId, rows: SellmaxRow[] | EcomamanagerRow[] | ColivraisonRow[] | EcotrackRow[]): void {
  if (company === 'sellmax') {
    exportSellmax(rows as SellmaxRow[]);
  } else if (company === 'ecomamanager') {
    exportEcomamanager(rows as EcomamanagerRow[]);
  } else if (company === 'colivraison') {
    exportColivraison(rows as ColivraisonRow[]);
  } else if (company === 'ecotrack_dhd') {
    exportEcotrack(rows as EcotrackRow[]);
  }
}

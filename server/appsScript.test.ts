import { describe, it, expect } from 'vitest';

describe('Apps Script URL validation', () => {
  it('VITE_APPS_SCRIPT_URL env var is set and looks like a valid Apps Script URL', () => {
    const url = process.env.VITE_APPS_SCRIPT_URL;
    expect(url).toBeDefined();
    expect(url).toContain('script.google.com/macros/s/');
    expect(url).toContain('/exec');
  });

  it('Apps Script endpoint responds with valid JSON for a test sheet', async () => {
    const baseUrl = process.env.VITE_APPS_SCRIPT_URL;
    if (!baseUrl) throw new Error('VITE_APPS_SCRIPT_URL not set');
    
    // Use the RAMY duplicate test sheet
    const testSheetId = '1pa1-UMByvZ0CCrFf-Bwx2RrBWjZlhLAtn3iyKORP9Ng';
    const url = `${baseUrl}?id=${testSheetId}`;
    
    const res = await fetch(url, { redirect: 'follow' });
    expect(res.ok).toBe(true);
    
    const data = await res.json();
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('tabs');
    expect(typeof data.title).toBe('string');
    expect(typeof data.tabs).toBe('object');
    
    // Should have at least one tab with data
    const tabNames = Object.keys(data.tabs);
    expect(tabNames.length).toBeGreaterThan(0);
    
    // Find a tab with rows
    let foundDataTab = false;
    for (const tabName of tabNames) {
      const rows = data.tabs[tabName]?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        foundDataTab = true;
        // Each row should be an array of strings
        expect(Array.isArray(rows[0])).toBe(true);
        // First column should be a date (dd/mm/yyyy)
        const firstDate = rows[0][0];
        expect(firstDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
        break;
      }
    }
    expect(foundDataTab).toBe(true);
  }, 30000);
});

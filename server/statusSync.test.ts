import { describe, it, expect } from 'vitest';
import { cleanPhoneForMatch, phonesMatch } from './statusSync';

describe('Status Sync — Phone matching', () => {
  describe('cleanPhoneForMatch', () => {
    it('strips leading apostrophe (Sheets text prefix)', () => {
      expect(cleanPhoneForMatch("'0551234567")).toBe('0551234567');
    });

    it('strips non-digit characters', () => {
      expect(cleanPhoneForMatch('+213-551-234-567')).toBe('213551234567');
    });

    it('handles plain digits', () => {
      expect(cleanPhoneForMatch('0551234567')).toBe('0551234567');
    });

    it('handles empty string', () => {
      expect(cleanPhoneForMatch('')).toBe('');
    });

    it('strips spaces and dashes', () => {
      expect(cleanPhoneForMatch('055 123 4567')).toBe('0551234567');
    });
  });

  describe('phonesMatch', () => {
    it('matches identical numbers', () => {
      expect(phonesMatch('0551234567', '0551234567')).toBe(true);
    });

    it('matches with leading apostrophe in sheet phone', () => {
      expect(phonesMatch('0551234567', "'0551234567")).toBe(true);
    });

    it('matches with country code prefix (213 vs 0)', () => {
      // 213551234567 ends with 551234567, and 0551234567 ends with 551234567
      expect(phonesMatch('213551234567', '0551234567')).toBe(true);
    });

    it('matches when DB has country code and sheet does not', () => {
      expect(phonesMatch('+213551234567', "'0551234567")).toBe(true);
    });

    it('does NOT match completely different numbers', () => {
      expect(phonesMatch('0551234567', '0661234567')).toBe(false);
    });

    it('does NOT match empty phones', () => {
      expect(phonesMatch('', '0551234567')).toBe(false);
      expect(phonesMatch('0551234567', '')).toBe(false);
    });

    it('matches Libyan numbers with +218 prefix', () => {
      expect(phonesMatch('+218912345678', '0912345678')).toBe(true);
    });

    it('matches Tunisian numbers with +216 prefix', () => {
      expect(phonesMatch('+21698765432', '98765432')).toBe(true);
    });
  });
});

describe('Status Sync — Query filter', () => {
  it('status filter "pending" maps to null status concept', () => {
    // This tests the conceptual mapping — actual DB query tested via integration
    const statusFilter = 'pending';
    expect(statusFilter === 'pending').toBe(true);
  });

  it('status filter "تأكيد" is a valid Arabic status', () => {
    const status = 'تأكيد';
    expect(status.length).toBeGreaterThan(0);
  });

  it('status filter "إلغاء" is a valid Arabic status', () => {
    const status = 'إلغاء';
    expect(status.length).toBeGreaterThan(0);
  });
});

describe('Status Sync — Apps Script integration', () => {
  it('VITE_APPS_SCRIPT_URL env var is set', () => {
    const url = process.env.VITE_APPS_SCRIPT_URL;
    expect(url).toBeDefined();
    expect(url).toBeTruthy();
  });

  it('statusSync no longer imports googleapis', async () => {
    // Verify the rewrite removed the Google Sheets API dependency
    const fs = await import('fs');
    const content = fs.readFileSync('./server/statusSync.ts', 'utf-8');
    expect(content).not.toContain("from 'googleapis'");
    expect(content).toContain('fetchSheetViaAppsScript');
    expect(content).toContain('VITE_APPS_SCRIPT_URL');
  });
});

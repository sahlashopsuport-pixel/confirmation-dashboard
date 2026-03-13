import { describe, it, expect, vi } from 'vitest';
import { appRouter } from './routers';
import jwt from 'jsonwebtoken';
import type { TrpcContext } from './_core/context';

const JWT_SECRET = process.env.JWT_SECRET || "scalex-dashboard-secret-key";
const DASHBOARD_COOKIE = "dashboard_session";

// Mock the db module
vi.mock("./db", () => {
  let sheets: any[] = [];
  let nextId = 1;
  return {
    verifyDashboardUser: vi.fn(async (username: string, password: string) => {
      if (username === "admin" && password === "scalex2026") {
        return { id: 1, username: "admin" };
      }
      return null;
    }),
    getAllAgentSheets: vi.fn(async (country?: string) => {
      if (country) {
        return sheets.filter(s => s.country === country);
      }
      return sheets;
    }),
    addAgentSheet: vi.fn(async (data: any) => {
      const sheet = { id: nextId++, ...data, createdAt: new Date(), updatedAt: new Date() };
      sheets.push(sheet);
      return sheet;
    }),
    deleteAgentSheet: vi.fn(async (id: number) => {
      sheets = sheets.filter(s => s.id !== id);
      return true;
    }),
    updateAgentSheet: vi.fn(async (id: number, data: any) => {
      const idx = sheets.findIndex(s => s.id === id);
      if (idx >= 0) {
        sheets[idx] = { ...sheets[idx], ...data };
        return sheets[idx];
      }
      return null;
    }),
    upsertUser: vi.fn(async () => {}),
    getUserByOpenId: vi.fn(async () => undefined),
    seedDefaultUser: vi.fn(async () => {}),
  };
});

// Create an authenticated context with valid JWT cookie
function createAuthenticatedContext(): TrpcContext {
  const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: { [DASHBOARD_COOKIE]: token },
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

// Create an unauthenticated context
function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe('Agent Sheets API', () => {
  it('should list agent sheets when authenticated', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const sheets = await caller.sheets.list();
    expect(Array.isArray(sheets)).toBe(true);
  });

  it('should return empty array when not authenticated', async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    const sheets = await caller.sheets.list();
    expect(sheets).toEqual([]);
  });

  it('should add a new agent sheet when authenticated', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.sheets.add({
      name: 'Test Agent',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/test123/edit',
      country: 'algeria',
    });
    expect(result).toBeTruthy();
    expect(result!.name).toBe('Test Agent');
    expect(result!.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/test123/edit');
    expect(result!.country).toBe('algeria');
  });

  it('should throw Unauthorized when adding without auth', async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.sheets.add({
        name: 'Test Agent',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/test123/edit',
      })
    ).rejects.toThrow();
  });

  it('should delete an agent sheet when authenticated', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    // First add one
    const added = await caller.sheets.add({
      name: 'To Delete',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/delete123/edit',
      country: 'libya',
    });
    expect(added).toBeTruthy();

    // Then delete it
    const result = await caller.sheets.delete({ id: added!.id });
    expect(result).toBe(true);
  });

  it('should reject invalid URLs', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    await expect(
      caller.sheets.add({
        name: 'Bad URL',
        sheetUrl: 'not-a-url',
      })
    ).rejects.toThrow();
  });
});

describe('Multi-Country Filtering', () => {
  it('should add sheets with different countries', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const algeriaSheet = await caller.sheets.add({
      name: 'Algeria Agent',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/algeria1/edit',
      country: 'algeria',
    });
    expect(algeriaSheet).toBeTruthy();
    expect(algeriaSheet!.country).toBe('algeria');

    const libyaSheet = await caller.sheets.add({
      name: 'Libya Agent',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/libya1/edit',
      country: 'libya',
    });
    expect(libyaSheet).toBeTruthy();
    expect(libyaSheet!.country).toBe('libya');

    const tunisiaSheet = await caller.sheets.add({
      name: 'Tunisia Agent',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/tunisia1/edit',
      country: 'tunisia',
    });
    expect(tunisiaSheet).toBeTruthy();
    expect(tunisiaSheet!.country).toBe('tunisia');

    const viconisSheet = await caller.sheets.add({
      name: 'Viconis Agent',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/viconis1/edit',
      country: 'viconis',
    });
    expect(viconisSheet).toBeTruthy();
    expect(viconisSheet!.country).toBe('viconis');
  });

  it('should filter sheets by country', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());

    const algeriaSheets = await caller.sheets.list({ country: 'algeria' });
    expect(algeriaSheets.length).toBeGreaterThan(0);
    expect(algeriaSheets.every((s: any) => s.country === 'algeria')).toBe(true);

    const libyaSheets = await caller.sheets.list({ country: 'libya' });
    expect(libyaSheets.length).toBeGreaterThan(0);
    expect(libyaSheets.every((s: any) => s.country === 'libya')).toBe(true);
  });

  it('should return all sheets when no country filter', async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const allSheets = await caller.sheets.list();
    expect(allSheets.length).toBeGreaterThan(0);
  });
});

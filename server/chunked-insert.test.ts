import { describe, expect, it, vi } from "vitest";
import { insertInChunks } from "./db";

// Mock db and table for testing the chunking logic
function createMockDb(failOnChunks: number[] = []) {
  let callCount = 0;
  const insertedRows: any[][] = [];

  const mockInsert = (table: any) => ({
    values: async (rows: any[]) => {
      callCount++;
      if (failOnChunks.includes(callCount)) {
        throw new Error(`Simulated DB failure on call ${callCount}`);
      }
      insertedRows.push(rows);
    },
  });

  return {
    db: { insert: mockInsert } as any,
    table: {} as any,
    getCallCount: () => callCount,
    getInsertedRows: () => insertedRows,
  };
}

describe("insertInChunks", () => {
  it("inserts all rows in a single chunk when count <= chunkSize", async () => {
    const { db, table, getInsertedRows } = createMockDb();
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `row-${i}` }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(getInsertedRows()).toHaveLength(1);
    expect(getInsertedRows()[0]).toHaveLength(10);
  });

  it("splits rows into correct number of chunks", async () => {
    const { db, table, getInsertedRows } = createMockDb();
    const rows = Array.from({ length: 234 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(234);
    expect(result.failed).toBe(0);
    // 234 / 50 = 4 full chunks + 1 partial = 5 chunks
    expect(getInsertedRows()).toHaveLength(5);
    expect(getInsertedRows()[0]).toHaveLength(50);
    expect(getInsertedRows()[1]).toHaveLength(50);
    expect(getInsertedRows()[2]).toHaveLength(50);
    expect(getInsertedRows()[3]).toHaveLength(50);
    expect(getInsertedRows()[4]).toHaveLength(34);
  });

  it("retries a failed chunk and succeeds on second attempt", async () => {
    // Fail on call 1 (chunk 1 attempt 1), succeed on call 2 (chunk 1 attempt 2)
    const { db, table, getCallCount } = createMockDb([1]);
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(30);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(getCallCount()).toBe(2); // 1 fail + 1 retry success
  });

  it("records failure when chunk fails on both attempts", async () => {
    // Fail on calls 1 and 2 (chunk 1 both attempts)
    const { db, table } = createMockDb([1, 2]);
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(0);
    expect(result.failed).toBe(30);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Chunk 1");
  });

  it("continues inserting remaining chunks after one chunk fails", async () => {
    // Fail chunk 2 (calls 3 and 4 — chunk 1 succeeds on call 1, chunk 2 fails on calls 2 and 3, chunk 3 on call 4)
    // Actually: chunk1=call1(ok), chunk2=call2(fail),call3(fail), chunk3=call4(ok)
    const { db, table, getInsertedRows } = createMockDb([2, 3]);
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(70); // chunk 1 (50) + chunk 3 (20)
    expect(result.failed).toBe(50); // chunk 2 (50)
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Chunk 2");
    // 2 successful inserts (chunk 1 and chunk 3)
    expect(getInsertedRows()).toHaveLength(2);
  });

  it("handles empty rows array", async () => {
    const { db, table, getCallCount } = createMockDb();

    const result = await insertInChunks(db, table, [], 50);

    expect(result.inserted).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(getCallCount()).toBe(0);
  });

  it("handles exactly chunkSize rows", async () => {
    const { db, table, getInsertedRows } = createMockDb();
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(50);
    expect(result.failed).toBe(0);
    expect(getInsertedRows()).toHaveLength(1);
  });

  it("handles 1 row", async () => {
    const { db, table, getInsertedRows } = createMockDb();
    const rows = [{ id: 1 }];

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(1);
    expect(result.failed).toBe(0);
    expect(getInsertedRows()).toHaveLength(1);
  });

  it("handles multiple chunk failures independently", async () => {
    // 300 rows, chunkSize 50 = 6 chunks
    // Fail chunks 1 and 4 (calls: 1,2 fail for chunk1; 3 ok chunk2; 4 ok chunk3; 5,6 fail chunk4; 7 ok chunk5; 8 ok chunk6)
    const { db, table } = createMockDb([1, 2, 7, 8]);
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 50);

    expect(result.inserted).toBe(200); // 4 successful chunks * 50
    expect(result.failed).toBe(100); // 2 failed chunks * 50
    expect(result.errors).toHaveLength(2);
  });

  it("uses custom chunk size", async () => {
    const { db, table, getInsertedRows } = createMockDb();
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    const result = await insertInChunks(db, table, rows, 25);

    expect(result.inserted).toBe(100);
    expect(getInsertedRows()).toHaveLength(4); // 100 / 25 = 4 chunks
    expect(getInsertedRows()[0]).toHaveLength(25);
  });
});

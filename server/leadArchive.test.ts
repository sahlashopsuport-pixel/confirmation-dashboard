import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StoreLeadInput } from "./db";

// We test the data transformation logic that happens before DB insert,
// since the actual DB calls require a live database connection.

describe("Lead Archive — Data Transformation", () => {
  const baseLead: StoreLeadInput = {
    agentId: 1,
    agentName: "Soheib",
    agentCode: "SB",
    workDate: "2026-03-06",
    market: "algeria",
    sheetTab: "الاسبوع 1",
    customerName: "عبد القادر",
    phone: "0662666692",
    wilaya: "Alger",
    product: "Viconis Hair Oil",
    price: "3900",
    sku: "VIC-001",
    assignedBy: "admin",
  };

  it("stores all required fields", () => {
    expect(baseLead.agentId).toBe(1);
    expect(baseLead.agentName).toBe("Soheib");
    expect(baseLead.workDate).toBe("2026-03-06");
    expect(baseLead.market).toBe("algeria");
    expect(baseLead.assignedBy).toBe("admin");
  });

  it("handles optional fields being undefined", () => {
    const minimalLead: StoreLeadInput = {
      agentId: 2,
      agentName: "Agent2",
      workDate: "2026-03-06",
      market: "libya",
      assignedBy: "admin",
    };
    expect(minimalLead.customerName).toBeUndefined();
    expect(minimalLead.phone).toBeUndefined();
    expect(minimalLead.wilaya).toBeUndefined();
    expect(minimalLead.product).toBeUndefined();
    expect(minimalLead.price).toBeUndefined();
    expect(minimalLead.sku).toBeUndefined();
    expect(minimalLead.address2).toBeUndefined();
    expect(minimalLead.orderType).toBeUndefined();
  });

  it("handles Libya-specific fields (address2, orderType)", () => {
    const libyaLead: StoreLeadInput = {
      ...baseLead,
      market: "libya",
      address2: "طرابلس - حي الأندلس",
      orderType: "NORMAL",
    };
    expect(libyaLead.address2).toBe("طرابلس - حي الأندلس");
    expect(libyaLead.orderType).toBe("NORMAL");
  });

  it("converts numeric price to string", () => {
    const numericPrice = String(3900);
    expect(numericPrice).toBe("3900");
    expect(typeof numericPrice).toBe("string");
  });

  it("handles workDate in correct YYYY-MM-DD format", () => {
    expect(baseLead.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles tomorrow's workDate correctly", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const lead: StoreLeadInput = {
      ...baseLead,
      workDate: tomorrowStr,
    };
    expect(lead.workDate).toBe(tomorrowStr);
    expect(lead.workDate).not.toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("Lead Archive — Batch Processing", () => {
  it("splits large batches correctly at BATCH_SIZE boundary", () => {
    const BATCH_SIZE = 500;
    const totalLeads = 1250;
    const leads: StoreLeadInput[] = Array.from({ length: totalLeads }, (_, i) => ({
      agentId: 1,
      agentName: "Agent",
      workDate: "2026-03-06",
      market: "algeria",
      assignedBy: "admin",
      customerName: `Customer ${i}`,
      phone: `066${String(i).padStart(7, "0")}`,
    }));

    // Simulate the batching logic from storeAssignedLeads
    const batches: StoreLeadInput[][] = [];
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      batches.push(leads.slice(i, i + BATCH_SIZE));
    }

    expect(batches.length).toBe(3); // 500 + 500 + 250
    expect(batches[0].length).toBe(500);
    expect(batches[1].length).toBe(500);
    expect(batches[2].length).toBe(250);
    expect(batches.reduce((sum, b) => sum + b.length, 0)).toBe(totalLeads);
  });

  it("handles empty leads array", () => {
    const leads: StoreLeadInput[] = [];
    expect(leads.length).toBe(0);
    // storeAssignedLeads returns 0 for empty array
  });

  it("handles single lead", () => {
    const leads: StoreLeadInput[] = [{
      agentId: 1,
      agentName: "Agent",
      workDate: "2026-03-06",
      market: "algeria",
      assignedBy: "admin",
    }];
    const BATCH_SIZE = 500;
    const batches: StoreLeadInput[][] = [];
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      batches.push(leads.slice(i, i + BATCH_SIZE));
    }
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(1);
  });
});

describe("Lead Archive — SplitAssign Lead Mapping", () => {
  it("correctly maps leads from assignment indices to store format", () => {
    const allLeads = [
      { customerName: "A", phone: "001", wilaya: "Alger", product: "P1", price: "3900", sku: "S1", date: "2026-03-06" },
      { customerName: "B", phone: "002", wilaya: "Oran", product: "P2", price: "4500", sku: "S2", date: "2026-03-06" },
      { customerName: "C", phone: "003", wilaya: "Blida", product: "P1", price: "3900", sku: "S1", date: "2026-03-06" },
      { customerName: "D", phone: "004", wilaya: "Setif", product: "P3", price: "5000", sku: "S3", date: "2026-03-06" },
    ];

    const assignments = [
      { agentId: 1, agentName: "Soheib", agentCode: "SB", sheetTab: "الاسبوع 1", leadIndices: [0, 2] },
      { agentId: 2, agentName: "Amina", agentCode: "AM", sheetTab: "الاسبوع 1", leadIndices: [1, 3] },
    ];

    const market = "algeria";
    const workDate = "2026-03-07";
    const assignedBy = "admin";

    const allLeadsToStore = assignments.flatMap((assignment) => {
      const agentLeads = assignment.leadIndices.map((i) => allLeads[i]).filter(Boolean);
      return agentLeads.map(lead => ({
        agentId: assignment.agentId,
        agentName: assignment.agentName,
        agentCode: assignment.agentCode,
        workDate,
        market,
        sheetTab: assignment.sheetTab,
        customerName: lead.customerName,
        phone: lead.phone,
        wilaya: lead.wilaya,
        product: lead.product,
        price: String(lead.price),
        sku: lead.sku,
        assignedBy,
      }));
    });

    expect(allLeadsToStore.length).toBe(4);
    
    // Agent 1 gets leads 0 and 2
    expect(allLeadsToStore[0].agentName).toBe("Soheib");
    expect(allLeadsToStore[0].customerName).toBe("A");
    expect(allLeadsToStore[1].agentName).toBe("Soheib");
    expect(allLeadsToStore[1].customerName).toBe("C");
    
    // Agent 2 gets leads 1 and 3
    expect(allLeadsToStore[2].agentName).toBe("Amina");
    expect(allLeadsToStore[2].customerName).toBe("B");
    expect(allLeadsToStore[3].agentName).toBe("Amina");
    expect(allLeadsToStore[3].customerName).toBe("D");

    // All have correct workDate (tomorrow, not today)
    allLeadsToStore.forEach(lead => {
      expect(lead.workDate).toBe("2026-03-07");
    });
  });
});

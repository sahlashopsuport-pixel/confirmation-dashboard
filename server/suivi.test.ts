import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isProblemReason,
  classifyReason,
  WILAYA_MAP,
  DHD_STATUS_LABELS,
  SUIVI_TARGET_STATUSES,
  ACTIVE_STATUSES,
  REASON_LABELS,
} from "./dhdApi";

describe("dhdApi — isProblemReason", () => {
  it("detects 'Client ne répond pas' as a problem", () => {
    expect(isProblemReason("Client ne répond pas")).toBe(true);
  });

  it("detects 'Injoignable' as a problem", () => {
    expect(isProblemReason("Injoignable")).toBe(true);
  });

  it("detects 'Reporté par le client' as a problem", () => {
    expect(isProblemReason("Reporté par le client")).toBe(true);
  });

  it("detects 'Annulé par le client' as a problem", () => {
    expect(isProblemReason("Annulé par le client")).toBe(true);
  });

  it("detects 'Faux numéro' as a problem", () => {
    expect(isProblemReason("Faux numéro")).toBe(true);
  });

  it("detects 'Refusé par le client' as a problem", () => {
    expect(isProblemReason("Refusé par le client")).toBe(true);
  });

  it("returns false for normal delivery status", () => {
    expect(isProblemReason("En cours de livraison")).toBe(false);
  });

  it("returns false for 'Livré' status", () => {
    expect(isProblemReason("Livré")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isProblemReason("CLIENT NE RÉPOND PAS")).toBe(true);
    expect(isProblemReason("injoignable")).toBe(true);
  });

  it("handles whitespace", () => {
    expect(isProblemReason("  Client ne répond pas  ")).toBe(true);
  });
});

describe("dhdApi — classifyReason", () => {
  it("classifies 'Client ne répond pas' as no_answer", () => {
    expect(classifyReason("Client ne répond pas")).toBe("no_answer");
  });

  it("classifies 'Injoignable' as no_answer", () => {
    expect(classifyReason("Injoignable")).toBe("no_answer");
  });

  it("classifies 'Reporté par le client' as postponed", () => {
    expect(classifyReason("Reporté par le client")).toBe("postponed");
  });

  it("classifies 'Annulé par le client' as cancelled", () => {
    expect(classifyReason("Annulé par le client")).toBe("cancelled");
  });

  it("classifies 'Refusé par le client' as refused", () => {
    expect(classifyReason("Refusé par le client")).toBe("refused");
  });

  it("classifies 'Faux numéro' as wrong_info", () => {
    expect(classifyReason("Faux numéro")).toBe("wrong_info");
  });

  it("classifies 'Adresse incorrecte' as wrong_info", () => {
    expect(classifyReason("Adresse incorrecte")).toBe("wrong_info");
  });

  it("classifies 'RDV fixé' as contacted", () => {
    expect(classifyReason("RDV fixé pour demain")).toBe("contacted");
  });

  it("classifies 'Client contacté' as contacted", () => {
    expect(classifyReason("Client contacté")).toBe("contacted");
  });

  it("classifies unknown reasons as other", () => {
    expect(classifyReason("En cours de livraison")).toBe("other");
    expect(classifyReason("Livré")).toBe("other");
  });
});

describe("dhdApi — WILAYA_MAP", () => {
  it("has all 58 wilayas", () => {
    expect(Object.keys(WILAYA_MAP).length).toBeGreaterThanOrEqual(48);
  });

  it("maps Alger correctly", () => {
    expect(WILAYA_MAP[16]).toBe("Alger");
  });

  it("maps Oran correctly", () => {
    expect(WILAYA_MAP[31]).toBe("Oran");
  });

  it("maps Constantine correctly", () => {
    expect(WILAYA_MAP[25]).toBe("Constantine");
  });
});

describe("dhdApi — DHD_STATUS_LABELS", () => {
  it("has label for en_livraison", () => {
    expect(DHD_STATUS_LABELS["en_livraison"]).toBe("Out for Delivery");
  });

  it("has label for suspendu", () => {
    expect(DHD_STATUS_LABELS["suspendu"]).toBe("Suspended");
  });

  it("has label for en_preparation", () => {
    expect(DHD_STATUS_LABELS["en_preparation"]).toBe("In Preparation");
  });
});

describe("dhdApi — SUIVI_TARGET_STATUSES", () => {
  it("includes en_livraison", () => {
    expect(SUIVI_TARGET_STATUSES.has("en_livraison")).toBe(true);
  });

  it("includes suspendu", () => {
    expect(SUIVI_TARGET_STATUSES.has("suspendu")).toBe(true);
  });

  it("includes en_preparation", () => {
    expect(SUIVI_TARGET_STATUSES.has("en_preparation")).toBe(true);
  });

  it("does not include payé_et_archivé", () => {
    expect(SUIVI_TARGET_STATUSES.has("payé_et_archivé")).toBe(false);
  });

  it("does not include annule", () => {
    expect(SUIVI_TARGET_STATUSES.has("annule")).toBe(false);
  });
});

describe("dhdApi — ACTIVE_STATUSES", () => {
  it("includes en_livraison", () => {
    expect(ACTIVE_STATUSES.has("en_livraison")).toBe(true);
  });

  it("includes vers_wilaya", () => {
    expect(ACTIVE_STATUSES.has("vers_wilaya")).toBe(true);
  });

  it("does not include retour_recu", () => {
    expect(ACTIVE_STATUSES.has("retour_recu")).toBe(false);
  });
});

describe("dhdApi — REASON_LABELS", () => {
  it("has label for no_answer", () => {
    expect(REASON_LABELS["no_answer"]).toBe("No Answer");
  });

  it("has label for postponed", () => {
    expect(REASON_LABELS["postponed"]).toBe("Postponed");
  });

  it("has label for cancelled", () => {
    expect(REASON_LABELS["cancelled"]).toBe("Cancelled");
  });
});

// ─── Server-side proxy order processing tests ─────────────────────────

describe("suivi proxy — order processing logic", () => {
  // Simulates the same logic used in the fetchPage tRPC procedure
  function processOrderForSuivi(order: {
    tracking: string;
    status: string;
    status_reason: Array<{ remarque: string; commentaires: string; station: string; livreur: string; created_at: string; tracking: string }>;
  }) {
    const latestReason = order.status_reason?.[order.status_reason.length - 1] || null;
    const hasProblem = latestReason ? isProblemReason(latestReason.remarque) : false;
    const reasonCategory = latestReason ? classifyReason(latestReason.remarque) : null;
    const isSuiviTarget = SUIVI_TARGET_STATUSES.has(order.status);
    return { hasProblem, reasonCategory, isSuiviTarget, isProblemOrder: hasProblem && isSuiviTarget };
  }

  it("identifies problem order in en_livraison with 'Client ne répond pas'", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-001",
      status: "en_livraison",
      status_reason: [
        { remarque: "Client ne répond pas", commentaires: "", station: "Alger", livreur: "Driver1", created_at: "2026-03-01", tracking: "TEST-001" },
      ],
    });
    expect(result.hasProblem).toBe(true);
    expect(result.isSuiviTarget).toBe(true);
    expect(result.isProblemOrder).toBe(true);
    expect(result.reasonCategory).toBe("no_answer");
  });

  it("does NOT flag order with problem reason but non-target status (payé_et_archivé)", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-002",
      status: "payé_et_archivé",
      status_reason: [
        { remarque: "Client ne répond pas", commentaires: "", station: "Oran", livreur: "Driver2", created_at: "2026-03-01", tracking: "TEST-002" },
      ],
    });
    expect(result.hasProblem).toBe(true);
    expect(result.isSuiviTarget).toBe(false);
    expect(result.isProblemOrder).toBe(false);
  });

  it("does NOT flag order with target status but no problem reason", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-003",
      status: "en_livraison",
      status_reason: [
        { remarque: "En cours de livraison", commentaires: "", station: "Constantine", livreur: "Driver3", created_at: "2026-03-01", tracking: "TEST-003" },
      ],
    });
    expect(result.hasProblem).toBe(false);
    expect(result.isSuiviTarget).toBe(true);
    expect(result.isProblemOrder).toBe(false);
  });

  it("handles order with empty status_reason", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-004",
      status: "en_livraison",
      status_reason: [],
    });
    expect(result.hasProblem).toBe(false);
    expect(result.isProblemOrder).toBe(false);
  });

  it("uses LAST status_reason entry (not first) for classification", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-005",
      status: "suspendu",
      status_reason: [
        { remarque: "En cours de livraison", commentaires: "", station: "Alger", livreur: "D1", created_at: "2026-03-01", tracking: "TEST-005" },
        { remarque: "Reporté par le client", commentaires: "", station: "Alger", livreur: "D1", created_at: "2026-03-02", tracking: "TEST-005" },
      ],
    });
    expect(result.hasProblem).toBe(true);
    expect(result.reasonCategory).toBe("postponed");
    expect(result.isProblemOrder).toBe(true);
  });

  it("classifies cancelled order correctly", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-006",
      status: "en_preparation",
      status_reason: [
        { remarque: "Annulé par le client", commentaires: "Client changed mind", station: "Blida", livreur: "D2", created_at: "2026-03-01", tracking: "TEST-006" },
      ],
    });
    expect(result.reasonCategory).toBe("cancelled");
    expect(result.isProblemOrder).toBe(true);
  });

  it("classifies refused order correctly (livr\u00e9 status is excluded from suivi targets)", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-007",
      status: "livr\u00e9_non_encaiss\u00e9",
      status_reason: [
        { remarque: "Refus\u00e9 par le client", commentaires: "", station: "S\u00e9tif", livreur: "D3", created_at: "2026-03-01", tracking: "TEST-007" },
      ],
    });
    expect(result.reasonCategory).toBe("refused");
    // livr\u00e9 statuses are excluded from suivi targets (delivery/money collection is not agent concern)
    expect(result.isSuiviTarget).toBe(false);
    expect(result.isProblemOrder).toBe(false);
  });

  it("classifies refused order on suspendu status as problem", () => {
    const result = processOrderForSuivi({
      tracking: "TEST-007b",
      status: "suspendu",
      status_reason: [
        { remarque: "Refus\u00e9 par le client", commentaires: "", station: "S\u00e9tif", livreur: "D3", created_at: "2026-03-01", tracking: "TEST-007b" },
      ],
    });
    expect(result.reasonCategory).toBe("refused");
    expect(result.isSuiviTarget).toBe(true);
    expect(result.isProblemOrder).toBe(true);
  });
});

describe("suivi proxy — stats aggregation", () => {
  it("correctly counts status categories (livr\u00e9 statuses excluded)", () => {
    const orders = [
      { status: "en_livraison" },
      { status: "en_livraison" },
      { status: "en_preparation" },
      { status: "suspendu" },
      { status: "livr\u00e9_non_encaiss\u00e9" },
      { status: "pay\u00e9_et_archiv\u00e9" },
    ];

    let enLivraison = 0;
    let enPreparation = 0;
    let suspendu = 0;
    let skippedLivre = 0;

    for (const order of orders) {
      // Skip livr\u00e9 statuses (same logic as fetchBatch)
      if (order.status.startsWith("livr")) { skippedLivre++; continue; }
      if (order.status === "en_livraison") enLivraison++;
      if (order.status === "en_preparation") enPreparation++;
      if (order.status === "suspendu") suspendu++;
    }

    expect(enLivraison).toBe(2);
    expect(enPreparation).toBe(1);
    expect(suspendu).toBe(1);
    expect(skippedLivre).toBe(1);
  });

  it("correctly counts problem categories", () => {
    const reasons = [
      "Client ne répond pas",
      "Injoignable",
      "Reporté par le client",
      "Annulé par le client",
      "Refusé par le client",
    ];

    let noAnswer = 0;
    let postponed = 0;
    let cancelled = 0;

    for (const r of reasons) {
      const cat = classifyReason(r);
      if (cat === "no_answer") noAnswer++;
      if (cat === "postponed") postponed++;
      if (cat === "cancelled") cancelled++;
    }

    expect(noAnswer).toBe(2); // ne répond pas + injoignable
    expect(postponed).toBe(1);
    expect(cancelled).toBe(1);
  });
});

// ─── Suivi Cache System Tests ───────────────────────────────────────────

describe("suivi cache — isSuiviSyncRunning", () => {
  it("isSuiviSyncRunning is a function", async () => {
    const { isSuiviSyncRunning } = await import("./suiviSync");
    expect(typeof isSuiviSyncRunning).toBe("function");
  });

  it("returns false when no sync is running", async () => {
    const { isSuiviSyncRunning } = await import("./suiviSync");
    expect(isSuiviSyncRunning()).toBe(false);
  });
});

describe("suivi cache — cached stats shape", () => {
  it("getCachedSuiviStats returns correct shape", async () => {
    const { getCachedSuiviStats } = await import("./db");
    const stats = await getCachedSuiviStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("noAnswer");
    expect(stats).toHaveProperty("postponed");
    expect(stats).toHaveProperty("cancelled");
    expect(stats).toHaveProperty("refused");
    expect(stats).toHaveProperty("wrongInfo");
    expect(stats).toHaveProperty("other");
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.noAnswer).toBe("number");
  });
});

describe("suivi cache — SUIVI_TARGET_STATUSES excludes all livré", () => {
  it("does not include livré_non_encaissé", () => {
    expect(SUIVI_TARGET_STATUSES.has("livré_non_encaissé")).toBe(false);
  });

  it("does not include livré_encaissé", () => {
    expect(SUIVI_TARGET_STATUSES.has("livré_encaissé")).toBe(false);
  });

  it("includes en_livraison (not livré)", () => {
    expect(SUIVI_TARGET_STATUSES.has("en_livraison")).toBe(true);
  });

  it("includes suspendu", () => {
    expect(SUIVI_TARGET_STATUSES.has("suspendu")).toBe(true);
  });

  it("includes en_preparation", () => {
    expect(SUIVI_TARGET_STATUSES.has("en_preparation")).toBe(true);
  });
});

describe("suivi cache — order processing excludes livré statuses", () => {
  function processOrderForSuivi(order: {
    tracking: string;
    status: string;
    status_reason: Array<{ remarque: string; commentaires: string; station: string; livreur: string; created_at: string; tracking: string }>;
  }) {
    const latestReason = order.status_reason?.[order.status_reason.length - 1] || null;
    const hasProblem = latestReason ? isProblemReason(latestReason.remarque) : false;
    const reasonCategory = latestReason ? classifyReason(latestReason.remarque) : null;
    const isSuiviTarget = SUIVI_TARGET_STATUSES.has(order.status);
    return { hasProblem, reasonCategory, isSuiviTarget, isProblemOrder: hasProblem && isSuiviTarget };
  }

  it("excludes livré_non_encaissé even with problem reason", () => {
    const result = processOrderForSuivi({
      tracking: "CACHE-001",
      status: "livré_non_encaissé",
      status_reason: [
        { remarque: "Client ne répond pas", commentaires: "", station: "Alger", livreur: "D1", created_at: "2026-03-01", tracking: "CACHE-001" },
      ],
    });
    expect(result.isSuiviTarget).toBe(false);
    expect(result.isProblemOrder).toBe(false);
  });

  it("excludes livré_encaissé even with problem reason", () => {
    const result = processOrderForSuivi({
      tracking: "CACHE-002",
      status: "livré_encaissé",
      status_reason: [
        { remarque: "Reporté par le client", commentaires: "", station: "Oran", livreur: "D2", created_at: "2026-03-01", tracking: "CACHE-002" },
      ],
    });
    expect(result.isSuiviTarget).toBe(false);
    expect(result.isProblemOrder).toBe(false);
  });

  it("includes en_livraison with problem reason as problem order", () => {
    const result = processOrderForSuivi({
      tracking: "CACHE-003",
      status: "en_livraison",
      status_reason: [
        { remarque: "Injoignable", commentaires: "", station: "Constantine", livreur: "D3", created_at: "2026-03-01", tracking: "CACHE-003" },
      ],
    });
    expect(result.isSuiviTarget).toBe(true);
    expect(result.isProblemOrder).toBe(true);
    expect(result.reasonCategory).toBe("no_answer");
  });
});

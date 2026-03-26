import { describe, expect, it } from "vitest";
import { applyPlaybook, executePlaybookOnPacketJson } from "../src/modules/playbook/playbook.executor.js";
import type { Playbook } from "../src/modules/playbook/playbook.types.js";
import type { PriorAuthPacketJson } from "../src/types/packet.js";
import { PACKET_SCHEMA_VERSION } from "../src/types/packet.js";

const basePlaybook = (overrides: Partial<Playbook> = {}): Playbook => ({
  id: "pb-1",
  payerId: "payer-1",
  strategy: {},
  documentRules: {},
  escalationRules: {},
  version: 1,
  ...overrides,
});

describe("applyPlaybook", () => {
  it("appends LMN additions immutably to source packet", () => {
    const packet = {
      attachments: [{ type: "LMN", content: "base" }],
    };
    const playbook = basePlaybook({
      documentRules: { lmnAdditions: ["extra line"] },
    });
    const out = applyPlaybook(packet, playbook);
    expect(packet.attachments[0].content).toBe("base");
    expect(out.updatedPacket.attachments[0].content).toContain("extra line");
    expect(out.updatedPacket.attachments[0].content).toContain("playbookId=pb-1");
    expect(out.textAmendments).toHaveLength(1);
    expect(out.textAmendments[0].addition).toBe("extra line");
    expect(out.modifications.some((m) => m.includes("LMN modified"))).toBe(true);
  });

  it("reports missing required document types", () => {
    const packet = { attachments: [{ type: "LMN", content: "x" }] };
    const playbook = basePlaybook({
      strategy: { requiredDocuments: ["SWO"] },
    });
    const out = applyPlaybook(packet, playbook);
    expect(out.modifications).toContain("Missing required document: SWO");
  });
});

describe("executePlaybookOnPacketJson", () => {
  it("maps documents through applyPlaybook and lists modified ids", () => {
    const view: PriorAuthPacketJson = {
      schemaVersion: PACKET_SCHEMA_VERSION,
      packetId: "pkt-1",
      caseId: "c-1",
      status: "DRAFT",
      deviceType: null,
      generatedAt: new Date().toISOString(),
      documentIds: ["d-lmn"],
      snapshotHash: null,
      generationVersion: 1,
      documents: [
        {
          type: "LMN",
          templateId: "t-lmn",
          docVersion: 1,
          renderedText: "body",
          provenance: {},
        },
      ],
      documentsByType: {},
      traceabilityNote: "",
    };
    const playbook = basePlaybook({
      documentRules: { lmnAdditions: ["from playbook"] },
    });
    const exec = executePlaybookOnPacketJson(playbook, view);
    expect(exec.modifiedDocumentIds).toContain("d-lmn");
    expect(exec.updatedPacket.documents[0].renderedText).toContain("from playbook");
    expect(exec.textAmendments.length).toBeGreaterThan(0);
    expect(view.documents[0].renderedText).toBe("body");
  });
});

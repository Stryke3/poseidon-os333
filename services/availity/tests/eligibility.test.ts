import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { createAvailityController } from "../src/modules/availity/availity.controller.js";
import { AvailityError } from "../src/lib/errors.js";

const mockGetEligibility = vi.fn();

vi.mock("../src/client/availity-client.js", () => ({
  availityClient: {
    getEligibility: (...args: unknown[]) => mockGetEligibility(...args),
  },
}));

const mockPrisma = {
  case: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  eligibilityCheck: {
    create: vi.fn(),
  },
} as unknown as PrismaClient;

function buildApp() {
  const app = express();
  app.use(express.json());
  const h = createAvailityController(mockPrisma);
  app.post("/", h.checkEligibility);
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "Validation failed",
          details: err.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }
      if (err instanceof AvailityError) {
        const status = err.statusCode >= 500 ? 502 : err.statusCode;
        res.status(status).json({
          error: err.message,
          statusCode: err.statusCode,
        });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    },
  );
  return app;
}

async function post(app: express.Express, body: unknown) {
  const { createServer } = await import("http");
  return new Promise<{ status: number; body: Record<string, unknown> }>(
    (resolve) => {
      const server = createServer(app);
      server.listen(0, async () => {
        const addr = server.address() as { port: number };
        try {
          const res = await fetch(`http://127.0.0.1:${addr.port}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          resolve({ status: res.status, body: json });
        } finally {
          server.close();
        }
      });
    },
  );
}

const validBody = {
  payerId: "AETNA",
  memberId: "MEM123",
  patient: {
    firstName: "John",
    lastName: "Doe",
    dob: "1990-01-15",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /eligibility (handlers)", () => {
  it("returns 400 for missing fields", async () => {
    const app = buildApp();
    const res = await post(app, { patient: { firstName: "John" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns normalized eligibility on success", async () => {
    const caseRecord = { id: "case-1" };
    (mockPrisma.case.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (mockPrisma.case.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      caseRecord,
    );
    (mockPrisma.eligibilityCheck.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: "check-1" },
    );

    mockGetEligibility.mockResolvedValue({
      success: true,
      coverageActive: true,
      payerName: "Aetna",
      memberId: "MEM123",
      planName: "Gold",
      deductible: 1500,
      deductibleRemaining: 800,
      authRequired: false,
      rawResponse: {},
    });

    const app = buildApp();
    const res = await post(app, validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.coverageActive).toBe(true);
    expect(res.body.caseId).toBe("case-1");
    expect(res.body.payerName).toBe("Aetna");
  });

  it("reuses existing case if found", async () => {
    const existing = { id: "existing-case" };
    (mockPrisma.case.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      existing,
    );
    (mockPrisma.eligibilityCheck.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: "check-2" },
    );

    mockGetEligibility.mockResolvedValue({
      success: true,
      coverageActive: true,
      payerName: null,
      memberId: null,
      planName: null,
      deductible: null,
      deductibleRemaining: null,
      authRequired: null,
      rawResponse: {},
    });

    const app = buildApp();
    const res = await post(app, {
      ...validBody,
      patient: {
        firstName: "Jane",
        lastName: "Smith",
        dob: "1985-06-20",
      },
      memberId: "SM456",
      payerId: "BCBS",
    });

    expect(res.status).toBe(200);
    expect(res.body.caseId).toBe("existing-case");
    expect(mockPrisma.case.create).not.toHaveBeenCalled();
  });

  it("returns 404 when caseId is unknown", async () => {
    (mockPrisma.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const app = buildApp();
    const res = await post(app, {
      caseId: "00000000-0000-0000-0000-000000000000",
      ...validBody,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Case not found");
    expect(mockPrisma.case.findFirst).not.toHaveBeenCalled();
  });

  it("uses existing case when caseId is valid", async () => {
    const existing = { id: "by-id-case" };
    (mockPrisma.case.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      existing,
    );
    (mockPrisma.eligibilityCheck.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: "check-3" },
    );

    mockGetEligibility.mockResolvedValue({
      success: true,
      coverageActive: true,
      payerName: null,
      memberId: null,
      planName: null,
      deductible: null,
      deductibleRemaining: null,
      authRequired: null,
      rawResponse: {},
    });

    const app = buildApp();
    const res = await post(app, {
      caseId: "by-id-case",
      ...validBody,
    });

    expect(res.status).toBe(200);
    expect(res.body.caseId).toBe("by-id-case");
    expect(mockPrisma.case.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.case.create).not.toHaveBeenCalled();
  });
});

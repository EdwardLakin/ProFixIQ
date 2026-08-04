import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuickBooksApiBaseUrl } from "@/features/integrations/quickbooks/server/env";
import { quickBooksFetch } from "@/features/integrations/quickbooks/server/http";
import type { QuickBooksConnectionRow } from "@/features/integrations/quickbooks/types";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function connection(
  environment: "sandbox" | "production",
): QuickBooksConnectionRow {
  return {
    environment,
    realm_id: "test-realm",
    access_token: "test-access-token",
  } as QuickBooksConnectionRow;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuickBooks and AI secondary-operation contracts", () => {
  it("routes accounting calls to the connected company's environment", () => {
    expect(getQuickBooksApiBaseUrl("sandbox")).toBe(
      "https://sandbox-quickbooks.api.intuit.com",
    );
    expect(getQuickBooksApiBaseUrl("production")).toBe(
      "https://quickbooks.api.intuit.com",
    );
    expect(() => getQuickBooksApiBaseUrl("invalid")).toThrow(
      "Unsupported QuickBooks environment",
    );
  });

  it("captures safe QuickBooks HTTP diagnostics without logging query contents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Fault: {
            type: "ValidationFault",
            Error: [
              {
                code: "6000",
                Message: "A business validation error occurred.",
                Detail: "Customer could not be found.",
              },
            ],
          },
        }),
        {
          status: 400,
          statusText: "Bad Request",
          headers: { intuit_tid: "request-123" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const request = quickBooksFetch(
      connection("sandbox"),
      "/query?query=select%20customer-secret",
      { method: "GET" },
    );

    await expect(request).rejects.toMatchObject({
      name: "QuickBooksApiError",
      details: {
        status: 400,
        requestId: "request-123",
        faultType: "ValidationFault",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-quickbooks.api.intuit.com/v3/company/test-realm/query?query=select%20customer-secret",
      expect.any(Object),
    );
    expect(errorLog).toHaveBeenCalledWith(
      "[quickbooks/http] request failed",
      expect.objectContaining({
        environment: "sandbox",
        resource: "/query",
        status: 400,
      }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("customer-secret");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("test-access-token");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("test-realm");
  });

  it("surfaces audit insert failures and persists safe HTTP failure metadata", () => {
    const sync = source(
      "features/integrations/quickbooks/server/syncInvoice.ts",
    );
    expect(sync).toContain(
      'const { error } = await supabase.from("quickbooks_sync_events").insert(payload)',
    );
    expect(sync).toContain("[quickbooks/sync-audit] insert failed");
    expect(sync).toContain("response_payload: quickBooksFailurePayload(error)");
  });

  it("uses the current completion-token parameter for work-order suggestions", () => {
    const route = source("app/api/work-orders/suggest-lines/route.ts");
    expect(route).toContain("max_completion_tokens: policy.maxTokens");
    expect(route).not.toContain("max_tokens: policy.maxTokens");
  });
});

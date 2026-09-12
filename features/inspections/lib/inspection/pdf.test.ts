import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { generateInspectionPDF } from "./pdf";
import type { InspectionSession } from "./types";

// 1x1 transparent PNG — enough to prove the signature image embeds.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function session(): InspectionSession {
  return {
    templateName: "Annual vehicle inspection",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    isListening: false,
    status: "completed",
    started: true,
    completed: true,
    isPaused: false,
    customer: {
      business_name: "Example Fleet",
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
    },
    vehicle: {
      year: "2024",
      make: "Ford",
      model: "F-550",
      vin: "TESTVIN",
      license_plate: null,
      mileage: "42,000 km",
      color: null,
    },
    sections: [
      {
        title: "Brakes",
        items: [
          { item: "Front pads", status: "ok", value: "8", unit: "mm" },
          {
            item: "Rear pads",
            status: "fail",
            notes: "Below service limit",
            recommend: ["Replace rear pads"],
          },
        ],
      },
    ],
  };
}

/**
 * pdf-lib deflates page content streams and writes drawn strings as hex
 * literals, so the visible text is only readable after inflating every stream
 * and decoding those literals back to characters.
 */
function renderedText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const haystack = raw.toString("latin1");
  const chunks: string[] = [];

  const streamToken = "stream";
  let cursor = 0;
  for (;;) {
    const start = haystack.indexOf(streamToken, cursor);
    if (start === -1) break;
    cursor = start + streamToken.length;
    // Skip the tail of an "endstream" keyword, which also contains "stream".
    if (haystack.slice(start - 3, start) === "end") continue;

    let bodyStart = cursor;
    if (haystack[bodyStart] === "\r") bodyStart += 1;
    if (haystack[bodyStart] === "\n") bodyStart += 1;

    const end = haystack.indexOf("endstream", bodyStart);
    if (end === -1) break;

    try {
      chunks.push(inflateSync(raw.subarray(bodyStart, end)).toString("latin1"));
    } catch {
      // Not a deflate stream (e.g. an embedded image); nothing to read.
    }
    cursor = end;
  }

  return chunks
    .join("\n")
    .replace(/<([0-9A-Fa-f]+)>/g, (match, hex: string) =>
      hex.length % 2 === 0 ? Buffer.from(hex, "hex").toString("latin1") : match,
    );
}

describe("generateInspectionPDF", () => {
  it("renders the shop's own name instead of the platform fallback", async () => {
    const text = renderedText(
      await generateInspectionPDF(session(), { shopName: "Northside Truck" }),
    );
    expect(text).toContain("Northside Truck");
    expect(text).not.toContain("ProFixIQ");
  });

  it("falls back to the platform name only when no shop name is resolved", async () => {
    const text = renderedText(await generateInspectionPDF(session()));
    expect(text).toContain("ProFixIQ");
  });

  it("renders a signature block for each recorded signature", async () => {
    const bytes = await generateInspectionPDF(session(), {
      shopName: "Northside Truck",
      signatures: [
        {
          role: "technician",
          signedName: "Dana Whitfield",
          signedAt: "2026-03-04T17:45:00.000Z",
          signatureHash: "abcdef0123456789abcdef",
          imageBytes: new Uint8Array(PNG_1X1),
        },
        {
          role: "customer",
          signedName: "Example Fleet Ltd.",
          signedAt: "2026-03-04T18:02:00.000Z",
          signatureHash: null,
          imageBytes: null,
        },
      ],
    });
    const text = renderedText(bytes);

    expect(text).toContain("Signatures");
    expect(text).toContain("Technician");
    expect(text).toContain("Dana Whitfield");
    expect(text).toContain("Customer");
    expect(text).toContain("Example Fleet Ltd.");
    // The signed timestamp is stamped in an unambiguous zone.
    expect(text).toContain("UTC");
    expect(text).toContain("Signature reference abcdef0123456789");
    // A role with no drawn signature is labelled rather than left blank.
    expect(text).toContain("Typed acknowledgement");
  });

  it("states plainly when an inspection carries no signature", async () => {
    const text = renderedText(
      await generateInspectionPDF(session(), { shopName: "Northside Truck" }),
    );
    expect(text).toContain("Signatures");
    expect(text).toContain("No signature has been recorded");
  });

  it("rejects a malformed image instead of stalling the renderer", async () => {
    // Header-valid PNG bytes with a corrupt chunk table: pdf-lib's decoder
    // loops forever on these rather than throwing, so the report must reject
    // them structurally first.
    const corruptPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAAAjfjFJAAABtUlEQVR4nO3av0oDQRTG4W9jYyNWFlZWFlZWFlY2NjY2NjY2giCCIAgWFhZWVlZWFlYWVhZWFlYWVhZWFhaCIAiCIAiCIIggCIIgCIIgCIIgCIIgiCAIgiAIgiAIIgiCIAiCIAiCIAiCIAiCIIggCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIgCIIg+AGnAAF3kQF3AAAAAElFTkSuQmCC",
      "base64",
    );

    const started = Date.now();
    const bytes = await generateInspectionPDF(session(), {
      shopName: "Northside Truck",
      signatures: [
        {
          role: "technician",
          signedName: "Dana Whitfield",
          signedAt: "2026-03-04T17:45:00.000Z",
          signatureHash: null,
          imageBytes: new Uint8Array(corruptPng),
        },
      ],
    });

    expect(Date.now() - started).toBeLessThan(5_000);
    const text = renderedText(bytes);
    expect(text).toContain("Dana Whitfield");
    expect(text).toContain("Signature image unavailable");
  }, 15_000);

  it("still produces a report when a signature image cannot be decoded", async () => {
    const bytes = await generateInspectionPDF(session(), {
      shopName: "Northside Truck",
      signatures: [
        {
          role: "technician",
          signedName: "Dana Whitfield",
          signedAt: "2026-03-04T17:45:00.000Z",
          signatureHash: null,
          imageBytes: new Uint8Array([1, 2, 3, 4]),
        },
      ],
    });
    const text = renderedText(bytes);

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(text).toContain("Dana Whitfield");
    expect(text).toContain("Signature image unavailable");
  });
});

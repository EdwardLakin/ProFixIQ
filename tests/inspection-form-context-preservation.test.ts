import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INSPECTION_FORM_IMPORT_FORMAT_VERSION,
  inspectionFormContextValueKey,
  isInspectionFormContextEmpty,
  mergeInspectionFormContexts,
  normalizeInspectionFormContext,
  selectInspectionFormContext,
  selectRunnableInspectionFormSections,
} from "../features/inspections/lib/form-import";
import { assembleInspectionReport } from "../features/inspections/lib/inspection/report";
import { hasMeaningfulInspectionProgress } from "../features/inspections/lib/inspection/reconciliation";
import type { InspectionSession } from "../features/inspections/lib/inspection/types";

const calgary = JSON.parse(
  readFileSync(
    resolve(__dirname, "fixtures/inspection-form-import/calgary-x505-ocr.json"),
    "utf8",
  ),
) as { sections: unknown };

const context = () =>
  selectInspectionFormContext(
    calgary.sections,
    INSPECTION_FORM_IMPORT_FORMAT_VERSION,
  );

describe("imported form context preservation", () => {
  it("keeps the trip and vehicle record the checklist cannot express", () => {
    const header = context()
      .header.flatMap((section) => section.items)
      .map((item) => item.item);

    // Without these the import is a checklist, not the operator's trip report.
    expect(header).toContain("Unit Number");
    expect(header).toContain("Trailer Unit Number");
    expect(header).toContain("Odometer Reading Start");
    expect(header).toContain("Hour Meter Stop");
    expect(header).toContain("Location of Inspection");
    expect(header).toContain("Time of Inspection (24 hr)");
  });

  it("keeps the regulatory declaration and the completion block", () => {
    const preserved = context();

    expect(
      preserved.notices.flatMap((section) => section.items).map((i) => i.item),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("NSC Standard 13"),
        "No Defects Found During Pre-Trip Inspection.",
      ]),
    );
    expect(
      preserved.completion
        .flatMap((section) => section.items)
        .map((i) => i.item),
    ).toEqual(
      expect.arrayContaining([
        "Driver's Name (Print)",
        "Driver's Signature",
        "Mechanic's Signature",
        "Work Order #",
      ]),
    );
    expect(
      preserved.notes.flatMap((section) => section.items).map((i) => i.item),
    ).toContain("Post Trip Inspection");
  });

  it("never duplicates a row into both the checklist and the context", () => {
    const runnableLabels = new Set(
      selectRunnableInspectionFormSections(
        calgary.sections,
        INSPECTION_FORM_IMPORT_FORMAT_VERSION,
      )
        .flatMap((section) => section.items)
        .map((item) => item.item),
    );
    const preserved = context();
    const contextLabels = Object.values(preserved).flatMap((sections) =>
      sections.flatMap((section) => section.items.map((item) => item.item)),
    );

    for (const label of contextLabels) {
      expect(runnableLabels.has(label)).toBe(false);
    }
    expect(contextLabels.length + runnableLabels.size).toBe(87);
  });

  it("keeps the printed section title on each preserved block", () => {
    expect(context().completion.map((section) => section.title)).toEqual([
      "Driver completion",
      "Corrective Action",
    ]);
  });

  it("contributes no context for legacy unclassified pages", () => {
    const legacy = selectInspectionFormContext([
      { title: "General", items: [{ item: "Brakes" }, { item: "Lights" }] },
    ]);
    expect(isInspectionFormContextEmpty(legacy)).toBe(true);
  });

  it("survives a round trip through persistence", () => {
    const roundTripped = normalizeInspectionFormContext(
      JSON.parse(JSON.stringify(context())),
    );
    expect(roundTripped).toEqual(context());
  });

  it("merges multi-page imports without losing a page's blocks", () => {
    const merged = mergeInspectionFormContexts([
      context(),
      selectInspectionFormContext(
        [
          {
            title: "Page two completion",
            items: [{ item: "Supervisor Signature", field_type: "signature" }],
          },
        ],
        INSPECTION_FORM_IMPORT_FORMAT_VERSION,
      ),
    ]);

    expect(merged.completion.map((section) => section.title)).toEqual([
      "Driver completion",
      "Corrective Action",
      "Page two completion",
    ]);
  });

  it("prints captured header and signature values on the report", () => {
    const preserved = context();
    const session = {
      templateName: "Operator's Vehicle Trip Inspection Report",
      sections: [],
      currentSectionIndex: 0,
      currentItemIndex: 0,
      isListening: false,
      status: "completed",
      started: true,
      completed: true,
      isPaused: false,
      formContext: preserved,
      formContextValues: {
        [inspectionFormContextValueKey(
          "header",
          0,
          "Vehicle and trip record",
          "Unit Number",
        )]: "4412",
        [inspectionFormContextValueKey(
          "completion",
          0,
          "Driver completion",
          "Driver's Name (Print)",
        )]: "J. Nguyen",
      },
    } as unknown as InspectionSession;

    const report = assembleInspectionReport(session);
    const captured = report.formContext.flatMap((section) =>
      section.items.map((item) => [item.label, item.value] as const),
    );

    expect(captured).toContainEqual(["Unit Number", "4412"]);
    expect(captured).toContainEqual(["Driver's Name (Print)", "J. Nguyen"]);
    // An uncaptured field still appears, so the report shows the whole form.
    expect(captured).toContainEqual(["Location of Inspection", null]);
  });

  it("treats typed header values as real inspection progress", () => {
    const base = {
      sections: [],
      currentSectionIndex: 0,
      currentItemIndex: 0,
      isListening: false,
      status: "in_progress",
      started: true,
      completed: false,
      isPaused: false,
    };

    // On an imported form the trip header is filled in before any checklist
    // row is marked. Treating that session as empty loses the typed values.
    expect(
      hasMeaningfulInspectionProgress({
        ...base,
        formContextValues: {
          [inspectionFormContextValueKey(
            "header",
            0,
            "Vehicle and trip record",
            "Unit Number",
          )]: "4412",
        },
      } as unknown as InspectionSession),
    ).toBe(true);

    expect(
      hasMeaningfulInspectionProgress({
        ...base,
        formContextValues: { "header::0::Trip::Unit Number": "   " },
      } as unknown as InspectionSession),
    ).toBe(false);
  });

  it("only stages preserved context for the template it came from", () => {
    const runPage = readFileSync(
      resolve(
        __dirname,
        "../features/inspections/app/inspection/run/page.tsx",
      ),
      "utf8",
    );
    const screen = readFileSync(
      resolve(
        __dirname,
        "../features/inspections/screens/GenericInspectionScreen.tsx",
      ),
      "utf8",
    );

    // sessionStorage outlives one inspection and every other launcher stages
    // inspection:sections without knowing this key exists, so an unstamped
    // value would print one customer's trip header on another's report.
    expect(runPage).toContain("{ templateId: data.id, context: formContext }");
    expect(screen).toContain("stagedTemplateId !== runningTemplateId");
  });

  it("flushes a pending review edit before approving", () => {
    const review = readFileSync(
      resolve(
        __dirname,
        "../features/inspections/components/InspectionFormImportReview.tsx",
      ),
      "utf8",
    );

    // Approval reads the preserved context back from the saved import, so an
    // edit still sitting in the debounce window has to land first. Clearing
    // dirty would cancel that save instead of completing it.
    expect(review).toContain("if (dirty && !(await saveReview())) return;");
  });

  it("keys captured values so repeated printed labels stay distinct", () => {
    // Calgary prints "Date (yyyy/mm/dd)" in both the trip header and the
    // corrective-action block. They must not collide.
    expect(
      inspectionFormContextValueKey(
        "header",
        0,
        "Vehicle and trip record",
        "Date (yyyy/mm/dd)",
      ),
    ).not.toBe(
      inspectionFormContextValueKey(
        "completion",
        1,
        "Corrective Action",
        "Date (yyyy/mm/dd)",
      ),
    );

    // A multi-page import can contribute two same-titled sections to one
    // block. Those are different printed fields and must stay separate.
    expect(
      inspectionFormContextValueKey("notes", 0, "Defect details", "Remarks"),
    ).not.toBe(
      inspectionFormContextValueKey("notes", 1, "Defect details", "Remarks"),
    );
  });
});

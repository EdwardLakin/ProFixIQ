import { describe, expect, it } from "vitest";

import {
  normalizeInspectionFormSections,
  selectRunnableInspectionFormSections,
} from "../features/inspections/lib/form-import";

describe("inspection form import shaping", () => {
  it("keeps Rundle-style defect rows and removes filled/admin paper-form content", () => {
    const source = [
      {
        title: "Header",
        items: [
          { item: "Rundle College Society", field_type: "branding" },
          { item: "Attention to Excellence", field_type: "branding" },
        ],
      },
      {
        title: "Vehicle Daily Inspection Report",
        items: [
          {
            item: "Vehicle's Name or Unit Number",
            field_type: "identity",
          },
          { item: "Licence Plate Number", field_type: "identity" },
          { item: "Odometer Reading", field_type: "identity" },
        ],
      },
      {
        title: "Inspection statement",
        items: [
          {
            item: "I performed an inspection of the vehicle noted above",
            field_type: "instruction",
          },
          {
            item: "No defect was found that would likely affect safety",
            field_type: "instruction",
          },
        ],
      },
      {
        title: "Defect checklist",
        items: [
          { item: "1. Accessibility Devices", field_type: "defect" },
          { item: "2. Air Brake System", field_type: "defect" },
          { item: "23. Tires", field_type: "defect" },
          {
            item: "24. Wheels, Hubs and fasteners",
            field_type: "defect",
          },
        ],
      },
      {
        title: "Provide details of defect(s)",
        items: [
          { item: "Provide details of defect(s)", field_type: "text" },
        ],
      },
      {
        title: "Completion",
        items: [
          {
            item: "Name of person completing inspection (PRINT)",
            field_type: "signature",
          },
          {
            item: "Signature of person completing inspection",
            field_type: "signature",
          },
          { item: "Date and time completed", field_type: "signature" },
        ],
      },
      {
        title: "Trips Taken on This Day",
        items: [
          { item: "Driver Name", field_type: "trip" },
          { item: "Odometer Start", field_type: "trip" },
          { item: "Odometer Finish", field_type: "trip" },
          { item: "Kilometres Driven", field_type: "trip" },
          { item: "Observations", field_type: "trip" },
        ],
      },
    ];

    const normalized = normalizeInspectionFormSections(source);
    expect(normalized[1]?.items[0]).toMatchObject({
      item: "Vehicle's Name or Unit Number",
      unit: null,
      fieldType: "identity",
    });

    const runnable = selectRunnableInspectionFormSections(source);
    expect(runnable).toEqual([
      {
        title: "Defect checklist",
        items: [
          {
            item: "1. Accessibility Devices",
            unit: null,
            fieldType: "defect",
          },
          {
            item: "2. Air Brake System",
            unit: null,
            fieldType: "defect",
          },
          { item: "23. Tires", unit: null, fieldType: "defect" },
          {
            item: "24. Wheels, Hubs and fasteners",
            unit: null,
            fieldType: "defect",
          },
        ],
      },
    ]);

    const runnableText = JSON.stringify(runnable);
    expect(runnableText).not.toContain("Rundle College");
    expect(runnableText).not.toContain("Odometer Start");
    expect(runnableText).not.toContain("Signature of person");
    expect(runnableText).not.toContain("No defect was found");
  });

  it("keeps physical measurements but rejects administrative readings", () => {
    const runnable = selectRunnableInspectionFormSections([
      {
        title: "Measurements",
        items: [
          { item: "Brake lining thickness", unit: "mm", kind: "measurement" },
          { item: "Push rod travel", unit: "in", kind: "measurement" },
          { item: "Odometer Reading", unit: "km", kind: "identity" },
        ],
      },
    ]);

    expect(runnable).toEqual([
      {
        title: "Measurements",
        items: [
          {
            item: "Brake lining thickness",
            unit: "mm",
            fieldType: "measurement",
          },
          {
            item: "Push rod travel",
            unit: "in",
            fieldType: "measurement",
          },
        ],
      },
    ]);
  });

  it("preserves old unclassified imports for backward-compatible review", () => {
    const legacy = [
      { title: "General", items: [{ item: "Brakes" }, { item: "Lights" }] },
    ];

    expect(selectRunnableInspectionFormSections(legacy)).toEqual([
      {
        title: "General",
        items: [
          { item: "Brakes", unit: null },
          { item: "Lights", unit: null },
        ],
      },
    ]);
  });
});

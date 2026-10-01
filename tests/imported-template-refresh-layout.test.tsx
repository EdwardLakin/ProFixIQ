import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: unknown[] = [];

const template = {
  template_name: "Hansen's Quarterly Inspection - Tractor",
  vehicle_type: "truck",
  labor_hours: null,
  tags: ["customer-form"],
  sections: [
    { title: "Air Brakes", items: [{ item: "Brake Chambers", unit: null, fieldType: "check" }] },
    { title: "Tires & Wheels", items: [{ item: "Tire Tread Depth", unit: null, fieldType: "check" }] },
  ],
  form_context: {
    header: [
      { title: "Certificate of Inspection", items: [{ item: "Date of Inspection" }, { item: "License#" }] },
      { title: "Page 1 of 2", items: [{ item: "Page 1 of 2" }] },
    ],
    notices: [],
    notes: [],
    completion: [],
    branding: [],
  },
};

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("templateId=tpl-1"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/inspections/app/inspection/custom-draft/page", () => ({
  default: () => null,
}));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: template, error: null }) }),
      }),
      update: (payload: unknown) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

import InspectionTemplateEditRouter from "@/features/inspections/components/InspectionTemplateEditRouter";

beforeEach(() => {
  updates.length = 0;
});

describe("refresh layout on a saved imported template", () => {
  it("previews, applies, and saves sections with grid markers plus the reshaped context", async () => {
    render(<InspectionTemplateEditRouter surface="shop" />);

    await screen.findByText("Refresh layout");
    // the preview names what will change before anything is applied
    expect(await screen.findByText(/Move \d+ certificate field/i)).toBeTruthy();
    expect(screen.getByText(/Remove \d+ page marker/i)).toBeTruthy();
    expect(screen.queryByDisplayValue("Corner Grid (Air)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apply refreshed layout" }));
    expect(await screen.findByDisplayValue("Corner Grid (Air)")).toBeTruthy();
    expect(screen.getByDisplayValue("Tire Grid — Air Brake (HD)")).toBeTruthy();
    // applied: nothing further to do
    expect(screen.getByText(/already matches the current layout/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updates).toHaveLength(1));

    const saved = updates[0] as {
      sections: Array<{ title: string; generatedGrid?: { kind: string; brakeMode: string } }>;
      form_context: { completion: Array<{ items: Array<{ item: string }> }>; header: unknown[] };
    };
    expect(saved.sections.filter((s) => s.generatedGrid).map((s) => s.generatedGrid)).toEqual([
      { kind: "brake", brakeMode: "air" },
      { kind: "tire", brakeMode: "air" },
    ]);
    expect(saved.form_context.completion[0].items.map((i) => i.item)).toEqual([
      "Date of Inspection", "License#",
    ]);
    expect(JSON.stringify(saved.form_context)).not.toContain("Page 1 of 2");
  });

  it("does not rewrite the stored form context on an ordinary save", async () => {
    render(<InspectionTemplateEditRouter surface="shop" />);
    await screen.findByText("Refresh layout");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).not.toHaveProperty("form_context");
  });
});

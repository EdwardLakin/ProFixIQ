import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobCard } from "@/features/work-orders/components/JobCard";

afterEach(() => cleanup());

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    assigned_tech_id: "11111111-1111-4111-8111-111111111111",
    approval_state: "approved",
    complaint: "Brake vibration",
    created_at: null,
    description: "Inspect front brakes",
    hold_reason: null,
    punched_in_at: null,
    punched_out_at: null,
    status: "approved",
    updated_at: null,
    ...overrides,
  } as never;
}

function renderNavigator(workOrderLine: never) {
  const view = render(
    <JobCard
      index={0}
      line={workOrderLine}
      parts={[]}
      technicians={[
        {
          id: "11111111-1111-4111-8111-111111111111",
          full_name: "Test Mechanic",
        },
      ]}
      canAssign={false}
      isPunchedIn={false}
      isSelectedForPanel
      onOpen={vi.fn()}
      display="navigator"
    />,
  );
  const article = view.container.querySelector("article");
  expect(article).not.toBeNull();
  return { article: article!, unmount: view.unmount };
}

describe("Work Order navigator status colors", () => {
  it("uses the operational hold state for the whole selected card with a theme-aware surface", () => {
    const { article } = renderNavigator(
      line({ status: "approved", hold_reason: "waiting for parts" }),
    );

    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(article.className).toContain("border-amber-400/60");
    expect(article.className).toContain("color-mix");
    expect(article.className).toContain("var(--theme-surface-inset)");
    expect(article.className).toContain("#f59e0b");
    expect(article.className).toContain("ring-[color:var(--brand-primary)]/35");
    expect(article.className).not.toContain("bg-amber-50");
  });

  it("keeps waiting-parts and completed lines visually distinct without fixed light surfaces", () => {
    const waiting = renderNavigator(line({ status: "waiting_parts" }));
    expect(waiting.article.className).toContain("#6366f1");
    expect(waiting.article.className).not.toContain("bg-indigo-50");
    waiting.unmount();

    const completed = renderNavigator(line({ status: "completed" }));
    expect(completed.article.className).toContain("#10b981");
    expect(completed.article.className).not.toContain("bg-emerald-50");
  });

  it("distinguishes ready-to-start work from awaiting-technician work", () => {
    const ready = renderNavigator(line({ status: "approved" }));
    expect(screen.getByText("Ready to start")).toBeInTheDocument();
    expect(ready.article.className).toContain("#0ea5e9");
    const readyChip = screen.getByText("Ready to start");
    expect(readyChip.className).toContain("text-[color:var(--theme-text-primary)]");
    ready.unmount();

    const unassigned = renderNavigator(
      line({ status: "approved", assigned_tech_id: null }),
    );
    expect(screen.getByText("Awaiting technician")).toBeInTheDocument();
    expect(unassigned.article.className).not.toContain("#0ea5e9");
    expect(unassigned.article.className).toContain("var(--theme-surface-inset)");
  });
});

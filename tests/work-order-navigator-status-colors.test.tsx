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
  it("uses the operational hold state for the whole selected card, not the persisted approved status", () => {
    const { article } = renderNavigator(
      line({ status: "approved", hold_reason: "waiting for parts" }),
    );

    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(article.className).toContain("border-amber-300/80");
    expect(article.className).toContain("bg-amber-50/80");
    expect(article.className).toContain("ring-[color:var(--brand-primary)]/35");
    expect(article.className).not.toContain("bg-[color:var(--theme-surface-subtle)]");
  });

  it("keeps waiting-parts and completed lines visually distinct", () => {
    const waiting = renderNavigator(line({ status: "waiting_parts" }));
    expect(waiting.article.className).toContain("bg-indigo-50/80");
    waiting.unmount();

    const completed = renderNavigator(line({ status: "completed" }));
    expect(completed.article.className).toContain("bg-emerald-50/70");
  });
});

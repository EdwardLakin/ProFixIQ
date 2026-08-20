import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  WorkspaceCard,
  WorkspaceCommandBar,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceSection,
  WorkspaceShell,
  WorkspaceSourceReference,
  WorkspaceStatus,
  WorkspaceTimeline,
  WorkspaceTimelineItem,
} from "@/features/workspace/components";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const read = (path: string) => readFileSync(path, "utf8");

describe("Workspace Platform shared foundation", () => {
  it("renders the common shell, sticky header, command bar, and section semantics", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShell>
        <WorkspaceHeader>
          <WorkspaceCommandBar ariaLabel="Workspace actions">
            <button type="button">Act</button>
          </WorkspaceCommandBar>
        </WorkspaceHeader>
        <WorkspaceSection
          headingId="active-work-heading"
          eyebrow="Current condition"
          title="Active work"
          summary="2 records"
        >
          <WorkspaceEmptyState>No additional records.</WorkspaceEmptyState>
        </WorkspaceSection>
      </WorkspaceShell>,
    );

    expect(markup).toContain("<main");
    expect(markup).toContain("sticky top-2");
    expect(markup).toContain('aria-label="Workspace actions"');
    expect(markup).toContain('aria-labelledby="active-work-heading"');
    expect(markup).toContain('id="active-work-heading"');
    expect(markup).toContain("Current condition");
    expect(markup).toContain("No additional records.");
  });

  it("keeps canonical source identity when a card is openable or read-only", () => {
    const openMarkup = renderToStaticMarkup(
      <WorkspaceCard
        href="/work-orders/wo-1"
        sourceId="wo-1"
        sourceType="work_order"
        className="block p-4"
      >
        Work order
      </WorkspaceCard>,
    );
    const restrictedMarkup = renderToStaticMarkup(
      <WorkspaceCard
        sourceId="invoice-1"
        sourceType="invoice"
        className="block p-4"
      >
        Restricted invoice source
      </WorkspaceCard>,
    );
    const sourceMarkup = renderToStaticMarkup(
      <WorkspaceSourceReference label="Invoice INV-1" canOpen={false} />,
    );

    expect(openMarkup).toContain('href="/work-orders/wo-1"');
    expect(openMarkup).toContain('data-source-id="wo-1"');
    expect(openMarkup).toContain('data-source-type="work_order"');
    expect(restrictedMarkup).not.toContain("href=");
    expect(restrictedMarkup).toContain('data-source-id="invoice-1"');
    expect(sourceMarkup).toContain("Source retained");
  });

  it("renders reusable status and timeline presentation without resource semantics", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTimeline>
        <WorkspaceTimelineItem>
          <WorkspaceCard className="block p-4">
            <WorkspaceStatus>in progress</WorkspaceStatus>
          </WorkspaceCard>
        </WorkspaceTimelineItem>
      </WorkspaceTimeline>,
    );

    expect(markup).toContain("<ol");
    expect(markup).toContain("<li");
    expect(markup).toContain("in progress");
  });

  it("keeps shared presentation primitives free of role and data-access logic", () => {
    const source = [
      "WorkspaceCard.tsx",
      "WorkspaceCommandBar.tsx",
      "WorkspaceEmptyState.tsx",
      "WorkspaceHeader.tsx",
      "WorkspaceSection.tsx",
      "WorkspaceShell.tsx",
      "WorkspaceSourceReference.tsx",
      "WorkspaceStatus.tsx",
      "WorkspaceTimeline.tsx",
      "workspaceStyles.ts",
    ]
      .map((file) => read(`features/workspace/components/${file}`))
      .join("\n");

    expect(source).not.toContain("createBrowserSupabase");
    expect(source).not.toContain("createServerSupabase");
    expect(source).not.toContain("getActorCapabilities");
    expect(source).not.toContain("ROLE_GROUPS");
    expect(source).not.toContain('"use client"');
    expect(source).toContain("this component is not a security boundary");
  });

  it("adopts shared primitives in Vehicle Workspace without replacing the Work Order ID presentation", () => {
    const vehicleWorkspace = read(
      "features/vehicles/components/VehicleWorkspace.tsx",
    );
    const workOrderPage = read("app/work-orders/[id]/page.tsx");
    const workOrderClient = read("app/work-orders/[id]/Client.tsx");

    expect(vehicleWorkspace).toContain(
      'from "@/features/workspace/components"',
    );
    expect(vehicleWorkspace).toContain("<WorkspaceShell>");
    expect(vehicleWorkspace).toContain("<WorkspaceHeader>");
    expect(vehicleWorkspace).toContain("<WorkspaceCommandBar");
    expect(vehicleWorkspace).toContain("<WorkspaceSection");
    expect(workOrderPage).toContain("<WorkOrderIdClient />");
    expect(workOrderPage).toContain("<WorkOrderOperationalTimelineDock />");
    expect(workOrderPage).not.toContain("features/workspace");
    expect(workOrderClient).toContain(
      'from "@/features/workspace/authorization/useWorkspaceCapabilities"',
    );
    expect(workOrderClient).not.toContain(
      'from "@/features/workspace/components"',
    );
  });
});

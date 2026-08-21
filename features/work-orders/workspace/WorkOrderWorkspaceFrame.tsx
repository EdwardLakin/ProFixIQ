"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useParams } from "next/navigation";

import { WorkspaceCommandBar } from "@/features/workspace/components/WorkspaceCommandBar";
import { WorkspaceShell } from "@/features/workspace/components/WorkspaceShell";
import { WorkspaceResourceProvider } from "@/features/workspace/context/WorkspaceResourceContext";
import { cn } from "@/features/shared/lib/utils";
import {
  WORK_ORDER_WORKSPACE_MODULES,
  type WorkOrderWorkspaceModuleKey,
} from "@/features/work-orders/workspace/workOrderWorkspace";

export function WorkOrderWorkspaceFrame({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const routeId = params?.id ?? "work-order";

  return (
    <WorkspaceResourceProvider key={routeId}>
      <WorkspaceShell className="mx-0 max-w-none gap-0 px-0 py-0">
        {children}
      </WorkspaceShell>
    </WorkspaceResourceProvider>
  );
}

export type WorkOrderWorkspaceModuleProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "id"
> & {
  module: WorkOrderWorkspaceModuleKey;
  id?: string;
};

export function WorkOrderWorkspaceModule({
  module,
  id,
  "aria-label": ariaLabel,
  ...props
}: WorkOrderWorkspaceModuleProps) {
  const definition = WORK_ORDER_WORKSPACE_MODULES[module];
  return (
    <section
      {...props}
      id={id ?? definition.anchorId}
      aria-label={ariaLabel ?? definition.label}
      data-workspace-module={module}
    />
  );
}

export function WorkOrderWorkspaceCommandBar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceCommandBar
      ariaLabel="Work order actions"
      className={cn("items-center", className)}
    >
      {children}
    </WorkspaceCommandBar>
  );
}

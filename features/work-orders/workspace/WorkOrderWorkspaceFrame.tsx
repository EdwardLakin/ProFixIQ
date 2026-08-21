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
import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

export function WorkOrderWorkspaceFrame({
  children,
  initialResource = null,
}: {
  children: ReactNode;
  initialResource?: WorkspaceResourceContext | null;
}) {
  const params = useParams<{ id: string }>();
  const routeId = params?.id ?? "work-order";

  return (
    <WorkspaceResourceProvider key={routeId} initialResource={initialResource}>
      <WorkspaceShell layout="embedded">{children}</WorkspaceShell>
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

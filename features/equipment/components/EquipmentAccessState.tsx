import Link from "next/link";

import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
} from "@/features/workspace/components";
import type { EquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";

/** Shown instead of Equipment content when the add-on is absent or unverifiable. */
export default function EquipmentAccessState({
  state,
  retryHref,
}: {
  state: Exclude<EquipmentPageEntitlement, "enabled">;
  retryHref: string;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">
          {state === "disabled"
            ? "ProFixIQ Equipment is not active"
            : "Equipment access could not be verified"}
        </h1>
      </WorkspaceHeader>
      <EmptyState>
        {state === "disabled" ? (
          <span>
            Equipment asset records, Asset Health and off-road inspections are part of
            the ProFixIQ Equipment add-on for Complete Operations.{" "}
            <Link className="font-semibold underline" href="/compare-plans">
              View plans
            </Link>
          </span>
        ) : (
          <span>
            Equipment stays locked until your subscription can be verified.{" "}
            <a className="font-semibold underline" href={retryHref}>
              Retry
            </a>
          </span>
        )}
      </EmptyState>
    </WorkspaceShell>
  );
}

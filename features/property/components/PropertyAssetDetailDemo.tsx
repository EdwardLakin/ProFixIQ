import {
  OperationsAssetDetailScreen,
  propertyOperationsRoutes,
  propertyOperationsTerminology,
  type OperationsAssetStat,
} from "@/features/operations";
import type { PropertyAssetDetailData } from "../server/propertyOperationsQueries";
import {
  getPropertyDemoAssetById,
  getPropertyDemoIssuesForAsset,
} from "../lib/propertyDemoData";

type PropertyAssetDetailDemoProps = {
  assetId: string;
  liveData?: PropertyAssetDetailData;
};

export default function PropertyAssetDetailDemo({
  assetId,
  liveData,
}: PropertyAssetDetailDemoProps) {
  const liveAsset = liveData?.asset ?? null;
  const demoAsset = liveAsset ? null : getPropertyDemoAssetById(assetId);
  const asset = liveAsset ?? demoAsset;
  const issues = liveAsset
    ? (liveData?.issues ?? [])
    : demoAsset
      ? getPropertyDemoIssuesForAsset(demoAsset.id)
      : [];
  const openIssueCount = issues.filter(
    (issue) => issue.status !== "completed",
  ).length;
  const isLive = Boolean(liveAsset);

  const demoStats: OperationsAssetStat[] = [
    {
      label: "Open Requests",
      value: openIssueCount,
      helper: "Static demo request count",
    },
    {
      label: "Last 12 Months Spend",
      value:
        asset?.status === "offline"
          ? "$8,420"
          : asset?.status === "limited"
            ? "$3,180"
            : "$1,260",
      helper: "Demo estimate only",
    },
    {
      label: "Days Since Last Issue",
      value:
        asset?.status === "active" ? 15 : asset?.status === "limited" ? 6 : 4,
      helper: "Calculated from placeholder history",
    },
    {
      label: "Pending Approvals",
      value: asset?.status === "active" ? 0 : 1,
      helper: "No live approval workflow wired",
    },
  ];

  const stats = isLive ? (liveData?.stats ?? []) : demoStats;
  const metadata = isLive
    ? (liveData?.metadata ?? [])
    : demoAsset
      ? [
          { label: "Address", value: demoAsset.metadata.address },
          { label: "Unit", value: demoAsset.metadata.unit },
          { label: "Asset Type", value: demoAsset.metadata.assetType },
          { label: "Occupancy", value: demoAsset.metadata.occupancy },
        ]
      : [];

  return (
    <OperationsAssetDetailScreen
      terminology={propertyOperationsTerminology}
      asset={asset}
      issues={issues}
      stats={stats}
      metadata={metadata}
      actions={
        isLive
          ? []
          : [
              { href: "#", label: "Create maintenance request" },
              { href: "#", label: "Schedule inspection", variant: "secondary" },
            ]
      }
      nextInspectionLabel="Next property inspection"
      notFoundLabel="Property demo asset not found. This placeholder only includes static demo records."
      headerLabel={isLive ? "Property asset" : "Property asset demo"}
      issuesTitle="Open maintenance requests"
      issuesDescription={
        isLive
          ? "Read-only property maintenance requests visible through RLS."
          : "Static tenant/site maintenance requests attached to this demo asset."
      }
      issuesEmptyLabel={
        isLive
          ? "No live maintenance requests visible for this property asset."
          : "No open demo maintenance requests for this property asset."
      }
      allInspectionsHref={propertyOperationsRoutes.portalInspections}
      allInspectionsLabel="Inspection history"
      statsTitle="Property maintenance snapshot"
      statsDescription={
        isLive
          ? "Live read-only request status counts only — no spend, accounting, leases, rent, or work-order conversion is wired."
          : "Demo history and cost indicators only — no accounting, leases, rent, or live work order conversion is wired."
      }
    >
      <div className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[11px] text-[color:var(--theme-text-secondary)]">
        <div className="font-semibold text-[color:var(--theme-text-primary)]">
          {isLive ? "Read-only property note" : "Property placeholder note"}
        </div>
        <p className="mt-1 text-[color:var(--theme-text-secondary)]">
          {isLive
            ? "This screen reads property operations data through the logged-in user's Supabase RLS context and does not add write actions yet."
            : "This screen proves the reusable operations asset detail layout with property terminology and static data only."}
        </p>
      </div>
    </OperationsAssetDetailScreen>
  );
}

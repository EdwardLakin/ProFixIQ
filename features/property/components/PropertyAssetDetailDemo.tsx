import {
  OperationsAssetDetailScreen,
  propertyOperationsRoutes,
  propertyOperationsTerminology,
  type OperationsAssetStat,
} from "@/features/operations";
import {
  getPropertyDemoAssetById,
  getPropertyDemoIssuesForAsset,
} from "../lib/propertyDemoData";

type PropertyAssetDetailDemoProps = {
  assetId: string;
};

export default function PropertyAssetDetailDemo({
  assetId,
}: PropertyAssetDetailDemoProps) {
  const asset = getPropertyDemoAssetById(assetId);
  const issues = asset ? getPropertyDemoIssuesForAsset(asset.id) : [];
  const openIssueCount = issues.filter(
    (issue) => issue.status !== "completed",
  ).length;

  const stats: OperationsAssetStat[] = [
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

  return (
    <OperationsAssetDetailScreen
      terminology={propertyOperationsTerminology}
      asset={asset}
      issues={issues}
      stats={stats}
      metadata={
        asset
          ? [
              { label: "Address", value: asset.metadata.address },
              { label: "Unit", value: asset.metadata.unit },
              { label: "Asset Type", value: asset.metadata.assetType },
              { label: "Occupancy", value: asset.metadata.occupancy },
            ]
          : []
      }
      actions={[
        { href: "#", label: "Create maintenance request" },
        { href: "#", label: "Schedule inspection", variant: "secondary" },
      ]}
      nextInspectionLabel="Next property inspection"
      notFoundLabel="Property demo asset not found. This placeholder only includes static demo records."
      headerLabel="Property asset demo"
      issuesTitle="Open maintenance requests"
      issuesDescription="Static tenant/site maintenance requests attached to this demo asset."
      issuesEmptyLabel="No open demo maintenance requests for this property asset."
      allInspectionsHref={propertyOperationsRoutes.portalInspections}
      allInspectionsLabel="Inspection history"
      statsTitle="Property maintenance snapshot"
      statsDescription="Demo history and cost indicators only — no accounting, leases, rent, or live work order conversion is wired."
    >
      <div className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-[11px] text-neutral-300">
        <div className="font-semibold text-neutral-100">
          Property placeholder note
        </div>
        <p className="mt-1 text-neutral-400">
          This screen proves the reusable operations asset detail layout with
          property terminology and static data only.
        </p>
      </div>
    </OperationsAssetDetailScreen>
  );
}

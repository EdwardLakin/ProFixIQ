import {
  WorkspaceShell,
  WorkspaceHeader,
  WORKSPACE_EYEBROW,
} from "@/features/workspace/components";
export default function EquipmentPartsLoading() {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <h1 className="text-2xl font-bold">Parts requests</h1>
      </WorkspaceHeader>
      <p role="status" className="p-4 text-sm">
        Loading Equipment parts requests…
      </p>
    </WorkspaceShell>
  );
}

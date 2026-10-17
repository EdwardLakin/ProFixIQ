import {
  WorkspaceShell,
  WorkspaceHeader,
  WORKSPACE_EYEBROW,
} from "@/features/workspace/components";

export default function EquipmentDispatchLoading() {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <h1 className="text-2xl font-bold">Dispatch</h1>
      </WorkspaceHeader>
      <p role="status" className="p-4 text-sm">
        Loading Equipment visits…
      </p>
    </WorkspaceShell>
  );
}

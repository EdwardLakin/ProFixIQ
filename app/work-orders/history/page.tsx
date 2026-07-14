import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrdersHistoryClient from "./WorkOrdersHistoryClient";

const historyShellStyle: CSSProperties = {
  ["--dashboard-shell-bg" as string]:
    "var(--theme-gradient-panel)",
};

export default function Page() {
  return (
    <div style={historyShellStyle}>
      <WorkOrdersHistoryClient />
    </div>
  );
}

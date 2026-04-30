import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrdersHistoryClient from "./WorkOrdersHistoryClient";

const historyShellStyle: CSSProperties = {
  ["--dashboard-shell-bg" as string]:
    "radial-gradient(1100px_700px_at_100%_100%, rgba(2,6,23,0.45), transparent 64%), linear-gradient(180deg, var(--theme-app-bg, #050910) 0%, var(--theme-app-bg, #050910) 100%)",
};

export default function Page() {
  return (
    <div style={historyShellStyle}>
      <WorkOrdersHistoryClient />
    </div>
  );
}

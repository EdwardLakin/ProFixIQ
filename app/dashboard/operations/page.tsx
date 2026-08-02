import OperationalHealthAlertStrip from "@/features/operations/components/OperationalHealthAlertStrip";
import OperationsDashboardView from "../_components/OperationsDashboardView";

export default function OperationsDashboardPage() {
  return (
    <div className="space-y-4">
      <OperationalHealthAlertStrip />
      <OperationsDashboardView />
    </div>
  );
}

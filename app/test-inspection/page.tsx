import masterInspectionList from "@inspections/lib/inspection/masterInspectionList";
import InspectionGroupList from "@inspections/components/InspectionGroupList";

export default function TestInspectionPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-4">
        Inspection Categories
      </h1>
      <InspectionGroupList categories={masterInspectionList} />
    </div>
  );
}

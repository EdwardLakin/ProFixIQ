import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import InspectionUnifiedScreen from "@/features/inspections/unified/ui/InspectionUnifiedScreen";

export default function UnifiedInspectionPage() {
  // TODO: load real session via server actions or fetch
  const fakeSession: InspectionSession = {
    id: "",
    vehicleId: "",
    customerId: "",
    workOrderId: "",
    templateId: "",
    templateName: "",
    location: "",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    transcript: "",
    status: "not_started",
    started: false,
    completed: false,
    isListening: false,
    isPaused: false,
    quote: [],
    lastUpdated: new Date().toISOString(),
    customer: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      province: "",
      postal_code: "",
    },
    vehicle: {
      year: "",
      make: "",
      model: "",
      vin: "",
      license_plate: "",
      mileage: "",
      color: "",
    },
    sections: [],
  };

  return (
    <div className="p-4">
      <InspectionUnifiedScreen
        session={fakeSession}
        onUpdateSession={(patch) => {
          console.log("update session (stub)", patch);
        }}
      />
    </div>
  );
}

import type { DeferredWorkItem } from "@/features/work-orders/server/deferredWorkHistory";
import type { PartReadinessLine } from "@/features/operations/server/appointmentPreparation/buildPartsReadiness";
import type {
  CustomerSnapshot,
  MatchedMenuItem,
  MissingInfoFlag,
  VehicleSnapshot,
} from "@/features/operations/server/appointmentPreparation/buildAppointmentPreparations";

export type { DeferredWorkItem, PartReadinessLine, MatchedMenuItem, MissingInfoFlag, VehicleSnapshot, CustomerSnapshot };

export type AppointmentPreparationListItem = {
  bookingId: string;
  startsAt: string;
  vehicleId: string | null;
  customerId: string | null;
  vehicleSnapshot: VehicleSnapshot | null;
  customerSnapshot: CustomerSnapshot | null;
  deferredItems: DeferredWorkItem[];
  matchedMenuItems: MatchedMenuItem[];
  missingInfo: MissingInfoFlag[];
  generatedAt: string;
};

export type AppointmentPreparationsResponse =
  | {
      ok: true;
      canViewPricing: boolean;
      items: AppointmentPreparationListItem[];
    }
  | {
      ok: false;
      error: string;
    };

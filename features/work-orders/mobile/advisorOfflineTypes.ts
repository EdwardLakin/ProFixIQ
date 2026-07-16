import type { Database } from "@shared/types/types/supabase";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";

type DB = Database;

export type AdvisorOfflineBooking = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  | "id"
  | "starts_at"
  | "ends_at"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "notes"
  | "status"
> & {
  shop_slug: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

export type AdvisorOfflineBundle = {
  scope: { userId: string; shopId: string };
  downloadedAt: string;
  day: string;
  shop: Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "name" | "slug">;
  bookings: AdvisorOfflineBooking[];
  customers: DB["public"]["Tables"]["customers"]["Row"][];
  vehicles: DB["public"]["Tables"]["vehicles"]["Row"][];
  truncated: { customers: boolean; vehicles: boolean };
};

export type AdvisorWorkOrderDraftLine = {
  tempId: string;
  lineType: "job" | "info";
  complaint: string;
  notes?: string;
  jobType?: "diagnosis" | "inspection" | "maintenance" | "repair";
  laborTime?: number | null;
};

export type AdvisorWorkOrderDraft = {
  id: string;
  operationKey: string;
  userId: string;
  shopId: string;
  customerId: string | null;
  vehicleId: string | null;
  customer: MobileCustomer;
  vehicle: MobileVehicle;
  isWaiter: boolean;
  notes: string;
  priority: number;
  lines: AdvisorWorkOrderDraftLine[];
  updatedAt: string;
};

export type AdvisorDraftMaterialization = {
  workOrderId: string;
  customId: string | null;
  lineIdMap: Record<string, string>;
  idempotent: boolean;
};

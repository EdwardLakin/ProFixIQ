import { geotabCall, type GeotabSession } from "./client";
import type {
  TrackerFaultCode,
  TrackerOdometerReading,
  TrackerVehicleSnapshot,
} from "../types";

type GeotabDevice = {
  id: string;
  name: string;
  vehicleIdentificationNumber?: string | null;
  serialNumber?: string | null;
};

type GeotabDiagnostic = {
  id?: string;
  code?: number | string | null;
  name?: string | null;
};

type GeotabFaultData = {
  device?: { id?: string };
  diagnostic?: GeotabDiagnostic;
  dateTime?: string;
};

type GeotabStatusData = {
  device?: { id?: string };
  data?: number;
  dateTime?: string;
};

const ODOMETER_DIAGNOSTIC_ID = "DiagnosticOdometerId";

export async function fetchGeotabVehicles(
  session: GeotabSession,
): Promise<TrackerVehicleSnapshot[]> {
  const devices = await geotabCall<GeotabDevice[]>(session, "Get", {
    typeName: "Device",
  });

  return (devices ?? []).map((device) => ({
    vendorVehicleId: device.id,
    name: device.name,
    vin: device.vehicleIdentificationNumber ?? null,
    serialNumber: device.serialNumber ?? null,
  }));
}

export async function fetchGeotabFaultCodes(
  session: GeotabSession,
  sinceIso: string,
): Promise<TrackerFaultCode[]> {
  const faults = await geotabCall<GeotabFaultData[]>(session, "Get", {
    typeName: "FaultData",
    search: { fromDate: sinceIso },
  });

  return (faults ?? [])
    .filter((fault) => fault.device?.id && fault.dateTime)
    .map((fault) => ({
      vendorVehicleId: fault.device!.id!,
      code: String(fault.diagnostic?.code ?? fault.diagnostic?.id ?? "unknown"),
      description: fault.diagnostic?.name ?? null,
      occurredAt: fault.dateTime!,
      raw: fault,
    }));
}

export async function fetchGeotabOdometerReadings(
  session: GeotabSession,
  sinceIso: string,
): Promise<TrackerOdometerReading[]> {
  const readings = await geotabCall<GeotabStatusData[]>(session, "Get", {
    typeName: "StatusData",
    search: {
      fromDate: sinceIso,
      diagnosticSearch: { id: ODOMETER_DIAGNOSTIC_ID },
    },
  });

  return (readings ?? [])
    .filter(
      (reading) =>
        reading.device?.id &&
        reading.dateTime &&
        typeof reading.data === "number",
    )
    .map((reading) => ({
      vendorVehicleId: reading.device!.id!,
      odometerMeters: reading.data!,
      recordedAt: reading.dateTime!,
    }));
}

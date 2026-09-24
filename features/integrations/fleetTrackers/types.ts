export type TrackerVendor = "geotab" | "samsara" | "motive";

export type TrackerVehicleSnapshot = {
  vendorVehicleId: string;
  name: string;
  vin: string | null;
  serialNumber: string | null;
};

export type TrackerFaultCode = {
  vendorVehicleId: string;
  code: string;
  description: string | null;
  occurredAt: string;
  raw: unknown;
};

export type TrackerOdometerReading = {
  vendorVehicleId: string;
  odometerMeters: number;
  recordedAt: string;
};

export type TrackerAdapter = {
  vendor: TrackerVendor;
  fetchVehicles(): Promise<TrackerVehicleSnapshot[]>;
  fetchFaultCodes(sinceIso: string): Promise<TrackerFaultCode[]>;
  fetchOdometerReadings(sinceIso: string): Promise<TrackerOdometerReading[]>;
};

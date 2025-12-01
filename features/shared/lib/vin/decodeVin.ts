export type DecodedVin = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;

  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;

  error?: string;
};

export async function decodeVin(
  vin: string,
  userId: string,
): Promise<DecodedVin> {
  const res = await fetch("/api/vin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vin, user_id: userId }),
  });

  if (!res.ok) {
    try {
      return (await res.json()) as DecodedVin;
    } catch {
      return { error: `VIN decode failed (${res.status})` };
    }
  }

  return (await res.json()) as DecodedVin;
}
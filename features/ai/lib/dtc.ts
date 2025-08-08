// src/lib/dtc.ts

export type DTCResult = {
  code: string;
  description: string;
  possibleCauses: string[];
  recommendedFixes?: string[];
};

export async function diagnoseDTC(
  vehicle: string,
  dtcCode: string,
): Promise<DTCResult> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_DTC_DIAGNOSIS_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vehicle,
      dtcCode,
    }),
  });

  if (!response.ok) {
    throw new Error("DTC diagnosis failed");
  }

  const result: DTCResult = await response.json();
  return result;
}

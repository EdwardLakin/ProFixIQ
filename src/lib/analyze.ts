import { Message } from "@lib/types";

export default async function analyze(
  input: string,
  vehicleInfo: any,
  context?: Message[]
) {
  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dtcCode: input,
      vehicle: vehicleInfo,
      context,
    }),
  });

  if (!response.ok) {
    throw new Error("DTC analysis failed");
  }

  const result = await response.json();
  return result;
}
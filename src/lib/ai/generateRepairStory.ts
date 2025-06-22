export async function generateRepairStory(
  transcript: string,
  inspectionData?: any
): Promise<string> {
  // Basic fallback logic if no AI backend is available yet
  const failedItems: string[] = [];

  if (inspectionData && inspectionData.sections) {
    for (const [section, items] of Object.entries(inspectionData.sections)) {
      for (const [item, details] of Object.entries(items as any)) {
        if (details.status === "fail" || details.status === "attention") {
          failedItems.push(`${section} - ${item}`);
        }
      }
    }
  }

  let bulletPoints = failedItems.map((line) => `• ${line}`).join("\n");
  if (!bulletPoints) bulletPoints = "• No major issues reported.";

  return `Inspection completed. Technician noted the following:\n\n${bulletPoints}\n\nAdditional notes: ${transcript || "None."}`;
}
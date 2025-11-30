import type {
  InspectionTemplate,
  InspectionSection,
} from "@inspections/lib/inspection/types";

export async function loadInspectionTemplateUnified(
  templateId: string,
): Promise<InspectionTemplate | null> {
  console.debug("loadInspectionTemplateUnified (stub)", templateId);
  return null;
}

export function templateToSectionsUnified(
  template: InspectionTemplate,
): InspectionSection[] {
  return (template.sections as InspectionSection[]) ?? [];
}

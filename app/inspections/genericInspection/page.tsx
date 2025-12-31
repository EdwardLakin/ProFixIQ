// app/inspections/genericInspection/page.tsx

import { redirect } from "next/navigation";
import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

type Dict = Record<string, string>;

function normalizeSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Dict {
  const out: Dict = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "undefined") continue;
    out[key] = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  }
  return out;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function GenericInspectionPage({ searchParams = {} }: PageProps) {
  const params = normalizeSearchParams(searchParams);

  const template = params.template;
  if (!template) {
    // No template – bounce back to templates list
    redirect("/inspections/templates");
  }

  return (
    <GenericInspectionScreen
      template={template}
      params={params}
    />
  );
}
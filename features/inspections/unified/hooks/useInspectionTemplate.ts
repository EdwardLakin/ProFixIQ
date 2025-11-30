"use client";

import { useEffect, useState } from "react";
import type {
  InspectionTemplate,
} from "@inspections/lib/inspection/types";
import { loadInspectionTemplateUnified } from "../data/templateLoader";

export function useInspectionTemplate(templateId: string | null) {
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);

  useEffect(() => {
    if (!templateId) return;
    loadInspectionTemplateUnified(templateId).then(setTemplate);
  }, [templateId]);

  return { template };
}

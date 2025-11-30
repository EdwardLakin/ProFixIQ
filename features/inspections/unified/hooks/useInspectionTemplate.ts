"use client";

import { useEffect, useState } from "react";
import type { InspectionTemplate } from "@inspections/lib/inspection/types";
import { loadInspectionTemplateUnified } from "../data/templateLoader";

export function useInspectionTemplate(templateId: string | null) {
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      return;
    }

    setLoading(true);
    loadInspectionTemplateUnified(templateId)
      .then(setTemplate)
      .finally(() => setLoading(false));
  }, [templateId]);

  return { template, loading };
}

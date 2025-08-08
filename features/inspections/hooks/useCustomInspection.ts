import { useState } from "react";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";

export function useCustomInspection() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<InspectionCategory[]>([]);

  const generate = async (prompt: string) => {
    setLoading(true);
    const res = await fetch("/api/ai/generateInspectionList", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    setCategories(data);
    setLoading(false);
  };

  return { categories, generate, loading };
}

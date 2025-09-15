// features/work-orders/hooks/useWorkOrderCreateDraft.ts
"use client";
import { useTabState } from "@/features/shared/hooks/useTabState";

export type CreateDraftV1 = {
  _version: 1;
  vehicle: { year: string; make: string; model: string; vin?: string };
  customer: { first_name: string; last_name: string; phone?: string; email?: string };
  notes: string;
  linesDraft: Array<{ desc: string; qty: number }>;
};

const initialDraft: CreateDraftV1 = {
  _version: 1,
  vehicle: { year: "", make: "", model: "", vin: "" },
  customer: { first_name: "", last_name: "", phone: "", email: "" },
  notes: "",
  linesDraft: [],
};

export function useWorkOrderCreateDraft() {
  const [draft, setDraft] = useTabState<CreateDraftV1>("workorders:create:draft", initialDraft);

  function resetDraft() {
    setDraft(initialDraft);
  }

  return { draft, setDraft, resetDraft };
}
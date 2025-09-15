// features/work-orders/hooks/useWorkOrderViewState.ts
"use client";
import { useTabState } from "@/features/shared/hooks/useTabState";

export type ViewStateV1 = {
  _version: 1;
  ui: {
    showAddForm: boolean;
    activeLineId: string | null;
    filters: { status?: string | null };
    sort: "priority" | "created_at" | "status";
  };
};

const initialState: ViewStateV1 = {
  _version: 1,
  ui: {
    showAddForm: false,
    activeLineId: null,
    filters: { status: null },
    sort: "priority",
  },
};

export function useWorkOrderViewState() {
  const [state, setState] = useTabState<ViewStateV1>("workorders:id:view", initialState);

  function resetViewState() {
    setState(initialState);
  }

  return { state, setState, resetViewState };
}
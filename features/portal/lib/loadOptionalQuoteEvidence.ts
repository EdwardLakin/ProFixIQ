import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";
import {
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";

type LoadOptionalQuoteEvidenceArgs = {
  workOrderId: string;
  signal: AbortSignal;
  recordStatus: (status: number) => void;
  request?: typeof fetch;
};

export type OptionalQuoteEvidenceResult = {
  items: WorkOrderEvidenceItem[];
  warning: RouteLoadFailure | null;
};

export async function loadOptionalQuoteEvidence({
  workOrderId,
  signal,
  recordStatus,
  request = fetch,
}: LoadOptionalQuoteEvidenceArgs): Promise<OptionalQuoteEvidenceResult> {
  try {
    const response = await request(
      `/api/work-orders/${workOrderId}/media?scope=all`,
      { cache: "no-store", signal },
    );
    recordStatus(response.status);
    const body = (await response.json().catch(() => null)) as {
      items?: WorkOrderEvidenceItem[];
    } | null;

    if (response.ok) {
      return { items: body?.items ?? [], warning: null };
    }

    return {
      items: [],
      warning: routeLoadFailureFromStatus(
        response.status,
        "Some quote evidence could not be loaded.",
      ),
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      items: [],
      warning: asRouteLoadFailure(
        error,
        "Some quote evidence could not be loaded.",
      ),
    };
  }
}

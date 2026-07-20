import { filterAllocationsNotBackedByCanonicalParts } from "@/features/work-orders/lib/display/workOrderParts";

type AllocationIdentity = {
  part_id: string;
  source_request_item_id?: string | null;
};

type StagedPartIdentity = {
  id: string;
  part_id?: string | null;
  source_parts_request_item_id?: string | null;
};

export function filterInvoicePartAllocations<
  TAllocation extends AllocationIdentity,
  TStagedPart extends StagedPartIdentity,
>(args: {
  allocations: TAllocation[];
  stagedParts: TStagedPart[];
  displayedStagedPartIds: Set<string>;
}): TAllocation[] {
  const billableStagedParts = args.stagedParts.filter((part) =>
    args.displayedStagedPartIds.has(String(part.id)),
  );
  const billablePartIds = new Set(
    billableStagedParts
      .map((part) => part.part_id)
      .filter((partId): partId is string =>
        typeof partId === "string" && partId.trim().length > 0,
      ),
  );

  return filterAllocationsNotBackedByCanonicalParts(
    args.allocations,
    billableStagedParts,
  ).filter((allocation) => !billablePartIds.has(allocation.part_id));
}

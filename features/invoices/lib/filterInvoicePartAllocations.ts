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
  const billableSourceItemIds = new Set(
    billableStagedParts
      .map((part) => part.source_parts_request_item_id)
      .filter((itemId): itemId is string =>
        typeof itemId === "string" && itemId.trim().length > 0,
      ),
  );

  return args.allocations.filter((allocation) => {
    const sourceItemId = allocation.source_request_item_id;
    if (sourceItemId && billableSourceItemIds.has(sourceItemId)) return false;
    return !billablePartIds.has(allocation.part_id);
  });
}

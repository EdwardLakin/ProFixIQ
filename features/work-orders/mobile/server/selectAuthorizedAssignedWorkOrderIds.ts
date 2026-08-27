export function selectAuthorizedAssignedWorkOrderIds(
  assignedRows: Array<{ work_order_id: string | null }>,
  fieldWorkOrderIds: ReadonlySet<string> | null,
): string[] {
  return [
    ...new Set(
      assignedRows
        .map((row) => row.work_order_id)
        .filter(
          (workOrderId): workOrderId is string =>
            workOrderId !== null &&
            (!fieldWorkOrderIds || fieldWorkOrderIds.has(workOrderId)),
        ),
    ),
  ];
}

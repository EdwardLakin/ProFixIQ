export type EquipmentOperationCount = {
  value: number | null;
  partial: boolean;
  href: string;
};
export type EquipmentOperationCounts = {
  approvals: EquipmentOperationCount;
  parts: EquipmentOperationCount;
  field: EquipmentOperationCount;
};

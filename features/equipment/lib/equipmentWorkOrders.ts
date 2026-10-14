export type EquipmentWorkOrderRow = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  href: string | null;
  assetId: string;
  assetHref: string;
  assetLabel: string;
  customerName: string | null;
  createdAt: string;
  scheduledAt: string | null;
};

export type EquipmentWorkOrders = {
  rows: EquipmentWorkOrderRow[];
  truncated: boolean;
};

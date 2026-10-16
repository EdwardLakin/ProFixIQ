import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";

/**
 * Roles that may open the Equipment field entry. Technicians reach it without
 * browsing the shop-wide directory, so it adds mechanics to the directory roles.
 * This is the entry page's own allowance; it does not change what any role can
 * do elsewhere.
 */
export const EQUIPMENT_FIELD_ENTRY_ROLES = [
  ...EQUIPMENT_DIRECTORY_ROLES,
  "mechanic",
] as const;

export type EquipmentFieldEntryLink = {
  key: string;
  label: string;
  description: string;
  href: string;
};

/**
 * Where an Equipment technician continues today. These are the canonical mobile
 * field surfaces, which enforce their own access; the Equipment job card and
 * dispatch hand-off replace them in later PRs without a second implementation.
 */
export const EQUIPMENT_FIELD_ENTRY_LINKS: readonly EquipmentFieldEntryLink[] = [
  {
    key: "jobs",
    label: "My field jobs",
    description: "Assigned jobs, travel, arrival and active work.",
    href: "/mobile/service/jobs",
  },
  {
    key: "new-call",
    label: "New service call",
    description: "Start a call for a machine on a jobsite.",
    href: "/mobile/service/new",
  },
  {
    key: "my-truck",
    label: "My truck",
    description: "Truck stock and parts on board.",
    href: "/mobile/service/my-truck",
  },
];

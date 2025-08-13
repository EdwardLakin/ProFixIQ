import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";
import type { ServiceItem } from "@shared/types/types/services";

export function getServicesByKeyword(keyword: string): ServiceItem[] {
  const lowerKeyword = keyword.toLowerCase();

  // Flatten all items from all categories
  const allItems = masterServicesList.flatMap((category) => category.items);

  return allItems.filter((service: ServiceItem) =>
    service.item.toLowerCase().includes(lowerKeyword),
  );
}

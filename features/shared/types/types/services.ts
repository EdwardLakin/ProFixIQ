// src/types/services.ts
export interface ServiceItem {
  item: string;
}

export interface ServiceCategory {
  title: string;
  items: ServiceItem[];
}

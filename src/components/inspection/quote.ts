// lib/inspection/quote.ts

export type InspectionItemStatus = 'ok' | 'fail' | 'na' | 'recommend';

export interface QuoteLine {
  id: string;
  inspectionItemId?: string;
  sectionId?: string;
  status?: InspectionItemStatus;
  description?: string;
  note?: string;
  notes?: string;
  laborTime?: number; // in hours
  laborRate?: number; // shop-configured or default
  parts?: {
    name: string;
    price: number;
  }[];
  type?: 'economy' | 'premium' | 'oem' | 'custom';
  price?: number;
  totalCost?: number;
  editable?: boolean;
}
export type CommandType = '' | 'ok' | 'fail' | 'na' | 'add' | 'recommend' | 'measurement' | 'status' | 'pause';
export type InspectionStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'ready_for_review';
export type InspectionItemStatus = '' |'ok' | 'fail' | 'na' | 'recommend';

export interface InspectionCommandBase {
  type: CommandType;
  section?: string;
  item?: string;
}

export interface AddCommand extends InspectionCommandBase {
  type: 'add';
  note: string;
}

export interface RecommendCommand extends InspectionCommandBase {
  type: 'recommend';
  note: string;
}

export interface MeasurementCommand extends InspectionCommandBase {
  type: 'measurement';
  unit: string;
  value: number;
}

export interface StatusCommand extends InspectionCommandBase {
  type: 'status';
  status: InspectionItemStatus;
}

export interface PauseCommand extends InspectionCommandBase {
  type: 'pause';
}

export type InspectionCommand =
  | AddCommand
  | RecommendCommand
  | MeasurementCommand
  | StatusCommand
  | PauseCommand;

  export interface CustomerInfo {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
}

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color?: string;
}

export interface InspectionItem {
  name: string;
  item: string;
  status?: InspectionItemStatus;
  notes?: string;
  value?: string | number | null;
  unit?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSection {
  title: string;
  items: InspectionItem[];
  status?: InspectionItemStatus;
  notes?: string;
}

export interface InspectionState {
  customer?: {
    name: string;
    phone?: string;
  };
  vehicle?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
    unitNumber?: string;
    mileage?: string;
  };
  sections: InspectionSection[];
  completed?: boolean;
  updatedAt?: string;
}

export interface InspectionTemplate {
  templateName: string;
  templateId: string;
  sections: InspectionSection[];
}

export interface QuoteLine {
  id: string;
  inspectionItem?: string;
  item: string;
  description?: string;
  status?: InspectionItemStatus;
  value?: number | string | null;
  notes?: string;
  laborTime?: number;
  laborRate?: number;
  parts?: {
    name: string;
    price: number;
    type: 'economy' | 'premium' | 'oem';
  }[];
  totalCost?: number;
  editable?: boolean;
  source?: 'inspection' | 'manual' | 'ai';
}

export interface QuoteLineItem {
  name: string;
  notes?: string;
  status: 'fail' | 'recommend' | 'ok' | 'na';
  laborHours?: number;
  partName?: string;
  partPrice?: number;
}

export interface InspectionSession {
  customer?: {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  }
  vehicle: {
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color?: string;
  }
  id: string;
  vehicleId: string;
  customerId: string;
  workOrderId: string;
  templateId: string;
  templateName: string;
  sections: InspectionSection[];
  currentSectionIndex: number;
  currentItemIndex: number;
  started: boolean;
  completed: boolean;
  isListening: boolean;
  isPaused: boolean;
  transcript: string;
  location: string;
  status: InspectionStatus;
  quote: QuoteLine[];
  lastUpdated: string;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updated: Partial<InspectionItem>
  ) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface SummaryItem {
  section: string;
  item: string;
  status?: InspectionItemStatus;
  note?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSummary {
  templateName: string;
  date: string;
  items: SummaryItem[];
}

export interface ParsedCommand {
  type: CommandType;
  item?: string;
  status?: InspectionItemStatus;
  note?: string;
  value?: number | string | null;
  unit?: string;
  location?: string;
  description?: string;
  labor?: number;
}

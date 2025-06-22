// Used as input from inspection results
export interface InspectionResultItem {
  name: string;
  status: "pass" | "fail" | "recommend" | "na";
  notes?: string;
}

// Used for quote output
export interface QuoteLineItem {
  description: string;
  part: {
    name: string;
    price: number;
  };
  laborHours: number;
  price: number;
  type: "repair" | "recommend" | "maintenance";
}
export type InspectionItem = {
  id: string;
  label: string;
  description?: string | null;
  required?: boolean | null;
  default_value?: string | null;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  type?: "checkbox" | "text" | "number" | "rating" | "photo" | "select" | null;
  options?: string[] | null;
};

export type InspectionSection = {
  id: string;
  title: string;
  notes?: string | null;
  items: InspectionItem[];
};
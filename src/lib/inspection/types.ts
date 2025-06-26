export type InspectionStatus = 'ok' | 'fail' | 'na' | 'unmarked';

export type InspectionItem = {
  name: string;
  status: InspectionStatus;
  notes: string;
  photo: string | null;
};

export type InspectionSection = {
  title: string;
  items: InspectionItem[];
};

export type InspectionTemplate = {
  name: string;
  sections: {
    title: string;
    items: string[];
  }[];
};

export type InspectionSession = {
  templateName: string;
  sections: InspectionSection[];
};

export type InspectionCommand = {
  item: string;
  status: InspectionStatus;
  notes?: string;
};
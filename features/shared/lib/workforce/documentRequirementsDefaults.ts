export type RequiredDocType = "drivers_license" | "certification" | "tax_form" | "other";

export type RequirementRule = {
  key: string;
  workforceRole: string | null;
  workforceCategory: string | null;
  docType: RequiredDocType;
  label: string;
  required: true;
  expiresRequired: boolean;
  warningDays: number;
};

const DEFAULT_WARNING_DAYS = 30;

export const DEFAULT_DOCUMENT_REQUIREMENTS: RequirementRule[] = [
  {
    key: "role:technician:drivers_license",
    workforceRole: "technician",
    workforceCategory: null,
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "role:technician:certification",
    workforceRole: "technician",
    workforceCategory: null,
    docType: "certification",
    label: "Certification",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:mechanic:drivers_license",
    workforceRole: null,
    workforceCategory: "mechanic",
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:mechanic:certification",
    workforceRole: null,
    workforceCategory: "mechanic",
    docType: "certification",
    label: "Certification",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:driver:drivers_license",
    workforceRole: null,
    workforceCategory: "driver",
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:admin:tax_form",
    workforceRole: null,
    workforceCategory: "admin",
    docType: "tax_form",
    label: "Tax Form",
    required: true,
    expiresRequired: false,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:office:tax_form",
    workforceRole: null,
    workforceCategory: "office",
    docType: "tax_form",
    label: "Tax Form",
    required: true,
    expiresRequired: false,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "default:active:tax_form",
    workforceRole: null,
    workforceCategory: null,
    docType: "tax_form",
    label: "Tax Form",
    required: true,
    expiresRequired: false,
    warningDays: DEFAULT_WARNING_DAYS,
  },
];

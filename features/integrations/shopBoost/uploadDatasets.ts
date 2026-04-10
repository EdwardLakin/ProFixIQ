export const SHOP_BOOST_UPLOAD_DATASETS = [
  {
    key: "customers",
    label: "Customers",
    description: "Names, phones, emails — anchors customer records and future approvals.",
    help: "Optional but recommended",
    target: "customers import/staging",
    importMode: "direct",
  },
  {
    key: "vehicles",
    label: "Vehicles",
    description: "VIN, plate, unit, year/make/model — links assets to customers and repair history.",
    help: "Optional",
    target: "vehicles import/staging",
    importMode: "direct",
  },
  {
    key: "history",
    label: "Work orders / repair history",
    description: "RO numbers, dates, concerns, corrections, totals — drives work order + invoice history import.",
    help: "Optional",
    target: "work_orders/work_order_lines + invoice history pipeline",
    importMode: "direct",
  },
  {
    key: "invoices",
    label: "Invoices / payment history",
    description: "Invoice exports and payment events for reconciliation and later mapping review.",
    help: "Optional · staged for safe review",
    target: "invoice history staging",
    importMode: "staging",
  },
  {
    key: "parts",
    label: "Parts / inventory",
    description: "Part numbers, descriptions, costs, sell prices, preferred vendors.",
    help: "Optional",
    target: "parts/inventory import",
    importMode: "direct",
  },
  {
    key: "vendors",
    label: "Vendors",
    description: "Supplier records, contacts, terms, and account references.",
    help: "Optional · staged for safe review",
    target: "vendor staging",
    importMode: "staging",
  },
  {
    key: "staff",
    label: "Staff / users / technicians",
    description: "Team roster with role hints, emails, and phone numbers.",
    help: "Optional",
    target: "staff invite suggestion staging",
    importMode: "direct",
  },
  {
    key: "serviceCatalog",
    label: "Service catalog / canned jobs",
    description: "Menu services, canned jobs, labor presets, and operation templates.",
    help: "Optional · staged for safe review",
    target: "service catalog staging",
    importMode: "staging",
  },
  {
    key: "appointments",
    label: "Appointments / bookings",
    description: "Scheduled visits, promised times, advisor notes, and booking channels.",
    help: "Optional · staged for safe review",
    target: "appointments staging",
    importMode: "staging",
  },
  {
    key: "other",
    label: "Other / unknown CSV",
    description: "Upload anything not listed above. We stage it for mapping review.",
    help: "Optional · review queue",
    target: "unknown CSV review staging",
    importMode: "staging",
  },
] as const;

export type ShopBoostUploadDataset = (typeof SHOP_BOOST_UPLOAD_DATASETS)[number];
export type ShopBoostUploadDatasetKey = ShopBoostUploadDataset["key"];

export const SHOP_BOOST_DIRECT_IMPORT_DATASETS: ShopBoostUploadDatasetKey[] = [
  "customers",
  "vehicles",
  "history",
  "parts",
  "staff",
];

export const SHOP_BOOST_UPLOAD_DATASET_KEYS = SHOP_BOOST_UPLOAD_DATASETS.map((d) => d.key);

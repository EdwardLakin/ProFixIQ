import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";

export type GoldenFileFixture = {
  fileName: string;
  expectedDomain: OnboardingDomain;
  headers: string[];
  rows: Array<Record<string, string>>;
  minimumCanonicalFields: string[];
  expectedEntityType: string;
  expectedLinkTypes: string[];
};

export const GOLDEN_FILE_FIXTURES: GoldenFileFixture[] = [
  {
    fileName: "customers.csv",
    expectedDomain: "customers",
    headers: ["CustNo", "Customer Name", "E-mail", "Phone Number", "Street Address"],
    rows: [
      { CustNo: "C-100", "Customer Name": "Dana Driver", "E-mail": "dana@example.test", "Phone Number": "555-111-2222", "Street Address": "1 Main St" },
      { CustNo: "C-101", "Customer Name": "Fleet Ops LLC", "E-mail": "fleet@example.test", "Phone Number": "555-222-3333", "Street Address": "2 Main St" },
      { CustNo: "", "Customer Name": "", "E-mail": "", "Phone Number": "", "Street Address": "" },
    ],
    minimumCanonicalFields: ["sourceCustomerId", "name", "email"],
    expectedEntityType: "customer",
    expectedLinkTypes: ["customer_vehicle", "customer_work_order"],
  },
  {
    fileName: "vehicles.csv",
    expectedDomain: "vehicles",
    headers: ["Vehicle-ID", "CustNo", "VIN", "Unit", "Plate #", "Year", "Make", "Model"],
    rows: [
      { "Vehicle-ID": "V-200", CustNo: "C-100", VIN: "1HGCM82633A004352", Unit: "U-1", "Plate #": "ABC123", Year: "2022", Make: "Ford", Model: "Transit" },
      { "Vehicle-ID": "V-201", CustNo: "C-101", VIN: "1HGCM82633A004353", Unit: "U-2", "Plate #": "XYZ999", Year: "2020", Make: "Chevy", Model: "Silverado" },
      { "Vehicle-ID": "", CustNo: "", VIN: "", Unit: "", "Plate #": "", Year: "", Make: "", Model: "" },
    ],
    minimumCanonicalFields: ["sourceVehicleId", "sourceCustomerId", "vin"],
    expectedEntityType: "vehicle",
    expectedLinkTypes: ["customer_vehicle", "vehicle_work_order"],
  },
  {
    fileName: "work_orders_history.csv",
    expectedDomain: "history",
    headers: ["RO Number", "CustNo", "Vehicle-ID", "Opened Date", "Completed Date", "Concern", "Odometer", "Labor Total", "Total"],
    rows: [
      { "RO Number": "RO-300", CustNo: "C-100", "Vehicle-ID": "V-200", "Opened Date": "2025-01-10", "Completed Date": "2025-01-11", Concern: "Brake noise", Odometer: "123450", "Labor Total": "250.00", Total: "450.00" },
      { "RO Number": "RO-301", CustNo: "C-101", "Vehicle-ID": "V-201", "Opened Date": "2025-02-20", "Completed Date": "2025-02-20", Concern: "Oil leak", Odometer: "85400", "Labor Total": "175.00", Total: "300.00" },
      { "RO Number": "", CustNo: "", "Vehicle-ID": "", "Opened Date": "", "Completed Date": "", Concern: "", Odometer: "", "Labor Total": "", Total: "" },
    ],
    minimumCanonicalFields: ["sourceWorkOrderId", "sourceCustomerId", "openedDate", "complaint"],
    expectedEntityType: "historical_work_order",
    expectedLinkTypes: ["customer_work_order", "vehicle_work_order", "work_order_invoice"],
  },
  {
    fileName: "invoices.csv",
    expectedDomain: "invoices",
    headers: ["Inv No", "RO Number", "CustNo", "Invoice Date", "Subtotal", "Tax", "Total", "Status"],
    rows: [
      { "Inv No": "INV-400", "RO Number": "RO-300", CustNo: "C-100", "Invoice Date": "2025-01-12", Subtotal: "420.00", Tax: "30.00", Total: "450.00", Status: "Paid" },
      { "Inv No": "INV-401", "RO Number": "RO-301", CustNo: "C-101", "Invoice Date": "2025-02-21", Subtotal: "280.00", Tax: "20.00", Total: "300.00", Status: "Open" },
      { "Inv No": "", "RO Number": "", CustNo: "", "Invoice Date": "", Subtotal: "", Tax: "", Total: "", Status: "" },
    ],
    minimumCanonicalFields: ["invoiceNumber", "sourceWorkOrderId", "invoiceDate", "total"],
    expectedEntityType: "historical_invoice",
    expectedLinkTypes: ["work_order_invoice"],
  },
  {
    fileName: "parts_inventory.csv",
    expectedDomain: "parts",
    headers: ["Part No", "SKU", "Description", "Vendor Code", "Qty On Hand", "Unit Cost", "List Price", "Bin"],
    rows: [
      { "Part No": "P-500", SKU: "SKU-500", Description: "Brake Pad Kit", "Vendor Code": "Metro Supply", "Qty On Hand": "5", "Unit Cost": "40.00", "List Price": "65.00", Bin: "A1" },
      { "Part No": "P-501", SKU: "SKU-501", Description: "Oil Filter", "Vendor Code": "North Distribution", "Qty On Hand": "10", "Unit Cost": "8.00", "List Price": "13.00", Bin: "B2" },
      { "Part No": "", SKU: "", Description: "", "Vendor Code": "", "Qty On Hand": "", "Unit Cost": "", "List Price": "", Bin: "" },
    ],
    minimumCanonicalFields: ["partNumber", "sku", "description", "vendorName"],
    expectedEntityType: "part",
    expectedLinkTypes: ["vendor_part"],
  },
  {
    fileName: "vendors.csv",
    expectedDomain: "vendors",
    headers: ["Vendor Code", "Vendor Name", "Vendor Email", "Vendor Phone", "Account Number"],
    rows: [
      { "Vendor Code": "VEN-1", "Vendor Name": "Metro Supply", "Vendor Email": "orders@metro.test", "Vendor Phone": "555-555-0001", "Account Number": "ACCT-1" },
      { "Vendor Code": "VEN-2", "Vendor Name": "North Distribution", "Vendor Email": "orders@north.test", "Vendor Phone": "555-555-0002", "Account Number": "ACCT-2" },
      { "Vendor Code": "", "Vendor Name": "", "Vendor Email": "", "Vendor Phone": "", "Account Number": "" },
    ],
    minimumCanonicalFields: ["sourceVendorId", "name", "email"],
    expectedEntityType: "vendor",
    expectedLinkTypes: ["vendor_part"],
  },
  {
    fileName: "staff_users.csv",
    expectedDomain: "staff",
    headers: ["Employee Name", "Employee_ID", "Job-Title", "Email Address", "Phone", "userName"],
    rows: [
      { "Employee Name": "Alex Tech", Employee_ID: "E-1", "Job-Title": "Technician", "Email Address": "alex@shop.test", Phone: "555-111-0000", userName: "alextech" },
      { "Employee Name": "Jamie Advisor", Employee_ID: "E-2", "Job-Title": "Advisor", "Email Address": "jamie@shop.test", Phone: "555-222-0000", userName: "jamieadvisor" },
      { "Employee Name": "", Employee_ID: "", "Job-Title": "", "Email Address": "", Phone: "", userName: "" },
    ],
    minimumCanonicalFields: ["name", "email", "role"],
    expectedEntityType: "staff_candidate",
    expectedLinkTypes: [],
  },
  {
    fileName: "service_catalog.csv",
    expectedDomain: "menu",
    headers: ["Service ID", "Service Name", "service_description", "Labor Hours", "Labor Price", "Parts Price", "Category"],
    rows: [
      { "Service ID": "S-1", "Service Name": "Brake Inspection", service_description: "Brake system check", "Labor Hours": "1.2", "Labor Price": "145.00", "Parts Price": "0", Category: "Safety" },
      { "Service ID": "S-2", "Service Name": "Transmission Service", service_description: "Fluid + filter", "Labor Hours": "2.4", "Labor Price": "290.00", "Parts Price": "80", Category: "Powertrain" },
      { "Service ID": "", "Service Name": "", service_description: "", "Labor Hours": "", "Labor Price": "", "Parts Price": "", Category: "" },
    ],
    minimumCanonicalFields: ["serviceName", "description", "laborHours", "laborPrice"],
    expectedEntityType: "menu_suggestion",
    expectedLinkTypes: ["service_menu_suggestion"],
  },
];

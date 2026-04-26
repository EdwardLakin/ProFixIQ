export const SHOP_BOOST_ONBOARDING_REPLAY_FIXTURE = {
  customersCsv: `  Customer ID , Full NAME , EMAIL , Phone Number ,Company Name
CUST-001,  Casey Driver  ,  Casey.Driver@Example.com  , (555) 111-2222 , Fleet One
 , Casey Driver,casey.driver@example.COM,5551112222,Fleet One
 ,  ,   ,   , 
`,
  vehiclesCsv: `Vehicle ID,Customer ID,VIN,License Plate,Unit Number,Year,Make,Model,Customer Email,Customer Phone,Customer Name
VEH-001,CUST-001,1FTFW1E50PFA00001,PLT-901,U-9,2020,Ford,F-150,CASEY.DRIVER@EXAMPLE.COM,555-111-2222,Casey Driver
,CUST-001, , plt-901 , u-9 ,2020,Ford,F-150,casey.driver@example.com,(555)111-2222,Casey Driver
,,2HGES16555H000002,UNKNOWN-PLATE,U-404,2019,Honda,Civic,,,
`,
  historyCsv: `RO ID,Customer ID,Vehicle ID,Invoice Number,Service Date,Complaint,Cause,Correction,Total,Labor Total,Labor Hours,Parts Total,Customer Email,Customer Phone,VIN,License Plate,Unit Number,Customer Name
WO-001,CUST-001,VEH-001,INV-1001,2025-02-10,No start,Battery failed,Replaced battery,250.00,150.00,1.5,100.00, casey.driver@example.com ,5551112222,1FTFW1E50PFA00001,PLT-901,U-9,Casey Driver
`,
  invoicesCsv: `Invoice ID,Work Order ID,Customer ID,Invoice Number,Date,Total,Labor Total,Parts Total,Customer Email,Customer Phone,RO
INV-1001,WO-001,CUST-001,INV-1001,2025-02-10,275.00,175.00,100.00,CASEY.DRIVER@EXAMPLE.COM,(555) 111-2222,RO-1001
INV-1002,WO-001,CUST-001,INV-1002,2025-02-10,0,0,0,casey.driver@example.com,5551112222,RO-1001
INV-404,WO-404,CUST-404,INV-404,2025-02-10,120.00,50.00,70.00,missing@example.com,5550000000,RO-404
`,
} as const;

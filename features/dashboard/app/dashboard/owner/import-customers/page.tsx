"use client";

import { useEffect, useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import Papa from "papaparse";
import { toast } from "sonner";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

const REQUIRED_FIELDS = [
  "customer_name",
  "customer_email",
  "customer_phone",
  "vehicle_vin",
  "vehicle_year",
  "vehicle_make",
  "vehicle_model",
  "vehicle_plate",
  "vehicle_mileage",
];

type ParsedRow = Record<string, string>;
type ColumnMapping = Record<string, string>;

export default function ImportCustomersPage() {
  const [shopId, setShopId] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchShop = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .single();

      setShopId(profile?.shop_id ?? null);
    };
    fetchShop();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCsvFile(file);
  };

  const parseCSV = () => {
    if (!csvFile) return;

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const headers = results.meta.fields || [];
        setRawHeaders(headers);

        // Run AI mapping
        try {
          const res = await fetch("/api/ai/map-columns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headers }),
          });

          const json = await res.json();
          if (json.mapping) {
            setColumnMapping(json.mapping);
            setParsedData(results.data as ParsedRow[]);
            toast.success(`Mapped ${headers.length} columns with AI.`);
          } else {
            toast.error("AI mapping failed.");
          }
        } catch (err) {
          toast.error("AI mapping error.");
        }
      },
      error: () => {
        toast.error("Failed to parse CSV.");
      },
    });
  };

  const handleMappingChange = (original: string, mapped: string) => {
    setColumnMapping((prev) => ({ ...prev, [original]: mapped }));
  };

  const importData = async () => {
    if (!shopId) return toast.error("Shop ID not found");
    if (!parsedData.length) return toast.error("No data to import");

    setLoading(true);

    for (const row of parsedData) {
      const mapped = Object.entries(columnMapping).reduce(
        (acc, [original, mappedKey]) => {
          acc[mappedKey] = row[original];
          return acc;
        },
        {} as ParsedRow,
      );

      if (!REQUIRED_FIELDS.every((f) => mapped[f])) continue;

      // Insert customer
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", mapped.customer_email)
        .eq("shop_id", shopId)
        .single();

      let customerId = existingCustomer?.id;

      if (!customerId) {
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            full_name: mapped.customer_name,
            email: mapped.customer_email,
            phone_number: mapped.customer_phone,
            shop_id: shopId,
          })
          .select("id")
          .single();

        if (customerError || !newCustomer) {
          toast.error(`Failed to insert customer ${mapped.customer_email}`);
          continue;
        }

        customerId = newCustomer.id;
      }

      // Insert vehicle
      const { error: vehicleError } = await supabase.from("vehicles").insert({
        customer_id: customerId,
        shop_id: shopId,
        vin: mapped.vehicle_vin,
        year: parseInt(mapped.vehicle_year),
        make: mapped.vehicle_make,
        model: mapped.vehicle_model,
        plate: mapped.vehicle_plate,
        mileage: parseInt(mapped.vehicle_mileage),
      });

      if (vehicleError) {
        toast.error(`Failed to insert vehicle for ${mapped.vehicle_vin}`);
      }
    }

    toast.success("Import complete!");
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold text-orange-400 mb-6">
        Import Customers & Vehicles
      </h1>

      <div className="space-y-4">
        <Input type="file" accept=".csv" onChange={handleFileChange} />
        <Button onClick={parseCSV}>Parse CSV</Button>

        {rawHeaders.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-2">Column Mapping</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-orange-300">
                  <th className="text-left p-2">CSV Header</th>
                  <th className="text-left p-2">Mapped Field</th>
                </tr>
              </thead>
              <tbody>
                {rawHeaders.map((header) => (
                  <tr key={header}>
                    <td className="p-2">{header}</td>
                    <td className="p-2">
                      <Input
                        value={columnMapping[header] || ""}
                        onChange={(e) =>
                          handleMappingChange(header, e.target.value)
                        }
                        placeholder="Mapped field"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {parsedData.length > 0 && (
          <>
            <p className="text-sm text-green-400 mt-4">
              {parsedData.length} rows ready to import.
            </p>
            <Button onClick={importData} disabled={loading}>
              {loading ? "Importing..." : "Import to Database"}
            </Button>

            <div className="mt-6 max-h-64 overflow-auto border border-white rounded p-2 text-sm">
              <table className="w-full">
                <thead className="text-orange-300">
                  <tr>
                    {rawHeaders.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.map((row, i) => (
                    <tr key={i} className="border-t border-gray-700">
                      {rawHeaders.map((h) => (
                        <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

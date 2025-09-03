"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@shared/types/types/supabase";
import useVehicleInfo from "@shared/hooks/useVehicleInfo";
import { useUser } from "@auth/hooks/useUser";
import WorkOrderLineForm from "@work-orders/components/WorkOrderLineEditor";

type MenuItem = {
  id: string;
  complaint: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: number | null;
  tools?: string | null;
};

type WorkOrderLine = {
  id?: string;
  complaint: string;
  cause?: string;
  correction?: string;
  labor_time?: number;
  tools?: string;
  status?: "unassigned" | "assigned" | "in_progress" | "on_hold" | "completed" | "awaiting";
  hold_reason?: "parts" | "authorization" | "diagnosis_pending" | "other" | "";
};

export default function WorkOrderEditorPage() {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { vehicleInfo } = useVehicleInfo();
  const { user } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<MenuItem[]>([]);

  useEffect(() => {
    const fetchMenuItems = async () => {
      if (user && vehicleInfo?.id) {
        const { data, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("vehicle_id", vehicleInfo.id);

        if (!error && data) {
          setMenuItems(data as unknown as MenuItem[]);
        }
      }
    };
    fetchMenuItems();
  }, [user, vehicleInfo?.id, supabase]);

  useEffect(() => {
    if (query.trim().length > 1) {
      const q = query.toLowerCase();
      setFiltered(
        menuItems.filter((item) => (item.complaint ?? "").toLowerCase().includes(q)),
      );
    } else {
      setFiltered([]);
    }
  }, [query, menuItems]);

  const handleSuggestionClick = (item: MenuItem) => {
    setLines((prev) => [
      ...prev,
      {
        complaint: item.complaint ?? "",
        cause: item.cause ?? "",
        correction: item.correction ?? "",
        labor_time: item.labor_time ?? 0,
        tools: item.tools ?? "",
        status: "awaiting",
      },
    ]);
    setQuery("");
    setFiltered([]);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Create Work Order</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter complaint (e.g. B for brakes)"
        className="w-full px-3 py-2 border rounded shadow mb-2"
      />

      {filtered.length > 0 && (
        <ul className="bg-white border shadow rounded mb-4 max-h-40 overflow-y-auto">
          {filtered.map((item) => (
            <li
              key={item.id}
              onClick={() => handleSuggestionClick(item)}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
            >
              {(item.complaint ?? "Untitled")} — {item.labor_time ?? 0} hr
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        {lines.map((line, index) => (
  <WorkOrderLineForm
    key={`${line.id ?? "new"}-${index}`}
    line={line}
    onUpdate={(updatedLine: WorkOrderLine) => {
      const updated = [...lines];
      updated[index] = updatedLine;
      setLines(updated);
    }}
    onDelete={() => {
      const updated = [...lines];
      updated.splice(index, 1);
      setLines(updated);
    }}
  />
))}
      </div>
    </div>
  );
}

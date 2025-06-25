"use client";

import { useEffect, useState } from "react";
import { useVehicleInfo } from "@hooks/useVehicleInfo";
import  useUser from "@hooks/useUser";
import { createBrowserClient } from "@supabase/ssr";
import { MenuItem, WorkOrderLine } from "@lib/types";
import WorkOrderLineForm from "@components/WorkOrderLineEditor";

export default function WorkOrderEditorPage() {
  const supabase = createBrowserClient();
  const { vehicle } = useVehicleInfo();
  const { user } = useUser();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<MenuItem[]>([]);

  useEffect(() => {
    const fetchMenuItems = async () => {
      if (user && vehicle?.id) {
        const { data, error } = await supabase
          .from("menu_items")
          .select("*")
          .eq("vehicle_id", vehicle.id);

        if (!error && data) {
          setMenuItems(data);
        }
      }
    };
    fetchMenuItems();
  }, [user, vehicle?.id]);

  useEffect(() => {
    if (query.length > 1) {
      const lowerQuery = query.toLowerCase();
      setFiltered(
        menuItems.filter((item) =>
          item.complaint.toLowerCase().includes(lowerQuery),
        ),
      );
    } else {
      setFiltered([]);
    }
  }, [query, menuItems]);

  const handleSuggestionClick = (item: MenuItem) => {
    setLines([
      ...lines,
      {
        complaint: item.complaint,
        cause: item.cause || "",
        correction: item.correction || "",
        labor_time: item.labor_time || "",
        tools: item.tools || "",
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
              {item.complaint} — {item.labor_time} hr
            </li>
          ))}
        </ul>
      )}

      {lines.map((line, index) => (
        <WorkOrderLineEditor
          key={index}
          line={line}
          onUpdate={(updatedLine) => {
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
  );
}

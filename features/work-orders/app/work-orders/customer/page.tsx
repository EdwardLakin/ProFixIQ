"use client";

import { useState } from "react";

interface WOItem {
  type: "diagnose" | "inspection" | "maintenance";
  description: string;
  selected: boolean;
}

const presetOptions: WOItem[] = [
  { type: "diagnose", description: "Check Engine Light", selected: false },
  { type: "diagnose", description: "Brakes squealing", selected: false },
  { type: "inspection", description: "Safety Inspection", selected: false },
  {
    type: "inspection",
    description: "Pre-Purchase Inspection",
    selected: false,
  },
  { type: "maintenance", description: "Oil Change", selected: false },
  { type: "maintenance", description: "Tire Rotation", selected: false },
];

export default function CustomerWorkOrderPage() {
  const [items, setItems] = useState<WOItem[]>(presetOptions);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const toggleItem = (index: number) => {
    const updated = [...items];
    updated[index].selected = !updated[index].selected;
    setItems(updated);
  };

  const submitWorkOrder = async () => {
    const selectedItems = items.filter((item) => item.selected);
    if (!selectedItems.length || !date || !time)
      return alert("Please complete all fields.");

    const res = await fetch("/api/workorders/create", {
      method: "POST",
      body: JSON.stringify({
        items: selectedItems,
        appointment: `${date} ${time}`,
      }),
    });

    const data = await res.json();
    if (data.success) {
      alert("Work order submitted!");
    } else {
      alert("Something went wrong.");
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-orange-400">
        Build Your Work Order
      </h1>

      <div className="space-y-4">
        {items.map((item, index) => (
          <button
            key={index}
            className={`w-full text-left px-4 py-2 rounded-md border ${
              item.selected
                ? "bg-green-500 text-black"
                : "bg-white/10 text-white"
            }`}
            onClick={() => toggleItem(index)}
          >
            {item.type.toUpperCase()} — {item.description}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        <label className="block text-sm text-white/70">Appointment Date</label>
        <input
          type="date"
          className="w-full rounded-md px-4 py-2 bg-black/30 text-white"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <label className="block text-sm text-white/70">Appointment Time</label>
        <input
          type="time"
          className="w-full rounded-md px-4 py-2 bg-black/30 text-white"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>

      <button
        onClick={submitWorkOrder}
        className="w-full bg-orange-500 text-black font-bold py-3 rounded-md hover:bg-orange-400"
      >
        Submit Work Order
      </button>
    </div>
  );
}

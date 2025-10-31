// features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type VehicleType = "car" | "truck" | "bus" | "trailer";

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Vehicle/customer (prefilled if present in URL)
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");
  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");

  // selections[sectionTitle] = string[]
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [services, setServices] = useState<string[]>([]);
  const [includeAxle, setIncludeAxle] = useState(true);
  const [includeOil, setIncludeOil] = useState(true); // optional add-on

  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      cur.has(item) ? cur.delete(item) : cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  const toggleService = (item: string) =>
    setServices((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));

  function start() {
    const built = buildInspectionFromSelections({
      selections,
      axle: includeAxle ? { vehicleType } : null,
      extraServiceItems: services,
    });

    // Stash the built sections in sessionStorage (used by /inspection/custom-run)
    sessionStorage.setItem("customInspection:sections", JSON.stringify(built));
    sessionStorage.setItem("customInspection:title", title);
    sessionStorage.setItem("customInspection:includeOil", JSON.stringify(includeOil));

    // Pass through any existing customer/vehicle params AND add vehicleType + template
    const qs = new URLSearchParams(sp.toString());
    qs.set("vehicleType", vehicleType);
    qs.set("template", title);

    // (Optional) If you ever want to pass raw selections too:
    // qs.set("selections", btoa(JSON.stringify(selections)));

    router.push(`/inspection/custom-run?${qs.toString()}`);
  }

  return (
    <div className="p-4 text-white">
      <h1 className="mb-3 text-2xl font-bold">Build Custom Inspection</h1>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Title</span>
          <input
            className="rounded bg-neutral-800 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Vehicle Type (axle layout)</span>
          <select
            className="rounded bg-neutral-800 px-3 py-2"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          >
            <option value="car">Car (Hydraulic)</option>
            <option value="truck">Truck (Air)</option>
            <option value="bus">Bus (Air)</option>
            <option value="trailer">Trailer (Air)</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeAxle}
            onChange={(e) => setIncludeAxle(e.target.checked)}
          />
          <span>Include Axle Block</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeOil}
            onChange={(e) => setIncludeOil(e.target.checked)}
          />
          <span>Append Oil Change Section</span>
        </label>
      </div>

      {/* Pick items from master list */}
      <div className="mb-8 space-y-4">
        {masterInspectionList.map((sec) => (
          <div
            key={sec.title}
            className="rounded border border-neutral-800 bg-neutral-900 p-3"
          >
            <div className="mb-2 font-semibold text-orange-400">{sec.title}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sec.items.map((i) => {
                const checked = (selections[sec.title] ?? []).includes(i.item);
                return (
                  <label key={i.item} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(sec.title, i.item)}
                    />
                    <span>{i.item}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Optional service add-ons */}
      <div className="mb-8 rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Service Items</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {masterServicesList.flatMap((cat) =>
            cat.items.map((i) => (
              <label key={i.item} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={services.includes(i.item)}
                  onChange={() => toggleService(i.item)}
                />
                <span>{i.item}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <button
        onClick={start}
        className="rounded bg-orange-600 px-4 py-2 font-semibold text-black hover:bg-orange-500"
      >
        Start Inspection
      </button>
    </div>
  );
}
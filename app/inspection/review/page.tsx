// app/inspection/review/page.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const mockInspectionData = [
  {
    section: "Tires",
    items: [
      { name: "Left Front Tire", status: "Pass", notes: "Tread 6mm, 80 psi" },
      { name: "Right Front Tire", status: "Pass", notes: "Tread 7mm, 82 psi" },
    ],
  },
  {
    section: "Brakes",
    items: [
      { name: "Front Pads", status: "Pass", notes: "8mm" },
      { name: "Rotors", status: "Recommend", notes: "38.88mm" },
    ],
  },
  {
    section: "Driveshaft",
    items: [
      { name: "U-Joints", status: "Fail", notes: "#3 U-joint worn" },
    ],
  },
];

export default function ReviewInspectionPage() {
  const [inspectionData, setInspectionData] = useState(mockInspectionData);
  const router = useRouter();

  const handleMarkNA = (sectionIndex: number) => {
    const updated = [...inspectionData];
    updated[sectionIndex].items = updated[sectionIndex].items.map((item) => ({
      ...item,
      status: "N/A",
      notes: "Marked N/A",
    }));
    setInspectionData(updated);
  };

  const handleSubmit = () => {
    console.log("Submitted inspection:", inspectionData);
    router.push("/work-orders"); // or wherever you return
  };

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10 font-blackopsone">
      <div className="max-w-3xl mx-auto bg-white/5 backdrop-blur-lg p-6 rounded-xl border border-white/10">
        <h1 className="text-4xl text-orange-400 mb-6 text-center">Review Inspection</h1>

        {inspectionData.map((section, idx) => (
          <div key={section.section} className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-2xl text-white">{section.section}</h2>
              <button
                onClick={() => handleMarkNA(idx)}
                className="text-sm border border-yellow-400 px-3 py-1 rounded hover:bg-yellow-400 hover:text-black transition"
              >
                Mark Section N/A
              </button>
            </div>
            <ul className="space-y-2">
              {section.items.map((item, itemIdx) => (
                <li key={itemIdx} className="bg-white/10 p-3 rounded text-sm">
                  <strong>{item.name}</strong> – <span className="italic">{item.status}</span>: {item.notes}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <button
          onClick={handleSubmit}
          className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-black py-3 rounded-lg text-xl font-bold"
        >
          Submit Inspection
        </button>
      </div>
    </div>
  );
}
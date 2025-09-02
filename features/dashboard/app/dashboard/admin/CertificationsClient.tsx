"use client";

import React from "react";
// import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
// import type { Database } from "@shared/types/types/supabase";

export default function CertificationsClient() {
  // TODO: show employee certifications & expirations
  // const supabase = createClientComponentClient<Database>();
  // const { data } = await supabase.from("employee_certifications").select("*");

  const sample = [
    { employee: "Jane Tech", type: "ASE A1", expires_at: "2026-03-01" },
    { employee: "Sam Advisor", type: "Service Writer", expires_at: "2025-12-15" },
  ];

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Certifications</h1>

      <div className="overflow-auto rounded border border-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-900/50">
            <tr>
              <th className="px-3 py-2 text-left">Employee</th>
              <th className="px-3 py-2 text-left">Certification</th>
              <th className="px-3 py-2 text-left">Expires</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((r, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="px-3 py-2">{r.employee}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.expires_at}</td>
                <td className="px-3 py-2 text-right">
                  <button className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
                    Renew
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="mt-4 px-3 py-2 rounded bg-orange-600 text-black">
        Add Certification
      </button>
    </div>
  );
}
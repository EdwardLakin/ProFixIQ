"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ShopLoadChart({ data }: { data: Array<{ label: string; count: number }> }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="shop-load-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(227,154,110,0.95)" />
              <stop offset="100%" stopColor="rgba(193,102,59,0.45)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#050b18",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: "10px",
            }}
          />
          <Bar dataKey="count" fill="url(#shop-load-fill)" stroke="rgba(241,171,134,0.92)" strokeWidth={1.5} radius={[7, 7, 1, 1]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

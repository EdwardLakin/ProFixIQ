"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  label: string;
  revenue: number;
  jobs: number;
  profit: number;
};

export default function PerformanceTrendPanel({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -18 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#0b1220",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "10px",
            }}
          />
          <Bar dataKey="revenue" fill="var(--brand-primary,#C1663B)" radius={[5, 5, 0, 0]} />
          <Bar dataKey="profit" fill="var(--brand-accent,#E39A6E)" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

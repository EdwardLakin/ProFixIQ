"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  label: string;
  revenue: number;
  jobs: number;
  profit: number;
};

export function MiniSparkline({ data, dataKey }: { data: TrendPoint[]; dataKey: "revenue" | "profit" | "jobs" }) {
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Area type="monotone" dataKey={dataKey} stroke="var(--brand-accent,#E39A6E)" fill="rgba(227,154,110,0.2)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PerformanceTrendPanel({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[250px] w-full lg:h-[290px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#050b18",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: "10px",
            }}
          />
          <Area type="monotone" dataKey="profit" fill="rgba(227,154,110,0.18)" stroke="rgba(227,154,110,0.9)" strokeWidth={2} />
          <Bar dataKey="revenue" fill="rgba(193,102,59,0.75)" radius={[6, 6, 0, 0]} barSize={18} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

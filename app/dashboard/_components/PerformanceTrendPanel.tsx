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
  knownContribution: number;
};

export function MiniSparkline({
  data,
  dataKey,
}: {
  data: TrendPoint[];
  dataKey: "revenue" | "knownContribution" | "jobs";
}) {
  return (
    <div className="h-14 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Area type="monotone" dataKey={dataKey} stroke="var(--brand-accent,#E39A6E)" fill="rgba(227,154,110,0.2)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PerformanceTrendPanel({
  data,
  heightClassName = "h-[138px] lg:h-[148px]",
}: {
  data: TrendPoint[];
  heightClassName?: string;
}) {
  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: -4, left: -18 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{
              background: "var(--theme-surface-inset)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
              borderRadius: "10px",
            }}
          />
          <Area type="monotone" dataKey="knownContribution" fill="rgba(227,154,110,0.16)" stroke="rgba(227,154,110,0.88)" strokeWidth={2} />
          <Bar dataKey="revenue" fill="rgba(193,102,59,0.72)" radius={[5, 5, 0, 0]} barSize={14} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

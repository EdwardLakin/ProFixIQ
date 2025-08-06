'use client';

import { useEffect, useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { getShopStats } from '@lib/stats/getShopStats';
import { generateStatsPDF } from '@lib/pdf/generateStatsPDF';
import { Button } from '@components/ui/Button';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

const supabase = createClientComponentClient<Database>();
type Range = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type StatsTotals = {
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
  jobs: number;
  techEfficiency: number;
};

type PeriodStats = {
  label: string;
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
};

type ShopStats = {
  shop_id: string;
  start: string;
  end: string;
  total: StatsTotals;
  periods: PeriodStats[];
};

export default function ReportsPage() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('monthly');
  const [stats, setStats] = useState<ShopStats | null>(null); // ✅ Typed
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [goalRevenue, setGoalRevenue] = useState<number>(10000);
  const [filters, setFilters] = useState({ techId: '', invoiceId: '' });

  useEffect(() => {
    const fetchShopId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('profiles')
        .select('shop_id')
        .eq('id', user?.id)
        .single();
      setShopId(data?.shop_id);
    };
    fetchShopId();
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      if (!shopId) return;
      setLoading(true);
      const fetchedStats = await getShopStats(shopId, range, filters);
      setStats(fetchedStats);

      try {
        const res = await fetch('/api/ai/summarize-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stats: fetchedStats, timeRange: range }),
        });
        const json = await res.json();
        setAiSummary(json.summary);
      } catch {
        toast.error('AI summary failed');
      }

      setLoading(false);
    };
    loadStats();
  }, [shopId, range, filters]);

  const handleExportPDF = async () => {
    if (!stats || !chartRef.current) return;
    const canvas = await html2canvas(chartRef.current);
    const imgData = canvas.toDataURL('image/png');
    const blob = await generateStatsPDF(stats, aiSummary || '', range, imgData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ShopStats-${range}.pdf`;
    a.click();
  };

  const chartData =
    stats?.periods?.map((p) => ({
      label: p.label,
      revenue: p.revenue,
      profit: p.profit,
      labor: p.labor,
      expenses: p.expenses,
    })) || [];

  return (
    <div className="p-6 text-white max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-orange-400">Shop Performance Reports</h1>

      <div className="flex gap-2 mb-6 items-center">
        {['weekly', 'monthly', 'quarterly', 'yearly'].map((r) => (
          <Button key={r} onClick={() => setRange(r as Range)} variant={range === r ? 'default' : 'outline'}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </Button>
        ))}
        <Button onClick={handleExportPDF} className="ml-auto">🧾 Export PDF</Button>
      </div>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <input
          type="text"
          placeholder="Filter by Tech ID"
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1"
          value={filters.techId}
          onChange={(e) => setFilters({ ...filters, techId: e.target.value })}
        />
        <input
          type="text"
          placeholder="Filter by Invoice ID"
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1"
          value={filters.invoiceId}
          onChange={(e) => setFilters({ ...filters, invoiceId: e.target.value })}
        />
        <input
          type="number"
          placeholder="🎯 Revenue Goal"
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1"
          value={goalRevenue}
          onChange={(e) => setGoalRevenue(Number(e.target.value))}
        />
      </div>

      {loading && <p className="text-orange-300">Loading stats...</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-6">
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Revenue</p>
              <p className="text-green-400 text-xl">${stats.total.revenue.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Profit</p>
              <p className="text-yellow-400 text-xl">${stats.total.profit.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Labor Cost</p>
              <p className="text-red-400 text-xl">${stats.total.labor.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Expenses</p>
              <p className="text-fuchsia-400 text-xl">${stats.total.expenses.toFixed(2)}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Jobs</p>
              <p className="text-blue-400 text-xl">{stats.total.jobs}</p>
            </div>
            <div className="bg-gray-900 p-4 rounded shadow">
              <p className="text-orange-300 font-semibold">Tech Efficiency</p>
              <p className="text-cyan-300 text-xl">{stats.total.techEfficiency.toFixed(2)}%</p>
            </div>
          </div>

          <div ref={chartRef} className="mb-6 bg-gray-900 p-4 rounded">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <XAxis dataKey="label" stroke="#ccc" />
                <YAxis stroke="#ccc" />
                <Tooltip />
                <Legend />
                <ReferenceLine y={goalRevenue} stroke="#10b981" strokeDasharray="5 5" label="🎯 Goal" />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="labor" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {aiSummary && (
            <div className="bg-gray-800 p-4 rounded shadow">
              <h2 className="text-xl font-semibold text-orange-300 mb-2">AI Summary</h2>
              <p className="whitespace-pre-wrap">{aiSummary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
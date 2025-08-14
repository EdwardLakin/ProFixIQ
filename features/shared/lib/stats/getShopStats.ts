import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  format,
} from "date-fns";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type TimeRange = "weekly" | "monthly" | "quarterly" | "yearly";

interface Filters {
  technicianId?: string;
  invoiceId?: string;
}

export async function getShopStats(
  shopId: string,
  timeRange: TimeRange,
  filters: Filters = {},
) {
    const supabase = createClientComponentClient<Database>();

  const now = new Date();
  let start: Date;
  let end: Date;
  let intervals: Date[];

  switch (timeRange) {
    case "weekly":
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      intervals = eachDayOfInterval({ start, end });
      break;
    case "quarterly":
      start = startOfQuarter(now);
      end = endOfQuarter(now);
      intervals = eachMonthOfInterval({ start, end });
      break;
    case "yearly":
      start = startOfYear(now);
      end = endOfYear(now);
      intervals = eachQuarterOfInterval({ start, end });
      break;
    default:
      start = startOfMonth(now);
      end = endOfMonth(now);
      intervals = eachDayOfInterval({ start, end });
      break;
  }

  // Apply base filters
  let invoiceQuery = supabase
    .from("invoices")
    .select("*")
    .eq("shop_id", shopId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (filters.invoiceId) {
    invoiceQuery = invoiceQuery.eq("id", filters.invoiceId);
  }
  if (filters.technicianId) {
    invoiceQuery = invoiceQuery.eq("tech_id", filters.technicianId);
  }

  const [invoicesRes, expensesRes] = await Promise.all([
    invoiceQuery,
    supabase
      .from("expenses")
      .select("*")
      .eq("shop_id", shopId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString()),
  ]);

  const invoices = invoicesRes.data || [];
  const expenses = expensesRes.data || [];

  const total = {
    revenue: 0,
    profit: 0,
    labor: 0,
    expenses: 0,
    jobs: invoices.length,
    techEfficiency: 0,
  };

  invoices.forEach((inv) => {
    total.revenue += inv.total || 0;
    total.labor += inv.labor_cost || 0;
  });

  expenses.forEach((exp) => {
    total.expenses += exp.amount || 0;
  });

  total.profit = total.revenue - total.labor - total.expenses;
  total.techEfficiency =
    total.labor > 0 ? (total.revenue / total.labor) * 100 : 0;

  const periods = intervals.map((date) => {
    const label =
      timeRange === "weekly"
        ? format(date, "EEE") // e.g. Mon, Tue
        : timeRange === "quarterly"
          ? format(date, "MMM") // e.g. Jan, Feb
          : format(date, "Q"); // e.g. 1, 2, 3

    const periodInvoices = invoices.filter((inv) => {
      const created = new Date(inv.created_at);
      return format(created, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
    });

    const periodRevenue = periodInvoices.reduce(
      (sum, inv) => sum + (inv.total || 0),
      0,
    );
    const periodLabor = periodInvoices.reduce(
      (sum, inv) => sum + (inv.labor_cost || 0),
      0,
    );
    const periodJobs = periodInvoices.length;

    const periodExpenses = expenses
      .filter(
        (exp) =>
          format(new Date(exp.created_at), "yyyy-MM-dd") ===
          format(date, "yyyy-MM-dd"),
      )
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const periodProfit = periodRevenue - periodLabor - periodExpenses;

    return {
      label,
      revenue: periodRevenue,
      labor: periodLabor,
      expenses: periodExpenses,
      profit: periodProfit,
      jobs: periodJobs,
    };
  });

  return {
    shop_id: shopId,
    range: timeRange,
    start: start.toISOString(),
    end: end.toISOString(),
    total,
    periods,
  };
}

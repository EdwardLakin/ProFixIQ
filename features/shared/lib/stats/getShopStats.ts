// @shared/lib/stats/getShopStats.ts

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

export type TimeRange = "weekly" | "monthly" | "quarterly" | "yearly";

export interface ShopStatsFilters {
  technicianId?: string;
  invoiceId?: string;
}

type DB = Database;
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type ExpenseRow = DB["public"]["Tables"]["expenses"]["Row"];

export type StatsTotals = {
  revenue: number;
  profit: number;
  labor: number;
  expenses: number;
  jobs: number;
  techEfficiency: number;
};

export type PeriodStats = {
  label: string;
  revenue: number;
  labor: number;
  expenses: number;
  profit: number;
  jobs: number;
};

export type ShopStats = {
  shop_id: string;
  range: TimeRange;
  start: string;
  end: string;
  total: StatsTotals;
  periods: PeriodStats[];
};

export type ShopStatsOptions = {
  /** Optional override for date boundaries (useful for calendar-year selection) */
  start?: Date;
  end?: Date;
};

/**
 * Financial shop stats:
 * - revenue      → from invoices.total
 * - labor        → from invoices.labor_cost
 * - expenses     → from expenses.amount
 * - profit       → revenue - labor - expenses
 * - jobs         → count of invoices
 * - techEfficiency → revenue / labor * 100 (approx)
 */
export async function getShopStats(
  shopId: string,
  timeRange: TimeRange,
  filters: ShopStatsFilters = {},
  options: ShopStatsOptions = {},
): Promise<ShopStats> {
  const supabase = createClientComponentClient<Database>();

  const now = new Date();

  // If caller provides explicit start/end, use them.
  // Otherwise compute from the current date + timeRange.
  let start: Date;
  let end: Date;
  let intervals: Date[];

  const hasCustomRange = options.start instanceof Date && options.end instanceof Date;

  if (hasCustomRange) {
    start = options.start as Date;
    end = options.end as Date;

    switch (timeRange) {
      case "weekly":
      case "monthly":
        intervals = eachDayOfInterval({ start, end });
        break;
      case "quarterly":
        intervals = eachMonthOfInterval({ start, end });
        break;
      case "yearly":
      default:
        intervals = eachQuarterOfInterval({ start, end });
        break;
    }
  } else {
    switch (timeRange) {
      case "weekly": {
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        intervals = eachDayOfInterval({ start, end });
        break;
      }
      case "quarterly": {
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        intervals = eachMonthOfInterval({ start, end });
        break;
      }
      case "yearly": {
        start = startOfYear(now);
        end = endOfYear(now);
        intervals = eachQuarterOfInterval({ start, end });
        break;
      }
      case "monthly":
      default: {
        start = startOfMonth(now);
        end = endOfMonth(now);
        intervals = eachDayOfInterval({ start, end });
        break;
      }
    }
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Base invoice query
  let invoiceQuery = supabase
    .from("invoices")
    .select("*")
    .eq("shop_id", shopId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

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
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];

  const total: StatsTotals = {
    revenue: 0,
    profit: 0,
    labor: 0,
    expenses: 0,
    jobs: invoices.length,
    techEfficiency: 0,
  };

  for (const inv of invoices) {
    const revenue = Number(inv.total ?? 0);
    const labor = Number(inv.labor_cost ?? 0);
    total.revenue += Number.isFinite(revenue) ? revenue : 0;
    total.labor += Number.isFinite(labor) ? labor : 0;
  }

  for (const exp of expenses) {
    const amount = Number(exp.amount ?? 0);
    total.expenses += Number.isFinite(amount) ? amount : 0;
  }

  total.profit = total.revenue - total.labor - total.expenses;
  total.techEfficiency = total.labor > 0 ? (total.revenue / total.labor) * 100 : 0;

  // Helper: "bucket" key by time range
  const bucketKeyFor = (d: Date): string => {
    switch (timeRange) {
      case "weekly":
      case "monthly":
        return format(d, "yyyy-MM-dd"); // by day
      case "quarterly":
        return format(d, "yyyy-MM"); // by month
      case "yearly":
        return `${format(d, "yyyy")}-Q${format(d, "Q")}`; // by quarter
      default:
        return format(d, "yyyy-MM-dd");
    }
  };

  const periods: PeriodStats[] = intervals.map((date) => {
    let label: string;

    switch (timeRange) {
      case "weekly":
        label = format(date, "EEE");
        break;
      case "monthly":
        label = format(date, "d");
        break;
      case "quarterly":
        label = format(date, "MMM");
        break;
      case "yearly":
        label = `Q${format(date, "Q")}`;
        break;
      default:
        label = format(date, "d");
        break;
    }

    const bucketKey = bucketKeyFor(date);

    const periodInvoices = invoices.filter((inv) => {
      const created = new Date(inv.created_at as string);
      return bucketKeyFor(created) === bucketKey;
    });

    const periodExpenses = expenses.filter((exp) => {
      const created = new Date(exp.created_at as string);
      return bucketKeyFor(created) === bucketKey;
    });

    const periodRevenue = periodInvoices.reduce<number>(
      (sum, inv) => sum + Number(inv.total ?? 0),
      0,
    );

    const periodLabor = periodInvoices.reduce<number>(
      (sum, inv) => sum + Number(inv.labor_cost ?? 0),
      0,
    );

    const periodExpensesTotal = periodExpenses.reduce<number>(
      (sum, exp) => sum + Number(exp.amount ?? 0),
      0,
    );

    const periodProfit = periodRevenue - periodLabor - periodExpensesTotal;

    return {
      label,
      revenue: periodRevenue,
      labor: periodLabor,
      expenses: periodExpensesTotal,
      profit: periodProfit,
      jobs: periodInvoices.length,
    };
  });

  return {
    shop_id: shopId,
    range: timeRange,
    start: startIso,
    end: endIso,
    total,
    periods,
  };
}
/**
 * Payroll Engine
 * Generates exportable payroll data for Wagepoint / Payworks / Dayforce.
 */

export interface PayrollEmployee {
  id: string;
  name: string;
  hourlyRate: number;
}

export interface PayrollEntry {
  employeeId: string;
  date: string;
  hours: number;
  overtimeHours: number;
}

export interface PayrollExport {
  provider: "wagepoint" | "payworks" | "dayforce";
  periodStart: string;
  periodEnd: string;
  entries: PayrollEntry[];
}

export function generatePayrollExport(payload: PayrollExport) {
  return JSON.stringify(payload, null, 2);
}

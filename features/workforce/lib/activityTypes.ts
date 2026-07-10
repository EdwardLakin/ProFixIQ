export type WorkforceOperationalState =
  | "working_on_job"
  | "clocked_in_idle"
  | "on_break"
  | "on_lunch"
  | "off_shift"
  | "shift_ended";
export type WorkforceExceptionSeverity = "blocking" | "warning" | "info";
export type WorkforceExceptionCode =
  | "clocked_in_no_active_job"
  | "active_job_off_shift"
  | "multiple_active_jobs"
  | "shift_ended_with_active_job"
  | "active_job_unassigned"
  | "long_break"
  | "long_lunch"
  | "job_over_estimate"
  | "overlapping_job_segments";
export type WorkforceActivityException = {
  code: WorkforceExceptionCode;
  severity: WorkforceExceptionSeverity;
  message: string;
  recommendedAction: string;
  relatedEmployeeId?: string | null;
  relatedWorkOrderId?: string | null;
  relatedLineId?: string | null;
};
export type WorkforceCurrentJob = {
  laborSegmentId: string;
  workOrderId: string;
  workOrderNumber: string | null;
  workOrderStatus: string | null;
  lineId: string;
  lineDescription: string | null;
  jobType: string | null;
  customerId: string | null;
  customerName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  jobStartedAt: string;
  elapsedMinutes: number;
  assignedTechId: string | null;
};
export type WorkforceTodayMetrics = {
  shiftMinutes: number;
  breakMinutes: number;
  lunchMinutes: number;
  jobMinutes: number;
  productiveMinutes: number;
  idleMinutes: number;
  soldLaborHours: number;
  completedJobCount: number;
};
export type WorkforceTechnicianActivity = {
  userId: string;
  employeeName: string;
  employeeEmail: string | null;
  workforceRole: string | null;
  shiftId: string | null;
  shiftStatus: string | null;
  shiftActivity: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  latestShiftEventType: string | null;
  latestShiftEventAt: string | null;
  currentJob: WorkforceCurrentJob | null;
  today: WorkforceTodayMetrics;
  operationalState: WorkforceOperationalState;
  exceptions: WorkforceActivityException[];
};
export type WorkforceActivityFeedItem = {
  id: string;
  timestamp: string;
  employeeName: string;
  action: string;
  workOrderNumber?: string | null;
  lineDescription?: string | null;
  workOrderId?: string | null;
  lineId?: string | null;
};
export type WorkforceActivitySummary = {
  activeTechnicians: number;
  workingOnJobs: number;
  idleTechnicians: number;
  onBreak: number;
  onLunch: number;
  endedToday: number;
  jobMinutesToday: number;
  soldLaborHoursToday: number;
  utilizationPct: number;
  activeExceptionCount: number;
};
export type WorkforceActivityResponse = {
  activities: WorkforceTechnicianActivity[];
  feed: WorkforceActivityFeedItem[];
  summary: WorkforceActivitySummary;
  generatedAt: string;
  sourceMap: Record<string, string>;
};

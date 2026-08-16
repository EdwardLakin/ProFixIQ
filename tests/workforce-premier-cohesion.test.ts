import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidPayrollDateKey } from "../features/payroll-time/lib/payPeriodBounds";
import { evaluateDailyRestPolicy } from "../features/payroll-time/server/payrollTime";
import { composeActiveWorkforceRoster } from "../features/workforce/lib/roster";
import { composeWorkforceActivity } from "../features/workforce/server/buildWorkforceActivity";

const read = (path: string) => readFileSync(path, "utf8");

const identityMigration = read(
  "supabase/migrations/20260728213000_workforce_canonical_identity.sql",
);
const menuMigration = read(
  "supabase/migrations/20260728213100_atomic_menu_item_parts_intake.sql",
);
const menuIntakeCompletionMigration = read(
  "supabase/migrations/20260728213400_complete_menu_item_parts_intake.sql",
);
const payrollApprovalMigration = read(
  "supabase/migrations/20260728213300_harden_payroll_readiness_approval.sql",
);
const scheduleOverrideMigration = read(
  "supabase/migrations/20260728213500_atomic_staff_schedule_overrides.sql",
);
const adminAccess = read("features/shared/lib/server/admin-access.ts");
const canonicalProfile = read("features/shared/lib/authenticated-profile.ts");
const selfRoute = read("app/api/workforce/me/route.ts");
const mobileShiftRoute = read("app/api/mobile/shifts/route.ts");
const selfCard = read("features/workforce/components/MyWorkforceCard.tsx");
const attendanceRoute = read("app/api/scheduling/shifts/route.ts");
const attendancePage = read(
  "app/dashboard/workforce/attendance/page.tsx",
);
const payrollPage = read(
  "app/dashboard/workforce/payroll-review/page.tsx",
);
const schedulingPage = read(
  "app/dashboard/workforce/scheduling/page.tsx",
);
const attendanceUi = read(
  "features/dashboard/app/dashboard/workforce/AttendanceOverviewClient.tsx",
);
const schedulingRoute = read("app/api/scheduling/staff/route.ts");
const schedulingUi = read(
  "features/dashboard/app/dashboard/admin/scheduling/WorkforceSchedulingClient.tsx",
);
const timeOffRoute = read("app/api/time-off/requests/route.ts");
const payrollRoute = read("app/api/payroll-time/periods/route.ts");
const payrollUi = read(
  "features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient.tsx",
);
const payrollServer = read("features/payroll-time/server/payrollTime.ts");
const activityUi = read(
  "features/dashboard/app/dashboard/admin/AuditClient.tsx",
);
const documentsUi = read(
  "features/dashboard/app/dashboard/workforce/WorkforceDocumentsClient.tsx",
);
const certificationCreateRoute = read(
  "app/api/admin/people/[id]/certifications/route.ts",
);
const certificationUpdateRoute = read(
  "app/api/admin/people/[id]/certifications/[certId]/route.ts",
);
const certificationReadinessRoute = read(
  "app/api/workforce/certifications-readiness/route.ts",
);
const certificationReadinessPage = read(
  "app/dashboard/workforce/certifications/page.tsx",
);
const certificationReadinessUi = read(
  "features/dashboard/app/dashboard/workforce/WorkforceCertificationsClient.tsx",
);
const workforceNavigation = read(
  "features/dashboard/app/dashboard/workforce/workforceNavigation.ts",
);
const workforceOverviewRoute = read("app/api/workforce/overview/route.ts");
const flatRateUi = read(
  "features/workforce/components/FlatRateCreditReview.tsx",
);
const inspectionBuilder = read(
  "features/inspections/app/inspection/custom-inspection/page.tsx",
);
const menuRoute = read("app/api/menu/save/route.ts");
const menuPage = read("app/menu/page.tsx");
const menuItemPage = read("app/menu/item/[id]/page.tsx");
const menuItemRoute = read("app/api/menu/item/[id]/route.ts");
const partsRequestQueue = read("app/parts/requests/page.tsx");
const menuIntakeRoute = read(
  "app/api/parts/requests/items/[itemId]/menu-intake/route.ts",
);
const menuIntakeModal = read(
  "features/parts/components/MenuItemPartsIntakeModal.tsx",
);
const workOrderDetail = read("app/work-orders/[id]/Client.tsx");
const assignablesRoute = read("app/api/assignables/route.ts");

describe("premier workforce cohesion", () => {
  it("resolves both historical and canonical profile identity shapes", () => {
    expect(adminAccess).toContain("resolveAuthenticatedStaffProfile");
    expect(adminAccess).toContain("resolveCanonicalStaffProfile");
    expect(canonicalProfile).toContain('.eq("id", authUserId)');
    expect(canonicalProfile).toContain('.eq("user_id", authUserId)');
    expect(identityMigration).toContain(
      "create or replace function public.profixiq_workforce_profile_id()",
    );
    expect(identityMigration).not.toContain(
      "create or replace function public.set_current_shop_id",
    );
    expect(identityMigration).toContain("or p.user_id = auth.uid()");

    for (const policy of [
      '"own-shifts"',
      '"own-punches"',
      "staff_schedule_templates_shop_select",
      "staff_schedule_overrides_shop_select",
      "staff_time_off_requests_shop_select",
      "staff_availability_blocks_shop_select",
      "payroll_time_entries_scoped_select",
      "payroll_time_exceptions_scoped_select",
      "flat_rate_credits_scoped_select",
      "shift_corrections_shop_select",
    ]) {
      expect(identityMigration).toContain(policy);
    }
    expect(identityMigration).toContain(
      "public.profixiq_workforce_profile_id()",
    );
    expect(identityMigration).toContain("set search_path = ''");
    expect(identityMigration).toContain(
      "create or replace function public.profixiq_workforce_shop_id()",
    );
    expect(identityMigration).toContain(
      "shop_id = (select public.profixiq_workforce_shop_id())",
    );
    expect(identityMigration).toContain(
      "revoke all on function public.profixiq_can_manage_workforce()",
    );
  });

  it("puts the signed-in employee and real punch clock in Workforce Command", () => {
    expect(selfRoute).toContain("display_name:");
    expect(selfRoute).toContain('.eq("status", "active")');
    expect(selfRoute).toContain("shopLocalDateTimeToUtc");
    expect(selfCard).toContain("Signed in as");
    expect(selfCard).toContain("data?.profile.display_name");
    expect(selfCard).toContain("Employee profile unavailable");
    expect(selfCard).toContain("<ShiftTracker userId={data.profile.id}");
    expect(selfCard).toContain('"workforce:shift-state"');
    expect(mobileShiftRoute).toContain("p_user_id: a.me.id");
    expect(mobileShiftRoute).toContain("p_profile_id: a.me.id");
    expect(mobileShiftRoute).toContain(
      '.from("work_order_line_technicians")',
    );
    expect(mobileShiftRoute).toContain(
      "line.assigned_tech_id === params.userId",
    );
    expect(mobileShiftRoute).toContain("Boolean(additionalAssignment)");
  });

  it("uses daily shifts, punches, recorded hours, and job time in attendance", () => {
    expect(attendanceRoute).toContain("composeActiveWorkforceRoster");
    expect(attendanceRoute).toContain("sumPairedOverlapDurations");
    expect(attendanceRoute).toContain("punchCount:");
    expect(attendanceRoute).toContain("recordedMinutes:");
    expect(attendanceRoute).toContain("activity.today.jobMinutes");
    expect(attendanceRoute).toContain("visibleRosterIds");
    expect(attendancePage).toContain("shopLocalDateTimeToUtc");
    expect(attendancePage).toContain("isValidScheduleDateKey");
    expect(attendancePage).not.toContain(
      "`${requestedDate}T12:00:00.000Z`",
    );
    expect(attendanceUi).toContain("Daily workforce");
    expect(attendanceUi).toContain("Clocked in now");
    expect(attendanceUi).toContain("employee.employeeName");
    expect(attendanceUi).toContain("employee.punchCount");
    expect(attendanceUi).toContain("formatShiftRange");
  });

  it("keeps one-off schedule overrides atomic, visible, and deterministic", () => {
    expect(scheduleOverrideMigration).toContain(
      "create or replace function public.save_staff_schedule_override_atomic",
    );
    expect(scheduleOverrideMigration).toContain(
      "staff_schedule_overrides_one_active_day_uidx",
    );
    expect(scheduleOverrideMigration).toContain(
      "insert into public.audit_logs",
    );
    expect(scheduleOverrideMigration).toContain("set search_path = ''");
    expect(schedulingUi).toContain("Active one-off overrides");
    expect(schedulingUi).toContain("cancelOverride");
    expect(schedulingUi).toContain("body?.overrides");
    expect(schedulingUi).toContain("todayPosture(s).label");
    expect(schedulingUi).not.toContain('"Available"');
    expect(schedulingRoute).toContain("toDate.getTime() - 1");
  });

  it("shows the active roster and prevents empty payroll approval", () => {
    expect(payrollRoute).toContain("composeActiveWorkforceRoster");
    expect(payrollRoute).toContain('"No recorded shifts"');
    expect(payrollRoute).toContain(
      '"Not payroll-ready — setup incomplete"',
    );
    expect(payrollUi).toContain('params.set("person_id", nextPersonId)');
    expect(payrollUi).toContain("Pay Period Review");
    expect(payrollUi).toContain("punch_event_count");
    expect(payrollServer).toContain(
      'rpc("approve_payroll_period_atomic"',
    );
    expect(payrollServer).toContain(
      'from("people_workforce_profiles").select("updated_at")',
    );
    expect(payrollServer).toContain(
      '"finalize_payroll_export_atomic"',
    );
    expect(payrollServer).not.toContain(
      "Payroll export completed, but the activity record failed",
    );
    expect(payrollServer).toContain('"payroll_setup_incomplete"');
    expect(payrollApprovalMigration).toContain(
      "Cannot approve a payroll period with no recorded employee time",
    );
    expect(payrollApprovalMigration).toContain("for update");
    expect(payrollApprovalMigration).toContain(
      "update public.payroll_time_entries",
    );
    expect(payrollApprovalMigration).toContain(
      "update public.payroll_pay_periods",
    );
    expect(payrollApprovalMigration).toContain("set search_path = ''");
    expect(payrollApprovalMigration).toContain(
      ") from public, anon;",
    );
    expect(payrollApprovalMigration).toContain(
      "people_workforce_profiles",
    );
    expect(payrollApprovalMigration).toContain(
      "recorded employees have incomplete payroll setup",
    );
    expect(payrollApprovalMigration).toContain(
      "workforce.payroll_ready = true",
    );
  });

  it("never exposes raw profile identifiers as workforce display labels", () => {
    expect(activityUi).not.toContain("actor_id");
    expect(activityUi).not.toContain("metadata");
    expect(documentsUi).not.toContain("doc.personEmail ?? doc.userId");
    expect(flatRateUi).not.toContain("technician_id.slice");
    expect(flatRateUi).not.toContain("|| credit.technician_id");
    expect(schedulingRoute).toContain(
      "employee_name: workforceDisplayName(employee)",
    );
    expect(schedulingUi).toContain("person.display_name");
    expect(schedulingUi).not.toContain('person.full_name ?? "Unnamed"');
    expect(timeOffRoute).toContain(
      "employee:user_id(full_name, username, email)",
    );
  });

  it("rejects impossible certification calendar dates", () => {
    for (const route of [
      certificationCreateRoute,
      certificationUpdateRoute,
    ]) {
      expect(route).toContain("isValidScheduleDateKey");
      expect(route).toContain("issueDate === undefined");
      expect(route).toContain("expiryDate === undefined");
      expect(route).not.toContain("new Date(String(value))");
    }
  });

  it("routes every workforce manager to role-safe certification readiness", () => {
    expect(certificationReadinessPage).toContain(
      'allow: ["owner", "admin", "manager"]',
    );
    expect(certificationReadinessRoute).toContain(
      'allowRoles: ["owner", "admin", "manager"]',
    );
    expect(certificationReadinessRoute).toContain(
      "permissions: { canManagePeople }",
    );
    expect(certificationReadinessRoute).toContain(
      "href: canManagePeople",
    );
    expect(certificationReadinessUi).toContain(
      "data?.permissions.canManagePeople && row.href",
    );
    expect(certificationReadinessUi).toContain("View only");
    expect(workforceNavigation).toMatch(
      /href: "\/dashboard\/workforce\/certifications"[\s\S]*?roles: ALL_WORKFORCE_MANAGERS/,
    );
    expect(workforceOverviewRoute).toContain(
      'href: "/dashboard/workforce/certifications#expired"',
    );
    expect(workforceOverviewRoute).toContain(
      'href: "/dashboard/workforce/certifications#expiring-soon"',
    );
    expect(workforceOverviewRoute).not.toContain(
      '"/dashboard/workforce/scheduling?focus=certifications"',
    );
  });

  it("does not send managers into owner/admin-only People routes", () => {
    expect(payrollPage).toContain("canAccessPeople={");
    expect(payrollUi).toContain("canAccessPeople");
    expect(payrollUi).toContain(
      "An owner or admin must complete payroll readiness.",
    );
    expect(schedulingPage).toContain("canAccessPeople={");
    expect(schedulingUi).toContain("canAccessPeople ? (");
    expect(attendanceUi).toContain(
      'shift.user_id && (role === "owner" || role === "admin")',
    );
    expect(workforceOverviewRoute).toContain(
      'href: "/dashboard/workforce/certifications#expired"',
    );
  });

  it("uses shared theme controls with visible selected inspection states", () => {
    expect(inspectionBuilder).toContain(
      'import { buttonClasses } from "@/features/shared/components/ui/Button"',
    );
    expect(inspectionBuilder).toContain(
      "bg-[color:var(--brand-primary)]",
    );
    expect(inspectionBuilder).toContain("aria-pressed={includeOil}");
    expect(inspectionBuilder).toContain("aria-pressed={includeTireGrid}");
    expect(inspectionBuilder).toContain("aria-pressed={includeBatteryGrid}");
    expect(inspectionBuilder).toContain(
      "aria-pressed={includeGreaseChassis}",
    );
    expect(inspectionBuilder).toContain(
      'variant: active ? "default" : "secondary"',
    );
  });

  it("creates menu items, attached parts, and internal intake atomically", () => {
    expect(menuMigration).toContain(
      "create or replace function public.create_menu_item_with_parts_intake",
    );
    expect(menuMigration).not.toContain(
      "create or replace function public.sync_menu_item_part_intake",
    );
    expect(menuMigration).not.toContain("trg_sync_menu_item_part_intake");
    expect(menuMigration).toContain("insert into public.menu_items");
    expect(menuMigration).toContain("insert into public.menu_item_parts");
    expect(menuMigration).toContain("insert into public.part_requests");
    expect(menuMigration).toContain("insert into public.part_request_items");
    expect(menuMigration).toContain("'requested'");
    expect(menuMigration).toContain("on delete set null");
    expect(menuMigration).toContain("source_menu_item_id");
    expect(menuMigration).toContain("source_menu_item_part_id");
    expect(menuMigration).toContain("p_idempotency_key");
    expect(menuMigration).toContain(
      "foreign key (shop_id, source_menu_item_id)",
    );
    expect(menuMigration).toContain(
      "foreign key (shop_id, menu_item_id)",
    );
    expect(menuMigration).toContain("set search_path = ''");
    expect(menuMigration).toContain(
      ") from public, anon;",
    );
    expect(menuRoute).toContain(
      'rpc("create_menu_item_with_parts_intake"',
    );
    expect(menuPage).toContain("idempotency_key:");
    expect(menuPage).toContain(
      "requested automatically whenever this service is added to a work order",
    );
    expect(menuPage).not.toContain("Paste work_order_id");
    expect(menuPage).not.toContain("Create parts request (internal)");
    expect(menuItemPage).toContain(
      "Parts are synchronized with internal Parts intake",
    );
    expect(menuItemPage).toContain(
      "Changed or new",
    );
    expect(menuItemPage).not.toContain("Paste work_order_id");
    expect(partsRequestQueue).toContain("source_menu_item_id");
    expect(partsRequestQueue).toContain("Menu intake");
    expect(partsRequestQueue).toContain("MenuItemPartsIntakeModal");
    expect(menuItemRoute).toContain(
      'rpc("update_menu_item_with_parts_intake"',
    );
    expect(menuItemRoute).toContain(
      'rpc("delete_menu_item_with_parts_intake"',
    );
    expect(menuItemPage).toContain("id: p.id");
    expect(menuIntakeRoute).toContain(
      'requiredCapability: "canManageParts"',
    );
    expect(menuIntakeRoute).toContain(
      'rpc("review_menu_item_part_intake"',
    );
    expect(menuIntakeModal).toContain("Link and price");
    expect(menuIntakeCompletionMigration).toContain(
      "create or replace function public.update_menu_item_with_parts_intake",
    );
    expect(menuIntakeCompletionMigration).toContain(
      "create or replace function public.review_menu_item_part_intake",
    );
    expect(menuIntakeCompletionMigration).toContain(
      "create or replace function public.delete_menu_item_with_parts_intake",
    );
    expect(menuIntakeCompletionMigration).not.toMatch(/\belse\s+else\b/i);
    expect(menuIntakeCompletionMigration).toContain(
      "status = case when v_complete then 'fulfilled' else 'requested' end",
    );
    expect(menuIntakeCompletionMigration).toContain(
      "set search_path = ''",
    );
    expect(menuIntakeCompletionMigration).toContain(
      ") from public, anon;",
    );
  });

  it("keeps work-order detail as the focused cockpit with readable technicians", () => {
    expect(workOrderDetail).toContain(
      "desktop keeps the focused cockpit open",
    );
    expect(workOrderDetail).toContain(
      ".or(`id.eq.${uid},user_id.eq.${uid}`)",
    );
    expect(workOrderDetail).toContain("activeTechnicianNames");
    expect(assignablesRoute).toContain(
      '"Employee profile unavailable"',
    );
    expect(assignablesRoute).toContain(
      'requiredCapability: "canAssignWork"',
    );
    expect(assignablesRoute).toContain('scope === "work_order"');
    expect(assignablesRoute).toContain("The user-scoped client proves");
    expect(workOrderDetail).toContain("scope=work_order&work_order_id=");
  });
});

describe("premier workforce data behavior", () => {
  it("keeps shop staff visible while excluding portal identities", () => {
    const roster = composeActiveWorkforceRoster({
      profiles: [
        {
          id: "owner",
          full_name: "Owner Name",
          username: null,
          email: "owner@example.com",
          role: "owner",
        },
        {
          id: "technician",
          full_name: "Technician Name",
          username: null,
          email: "tech@example.com",
          role: "mechanic",
        },
        {
          id: "customer",
          full_name: "Customer Name",
          username: null,
          email: "customer@example.com",
          role: "customer",
        },
        {
          id: "inactive",
          full_name: "Inactive Employee",
          username: null,
          email: "inactive@example.com",
          role: "manager",
        },
      ],
      workforceProfiles: [
        {
          user_id: "inactive",
          employment_status: "inactive",
          payroll_ready: true,
        },
      ],
    });

    expect(roster.map((person) => person.displayName)).toEqual([
      "Owner Name",
      "Technician Name",
    ]);
  });

  it("aggregates every daily shift and keeps punch evidence shop-scoped", () => {
    const activity = composeWorkforceActivity({
      shopId: "shop-a",
      nowIso: "2026-07-28T18:00:00.000Z",
      from: "2026-07-28T00:00:00.000Z",
      to: "2026-07-29T00:00:00.000Z",
      shifts: [
        {
          id: "shift-a",
          shop_id: "shop-a",
          user_id: "employee-a",
          start_time: "2026-07-28T08:00:00.000Z",
          end_time: "2026-07-28T12:00:00.000Z",
          status: "completed",
        },
        {
          id: "shift-b",
          shop_id: "shop-a",
          user_id: "employee-a",
          start_time: "2026-07-28T13:00:00.000Z",
          end_time: "2026-07-28T17:00:00.000Z",
          status: "completed",
        },
        {
          id: "other-shop-shift",
          shop_id: "shop-b",
          user_id: "employee-a",
          start_time: "2026-07-28T00:00:00.000Z",
          end_time: "2026-07-28T18:00:00.000Z",
          status: "completed",
        },
      ],
      profiles: [
        {
          id: "employee-a",
          full_name: "Actual Employee",
          username: null,
          email: "employee@example.com",
          role: "mechanic",
        },
      ],
      punches: [
        {
          id: "break-start",
          shift_id: "shift-a",
          user_id: "employee-a",
          event_type: "break_start",
          timestamp: "2026-07-28T10:00:00.000Z",
        },
        {
          id: "break-end",
          shift_id: "shift-a",
          user_id: "employee-a",
          event_type: "break_end",
          timestamp: "2026-07-28T10:15:00.000Z",
        },
        {
          id: "lunch-start",
          shift_id: "shift-b",
          user_id: "employee-a",
          event_type: "lunch_start",
          timestamp: "2026-07-28T14:00:00.000Z",
        },
        {
          id: "lunch-end",
          shift_id: "shift-b",
          user_id: "employee-a",
          event_type: "lunch_end",
          timestamp: "2026-07-28T14:30:00.000Z",
        },
        {
          id: "other-shop-punch",
          shift_id: "other-shop-shift",
          user_id: "employee-a",
          event_type: "end_shift",
          timestamp: "2026-07-28T18:00:00.000Z",
        },
      ],
      segments: [],
      lines: [],
      workOrders: [],
      customers: [],
      vehicles: [],
    } as unknown as Parameters<typeof composeWorkforceActivity>[0]);

    expect(activity.activities).toHaveLength(1);
    expect(activity.activities[0]?.employeeName).toBe("Actual Employee");
    expect(activity.activities[0]?.today).toMatchObject({
      shiftMinutes: 480,
      breakMinutes: 15,
      lunchMinutes: 30,
      idleMinutes: 435,
    });
    expect(activity.feed.map((item) => item.id)).not.toContain(
      "other-shop-punch",
    );
  });

  it("evaluates break and lunch policy across the full split-shift day", () => {
    const findings = evaluateDailyRestPolicy({
      attendanceMinutes: 480,
      regularBreakCount: 1,
      lunchCount: 0,
      policy: {
        paid_breaks_per_day: 2,
        paid_break_duration_minutes: 15,
        breaks_are_paid: true,
        lunch_is_paid: false,
        default_lunch_duration_minutes: 30,
        lunch_required_after_minutes: 300,
        daily_overtime_after_minutes: 480,
        suspicious_shift_minutes: 960,
      },
    });

    expect(findings.map((finding) => finding.code)).toEqual([
      "missing_lunch",
      "missing_expected_break",
    ]);
  });

  it("rejects impossible payroll anchor dates", () => {
    expect(isValidPayrollDateKey("2026-02-28")).toBe(true);
    expect(isValidPayrollDateKey("2026-02-29")).toBe(false);
    expect(isValidPayrollDateKey("2024-02-29")).toBe(true);
    expect(isValidPayrollDateKey("2026-02-31")).toBe(false);
  });
});

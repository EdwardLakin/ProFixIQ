export type WorkforceRosterIdentity = {
  id: string;
  full_name: string | null;
  username?: string | null;
  email: string | null;
  role?: string | null;
};

export type WorkforceRosterState = {
  user_id: string;
  employment_status: string | null;
  payroll_ready?: boolean | null;
};

export type WorkforceEmploymentStatus = "active" | "inactive" | "on_leave";

export type WorkforceRosterMember = {
  id: string;
  displayName: string;
  fullName: string | null;
  username: string | null;
  email: string | null;
  role: string | null;
  employmentStatus: WorkforceEmploymentStatus;
  payrollReady: boolean;
};

export type ActiveWorkforceRosterMember = Omit<
  WorkforceRosterMember,
  "employmentStatus"
> & {
  employmentStatus: "active";
};

export const WORKFORCE_STAFF_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

const DEFAULT_WORKFORCE_ROLES = new Set<string>([
  ...WORKFORCE_STAFF_ROLES,
  "tech",
  "technician",
  "leadhand",
  "lead hand",
]);

export function isDefaultWorkforceRole(
  role: string | null | undefined,
): boolean {
  return DEFAULT_WORKFORCE_ROLES.has(
    String(role ?? "")
      .trim()
      .toLowerCase(),
  );
}

export function isActiveWorkforceIdentity(params: {
  role: string | null | undefined;
  workforceProfile?: WorkforceRosterState | null;
}): boolean {
  return workforceEmploymentStatus(params) === "active";
}

function workforceEmploymentStatus(params: {
  role: string | null | undefined;
  workforceProfile?: WorkforceRosterState | null;
}): WorkforceEmploymentStatus | null {
  const status = String(
    params.workforceProfile?.employment_status ?? "",
  )
    .trim()
    .toLowerCase();

  if (
    status === "active" ||
    status === "inactive" ||
    status === "on_leave"
  ) {
    return status;
  }

  return isDefaultWorkforceRole(params.role) ? "active" : null;
}

export function workforceDisplayName(
  profile:
    | Pick<WorkforceRosterIdentity, "full_name" | "username" | "email">
    | null
    | undefined,
): string {
  return (
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    profile?.email?.trim() ||
    "Employee profile unavailable"
  );
}

/**
 * Canonical workforce roster semantics shared by Command, Attendance,
 * Scheduling, and Payroll.
 *
 * A staff profile without a workforce extension is treated as active so a
 * provisioning gap cannot make a real employee disappear. Customer, unknown,
 * and external fleet identities are excluded unless they have been explicitly
 * provisioned with an active workforce profile. Explicit inactive and on-leave
 * records are not part of the active operational roster.
 */
export function composeWorkforceRoster(params: {
  profiles: WorkforceRosterIdentity[];
  workforceProfiles: WorkforceRosterState[];
}): WorkforceRosterMember[] {
  const workforceByUser = new Map(
    params.workforceProfiles.map((row) => [row.user_id, row]),
  );

  return params.profiles
    .map((profile) => {
      const workforce = workforceByUser.get(profile.id);
      const employmentStatus = workforceEmploymentStatus({
        role: profile.role,
        workforceProfile: workforce,
      });
      return employmentStatus
        ? {
            id: profile.id,
            displayName: workforceDisplayName(profile),
            fullName: profile.full_name?.trim() || null,
            username: profile.username?.trim() || null,
            email: profile.email?.trim() || null,
            role: profile.role ?? null,
            employmentStatus,
            payrollReady: workforce?.payroll_ready === true,
          }
        : null;
    })
    .filter((profile): profile is WorkforceRosterMember => Boolean(profile))
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id),
    );
}

export function composeActiveWorkforceRoster(params: {
  profiles: WorkforceRosterIdentity[];
  workforceProfiles: WorkforceRosterState[];
}): ActiveWorkforceRosterMember[] {
  return composeWorkforceRoster(params).filter(
    (person): person is ActiveWorkforceRosterMember =>
      person.employmentStatus === "active",
  );
}

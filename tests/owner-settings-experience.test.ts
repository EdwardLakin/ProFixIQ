import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const page = read("features/dashboard/app/dashboard/owner/settings/page.tsx");
const navigation = read(
  "features/dashboard/components/owner-settings/OwnerSettingsNavigation.tsx",
);
const header = read(
  "features/dashboard/components/owner-settings/OwnerSettingsHeader.tsx",
);
const business = read(
  "features/dashboard/components/owner-settings/OwnerSettingsBusinessSection.tsx",
);
const scheduling = read(
  "features/dashboard/components/owner-settings/OwnerSettingsSchedulingSection.tsx",
);
const sidebar = read(
  "features/dashboard/components/owner-settings/OwnerSettingsSidebar.tsx",
);
const teamAccess = read(
  "features/dashboard/components/owner-settings/OwnerSettingsUsersSection.tsx",
);

describe("owner settings experience", () => {
  it("provides a responsive, searchable category navigation", () => {
    expect(navigation).toContain('id="owner-settings-category"');
    expect(navigation).toContain('placeholder="Find a setting"');
    expect(navigation).toContain('aria-current={active ? "page" : undefined}');
    expect(navigation).toContain('id: "communications"');
    expect(navigation).toContain('id: "team"');
    expect(navigation).toContain('id: "billing"');
  });

  it("keeps category URLs shareable and scopes contextual panels", () => {
    expect(page).toContain("SETTINGS_HASH_MAP");
    expect(page).toContain("#settings-${section}");
    expect(page).toContain("contextualSections");
    expect(page).toContain('activeSection === "communications"');
    expect(page).toContain('activeSection === "team"');
    expect(page).toContain('activeSection === "billing"');
    expect(page).toContain("#billing-stripe");
  });

  it("keeps staff account creation available from owner settings", () => {
    expect(navigation).toContain("Team access");
    expect(navigation).toContain("create user staff employee people users password invite role profiles workforce");
    expect(page).toContain('"settings-team": "team"');
    expect(page).toContain("OwnerSettingsUsersSection");
    expect(teamAccess).toContain('id="team-access-create-user"');
    expect(teamAccess).toContain('fetch("/api/admin/create-user"');
    expect(teamAccess).toContain('fetch("/api/admin/reset-user-password"');
    expect(teamAccess).toContain("InviteCandidatesList");
    expect(teamAccess).toContain("UsersList");
    expect(teamAccess).toContain("profiles.email");
    expect(teamAccess).toContain("People/workforce profile");
  });

  it("shows the actual actor and protects unsaved changes", () => {
    expect(header).toContain("roleLabel");
    expect(header).toContain("shopName");
    expect(header).toContain("Discard");
    expect(page).toContain('window.addEventListener("beforeunload"');
    expect(page).toContain("setCoreDirty(true)");
    expect(page).toContain("setHoursDirty(true)");
    expect(page).toContain("setPayrollDirty(true)");
  });

  it("uses persistent field labels and does not advertise unfinished actions", () => {
    for (const label of [
      "Shop name",
      "Street address",
      "City",
      "Phone number",
      "Public email",
    ]) {
      expect(business).toContain(label);
    }

    expect(business).not.toContain("Logo URL");
    expect(business).not.toContain("AI logo maker");
    expect(page).toContain("BrandStudioSummaryCard");
  });

  it("makes scheduling changes and blackout dates clear", () => {
    expect(scheduling).toContain("Copy Monday to weekdays");
    expect(scheduling).toContain("hoursDirty");
    expect(scheduling).toContain("Hours saved");
    expect(scheduling).toContain("Add blackout");
    expect(scheduling).toContain("timezone");
  });

  it("shows only relevant side panels and avoids duplicate billing actions", () => {
    expect(sidebar).toContain("sections.includes(section)");
    expect(
      sidebar.match(/Open billing portal/g)?.length ?? 0,
    ).toBeLessThanOrEqual(1);
    expect(sidebar).toContain("dark:text-red-200");
    expect(sidebar).toContain("dark:text-amber-200");
  });
});

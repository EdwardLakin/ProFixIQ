from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Pattern not found in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


invite_path = "app/api/admin/staff-invite-candidates/[id]/create-user/route.ts"
replace_once(
    invite_path,
    '''function makeTempPassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function POST''',
    '''function makeTempPassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function rollbackProvisionedCandidateUser(
  admin: ReturnType<typeof createAdminSupabase>,
  userId: string,
): Promise<string | null> {
  const cleanupTargets = [
    ["shop_members", "user_id"],
    ["people_workforce_profiles", "user_id"],
    ["profiles", "id"],
  ] as const;

  for (const [table, column] of cleanupTargets) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) return `${table}: ${error.message}`;
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  return authError?.message ?? null;
}

export async function POST''',
)
replace_once(
    invite_path,
    '''    if (profileInsertErr) {
      if (String(profileInsertErr.message ?? "").toLowerCase().includes("shop user limit reached")) {
        return NextResponse.json(
          { error: "Shop user limit reached for your current plan." },
          { status: 400 },
        );
      }
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: profileInsertErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: profileInsertErr.message },
        { status: 500 },
      );
    }
''',
    '''    if (profileInsertErr) {
      const rollbackError = await rollbackProvisionedCandidateUser(
        admin,
        createdUser.user.id,
      );
      const seatLimit = String(profileInsertErr.message ?? "")
        .toLowerCase()
        .includes("shop user limit reached");
      const publicError = rollbackError
        ? "User provisioning failed and automatic cleanup also failed. Contact support before retrying."
        : seatLimit
          ? "Shop user limit reached for your current plan. No account was created."
          : "User provisioning failed. No account was created; you can retry.";

      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: rollbackError
            ? `${profileInsertErr.message}; rollback: ${rollbackError}`
            : profileInsertErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        {
          error: publicError,
          code: rollbackError
            ? "provisioning_rollback_failed"
            : seatLimit
              ? "shop_user_limit_reached"
              : "profile_upsert_failed",
        },
        { status: seatLimit && !rollbackError ? 400 : 500 },
      );
    }
''',
)
replace_once(
    invite_path,
    '''    if (workforceErr) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: workforceErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: workforceErr.message },
        { status: 500 },
      );
    }
''',
    '''    if (workforceErr) {
      const rollbackError = await rollbackProvisionedCandidateUser(
        admin,
        createdUser.user.id,
      );
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: rollbackError
            ? `${workforceErr.message}; rollback: ${rollbackError}`
            : workforceErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        {
          error: rollbackError
            ? "User provisioning failed and automatic cleanup also failed. Contact support before retrying."
            : "User provisioning failed. No account was created; you can retry.",
          code: rollbackError
            ? "provisioning_rollback_failed"
            : "workforce_profile_seed_failed",
        },
        { status: 500 },
      );
    }
''',
)

users_path = "app/api/admin/users/[id]/route.ts"
replace_once(
    users_path,
    '''type TargetCheckOk = { ok: true };
type TargetCheckBad = { ok: false; message: string };
type TargetCheck = TargetCheckOk | TargetCheckBad;
''',
    '''type TargetProfile = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "user_id" | "shop_id" | "role"
>;
type TargetCheckOk = { ok: true; target: TargetProfile };
type TargetCheckBad = { ok: false; message: string };
type TargetCheck = TargetCheckOk | TargetCheckBad;
''',
)
replace_once(
    users_path,
    '''    .select("id, shop_id")
    .eq("id", targetId)
    .maybeSingle<Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "shop_id">>();
''',
    '''    .select("id, user_id, shop_id, role")
    .eq("id", targetId)
    .maybeSingle<TargetProfile>();
''',
)
replace_once(
    users_path,
    '''  return { ok: true };
}
''',
    '''  return { ok: true, target };
}
''',
)
replace_once(
    users_path,
    '''  if (
    roleProvided &&
    canonicalRole !== null &&
    ADMIN_LEVEL_ROLES.has(canonicalRole) &&
    access.canonicalRole !== "owner"
  ) {
    return NextResponse.json({ error: "Only owners can assign owner/admin roles" }, { status: 403 });
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id);
''',
    '''  const previousRole = canonicalizeRole(check.target.role);
  if (
    roleProvided &&
    access.canonicalRole !== "owner" &&
    (canonicalRole !== null && ADMIN_LEVEL_ROLES.has(canonicalRole) ||
      ADMIN_LEVEL_ROLES.has(previousRole))
  ) {
    return NextResponse.json(
      { error: "Only owners can assign or change owner/admin roles" },
      { status: 403 },
    );
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id);
''',
)
replace_once(
    users_path,
    '''  if (roleProvided && canonicalRole !== null) {
    const { error: authErr } = await admin.auth.admin.updateUserById(id, {
      user_metadata: { role: canonicalRole },
    });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }
  }
''',
    '''  if (roleProvided && canonicalRole !== null) {
    const authUserId = check.target.user_id ?? check.target.id;
    const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, {
      user_metadata: { role: canonicalRole },
    });
    if (authErr) {
      const { error: rollbackError } = await admin
        .from("profiles")
        .update({ role: check.target.role })
        .eq("id", id)
        .eq("shop_id", access.profile.shop_id);
      return NextResponse.json(
        {
          error: rollbackError
            ? `${authErr.message}. Restoring the previous role also failed: ${rollbackError.message}`
            : authErr.message,
        },
        { status: 500 },
      );
    }
  }
''',
)

# Expand the focused contract test.
test = Path("tests/codex-review-followup-hardening.test.ts")
text = test.read_text(encoding="utf-8")
anchor = '''    expect(read("features/work-orders/components/MenuQuickAdd.tsx")).toContain(
      "requireMutableWorkOrder",
    );
'''
replacement = anchor + '''    expect(
      read("app/api/admin/staff-invite-candidates/[id]/create-user/route.ts"),
    ).toContain("rollbackProvisionedCandidateUser");
    expect(read("app/api/admin/users/[id]/route.ts")).toContain(
      "Restoring the previous role also failed",
    );
'''
if anchor not in text:
    raise RuntimeError("provisioning test insertion point not found")
test.write_text(text.replace(anchor, replacement, 1), encoding="utf-8")

Path(__file__).unlink(missing_ok=True)
Path(".github/workflows/harden-alternate-user-provisioning.yml").unlink(
    missing_ok=True
)

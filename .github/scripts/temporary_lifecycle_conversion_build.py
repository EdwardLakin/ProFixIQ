from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing patch marker: {label}")
    return text.replace(old, new, 1)

reader_path = Path("features/ops/server/get-marketing-funnel.ts")
reader = reader_path.read_text()
reader = replace_once(
    reader,
    '''type FunnelRpcSnapshot = {\n  generatedAt: string;\n  since: string;\n  breakdownTruncated: boolean;\n  summary: FunnelRpcSummary;\n  rows: MarketingEventRow[];\n};''',
    '''type FunnelLifecycleRpcSummary = {\n  signupCompleted: number;\n  onboardingCompleted: number;\n};\n\ntype FunnelRpcSnapshot = {\n  generatedAt: string;\n  since: string;\n  breakdownTruncated: boolean;\n  summary: FunnelRpcSummary;\n  lifecycleSummary: FunnelLifecycleRpcSummary;\n  rows: MarketingEventRow[];\n};''',
    "lifecycle snapshot type",
)
reader = replace_once(
    reader,
    '''  checkoutStarted: number;\n  intentToCheckoutStartPct: number;\n};''',
    '''  checkoutStarted: number;\n  signupCompleted: number;\n  onboardingCompleted: number;\n  intentToCheckoutStartPct: number;\n  checkoutToSignupPct: number;\n  signupToOnboardingPct: number;\n};''',
    "source row fields",
)
reader = replace_once(
    reader,
    '''  paidCheckouts: number;\n  intentToCheckoutStartPct: number;\n};''',
    '''  paidCheckouts: number;\n  signupCompleted: number;\n  onboardingCompleted: number;\n  intentToCheckoutStartPct: number;\n  checkoutToSignupPct: number;\n  signupToOnboardingPct: number;\n};''',
    "package row fields",
)
reader = replace_once(
    reader,
    '''  summary: FunnelRpcSummary & {\n    checkoutIntentClicks: number;\n    intentToCheckoutStartPct: number;\n  };''',
    '''  summary: FunnelRpcSummary & FunnelLifecycleRpcSummary & {\n    checkoutIntentClicks: number;\n    intentToCheckoutStartPct: number;\n    checkoutToSignupPct: number;\n    signupToOnboardingPct: number;\n  };''',
    "summary fields",
)
reader = replace_once(
    reader,
    '''    const sourcePath =\n      row.event_name === "checkout_started"\n        ? row.checkout_attempt_id\n          ? sourceByAttempt.get(row.checkout_attempt_id) ?? UNATTRIBUTED_SOURCE\n          : UNATTRIBUTED_SOURCE\n        : checkoutIntent\n          ? canonicalSourcePath(row.source_path) ?? UNATTRIBUTED_SOURCE\n          : canonicalSourcePath(row.source_path);''',
    '''    const attemptAttributedEvent =\n      row.event_name === "checkout_started" ||\n      row.event_name === "signup_completed" ||\n      row.event_name === "onboarding_completed";\n    const sourcePath = attemptAttributedEvent\n      ? row.checkout_attempt_id\n        ? sourceByAttempt.get(row.checkout_attempt_id) ?? UNATTRIBUTED_SOURCE\n        : UNATTRIBUTED_SOURCE\n      : checkoutIntent\n        ? canonicalSourcePath(row.source_path) ?? UNATTRIBUTED_SOURCE\n        : canonicalSourcePath(row.source_path);''',
    "source attribution",
)
reader = replace_once(
    reader,
    '''      checkoutStarted: 0,\n      intentToCheckoutStartPct: 0,\n    };''',
    '''      checkoutStarted: 0,\n      signupCompleted: 0,\n      onboardingCompleted: 0,\n      intentToCheckoutStartPct: 0,\n      checkoutToSignupPct: 0,\n      signupToOnboardingPct: 0,\n    };''',
    "source init",
)
reader = replace_once(
    reader,
    '''    if (row.event_name === "checkout_started") current.checkoutStarted += 1;\n    grouped.set(sourcePath, current);''',
    '''    if (row.event_name === "checkout_started") current.checkoutStarted += 1;\n    if (row.event_name === "signup_completed") current.signupCompleted += 1;\n    if (row.event_name === "onboarding_completed") current.onboardingCompleted += 1;\n    grouped.set(sourcePath, current);''',
    "source counts",
)
reader = replace_once(
    reader,
    '''      intentToCheckoutStartPct: pct(\n        row.checkoutStarted,\n        row.trialClicks + row.subscribeClicks,\n      ),\n    }))''',
    '''      intentToCheckoutStartPct: pct(\n        row.checkoutStarted,\n        row.trialClicks + row.subscribeClicks,\n      ),\n      checkoutToSignupPct: pct(row.signupCompleted, row.checkoutStarted),\n      signupToOnboardingPct: pct(row.onboardingCompleted, row.signupCompleted),\n    }))''',
    "source progression",
)
reader = replace_once(
    reader,
    '''  if (row.event_name === "checkout_started" || isCheckoutIntent(row)) {\n    return UNATTRIBUTED_PACKAGE;\n  }''',
    '''  if (\n    row.event_name === "checkout_started" ||\n    row.event_name === "signup_completed" ||\n    row.event_name === "onboarding_completed" ||\n    isCheckoutIntent(row)\n  ) {\n    return UNATTRIBUTED_PACKAGE;\n  }''',
    "package attribution",
)
reader = replace_once(
    reader,
    '''      paidCheckouts: 0,\n      intentToCheckoutStartPct: 0,\n    };''',
    '''      paidCheckouts: 0,\n      signupCompleted: 0,\n      onboardingCompleted: 0,\n      intentToCheckoutStartPct: 0,\n      checkoutToSignupPct: 0,\n      signupToOnboardingPct: 0,\n    };''',
    "package init",
)
reader = replace_once(
    reader,
    '''    if (row.event_name === "checkout_started") {\n      current.checkoutStarted += 1;\n      if (row.checkout_mode === "trial") current.trialCheckouts += 1;\n      if (row.checkout_mode === "paid") current.paidCheckouts += 1;\n    }\n    grouped.set(packageKey, current);''',
    '''    if (row.event_name === "checkout_started") {\n      current.checkoutStarted += 1;\n      if (row.checkout_mode === "trial") current.trialCheckouts += 1;\n      if (row.checkout_mode === "paid") current.paidCheckouts += 1;\n    }\n    if (row.event_name === "signup_completed") current.signupCompleted += 1;\n    if (row.event_name === "onboarding_completed") current.onboardingCompleted += 1;\n    grouped.set(packageKey, current);''',
    "package counts",
)
reader = replace_once(
    reader,
    '''      intentToCheckoutStartPct: pct(\n        row.checkoutStarted,\n        row.trialClicks + row.subscribeClicks,\n      ),\n    }))''',
    '''      intentToCheckoutStartPct: pct(\n        row.checkoutStarted,\n        row.trialClicks + row.subscribeClicks,\n      ),\n      checkoutToSignupPct: pct(row.signupCompleted, row.checkoutStarted),\n      signupToOnboardingPct: pct(row.onboardingCompleted, row.signupCompleted),\n    }))''',
    "package progression",
)
reader = replace_once(
    reader,
    '''    !snapshot.summary ||\n    !Array.isArray(snapshot.rows)''',
    '''    !snapshot.summary ||\n    !snapshot.lifecycleSummary ||\n    !Array.isArray(snapshot.rows)''',
    "snapshot validation",
)
reader = replace_once(
    reader,
    '''  const { data, error } = await admin.rpc("get_ops_marketing_funnel_snapshot", {''',
    '''  const { data, error } = await admin.rpc("get_ops_marketing_lifecycle_funnel_snapshot", {''',
    "rpc switch",
)
reader = replace_once(
    reader,
    '''      intentToCheckoutStartPct: pct(\n        snapshot.summary.checkoutStarted,\n        checkoutIntentClicks,\n      ),\n    },''',
    '''      ...snapshot.lifecycleSummary,\n      intentToCheckoutStartPct: pct(\n        snapshot.summary.checkoutStarted,\n        checkoutIntentClicks,\n      ),\n      checkoutToSignupPct: pct(\n        snapshot.lifecycleSummary.signupCompleted,\n        snapshot.summary.checkoutStarted,\n      ),\n      signupToOnboardingPct: pct(\n        snapshot.lifecycleSummary.onboardingCompleted,\n        snapshot.lifecycleSummary.signupCompleted,\n      ),\n    },''',
    "summary progression",
)
reader_path.write_text(reader)

component_path = Path("features/ops/components/OpsMarketingFunnel.tsx")
component = component_path.read_text()
component = replace_once(
    component,
    '''          Read-only 30-day acquisition telemetry from the first-party marketing event ledger. Counts are event volume,\n          not unique visitors. The measured funnel currently ends at authoritative Stripe checkout start; signup and\n          onboarding completion remain intentionally deferred until their server-side success boundaries are wired.''',
    '''          Read-only 30-day acquisition telemetry from the first-party marketing event ledger. Counts are event volume,\n          not unique visitors. The measured funnel follows authoritative checkout start through newly created acquisition\n          accounts and completed guided onboarding without storing user or shop identifiers in the marketing ledger.''',
    "component intro",
)
component = replace_once(
    component,
    '''        <MetricCard\n          label="Intent → checkout"\n          value={percent(summary.intentToCheckoutStartPct)}\n          detail="Checkout-button progression, not visitor conversion"\n        />\n        <MetricCard label="Demo clicks" value={number(summary.demoClicks)} detail="Public demo acquisition intent" />''',
    '''        <MetricCard label="Signup completed" value={number(summary.signupCompleted)} detail="New acquisition accounts only" />\n        <MetricCard label="Onboarding completed" value={number(summary.onboardingCompleted)} detail="Guided setup completed" />\n        <MetricCard\n          label="Intent → checkout"\n          value={percent(summary.intentToCheckoutStartPct)}\n          detail="Checkout-button progression"\n        />\n        <MetricCard\n          label="Checkout → signup"\n          value={percent(summary.checkoutToSignupPct)}\n          detail="New-account progression"\n        />\n        <MetricCard\n          label="Signup → onboarding"\n          value={percent(summary.signupToOnboardingPct)}\n          detail="Guided-setup progression"\n        />\n        <MetricCard label="Demo clicks" value={number(summary.demoClicks)} detail="Public demo acquisition intent" />''',
    "summary cards",
)
component = replace_once(
    component,
    '''                  <th className="px-3 py-2 text-right font-bold">Checkout start</th>\n                  <th className="px-3 py-2 text-right font-bold">Progression</th>''',
    '''                  <th className="px-3 py-2 text-right font-bold">Checkout start</th>\n                  <th className="px-3 py-2 text-right font-bold">Signup</th>\n                  <th className="px-3 py-2 text-right font-bold">Onboarding</th>\n                  <th className="px-3 py-2 text-right font-bold">Intent → checkout</th>\n                  <th className="px-3 py-2 text-right font-bold">Checkout → signup</th>\n                  <th className="px-3 py-2 text-right font-bold">Signup → onboard</th>''',
    "source headers",
)
component = replace_once(
    component,
    '''                    <td className="px-3 py-3 text-right font-bold">{number(row.checkoutStarted)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>''',
    '''                    <td className="px-3 py-3 text-right font-bold">{number(row.checkoutStarted)}</td>\n                    <td className="px-3 py-3 text-right">{number(row.signupCompleted)}</td>\n                    <td className="px-3 py-3 text-right">{number(row.onboardingCompleted)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.checkoutToSignupPct)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.signupToOnboardingPct)}</td>''',
    "source cells",
)
component = replace_once(
    component,
    '''                  <th className="px-3 py-2 text-right font-bold">Paid starts</th>\n                  <th className="px-3 py-2 text-right font-bold">Progression</th>''',
    '''                  <th className="px-3 py-2 text-right font-bold">Paid starts</th>\n                  <th className="px-3 py-2 text-right font-bold">Signup</th>\n                  <th className="px-3 py-2 text-right font-bold">Onboarding</th>\n                  <th className="px-3 py-2 text-right font-bold">Intent → checkout</th>\n                  <th className="px-3 py-2 text-right font-bold">Checkout → signup</th>\n                  <th className="px-3 py-2 text-right font-bold">Signup → onboard</th>''',
    "package headers",
)
component = replace_once(
    component,
    '''                    <td className="px-3 py-3 text-right">{number(row.paidCheckouts)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>''',
    '''                    <td className="px-3 py-3 text-right">{number(row.paidCheckouts)}</td>\n                    <td className="px-3 py-3 text-right">{number(row.signupCompleted)}</td>\n                    <td className="px-3 py-3 text-right">{number(row.onboardingCompleted)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.intentToCheckoutStartPct)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.checkoutToSignupPct)}</td>\n                    <td className="px-3 py-3 text-right">{percent(row.signupToOnboardingPct)}</td>''',
    "package cells",
)
component_path.write_text(component)

ops_test_path = Path("tests/ops-marketing-funnel.test.ts")
ops_test = ops_test_path.read_text()
ops_test = replace_once(
    ops_test,
    '''const migrationPath =\n  "supabase/migrations/20261007183500_ops_marketing_funnel_snapshot.sql";''',
    '''const migrationPath =\n  "supabase/migrations/20261007183500_ops_marketing_funnel_snapshot.sql";\nconst lifecycleMigrationPath =\n  "supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql";''',
    "test migration path",
)
ops_test = replace_once(
    ops_test,
    '''    const migration = source(migrationPath);\n\n    expect(reader).toContain('.rpc("get_ops_marketing_funnel_snapshot", {');''',
    '''    const migration = source(migrationPath);\n    const lifecycleMigration = source(lifecycleMigrationPath);\n\n    expect(reader).toContain('.rpc("get_ops_marketing_lifecycle_funnel_snapshot", {');\n    expect(lifecycleMigration).toContain("select public.get_ops_marketing_funnel_snapshot(");''',
    "test rpc",
)
ops_test_path.write_text(ops_test)

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export default async function SessionDebug() {
  const sb = createServerComponentClient({ cookies });

  // session + user
  const { data: s } = await sb.auth.getSession();
  const sess = s && s.session ? s.session : null;

  // profile basics (safe columns)
  let profile = null;
  if (sess && sess.user) {
    try {
      const { data } = await sb
        .from("profiles")
        .select("id, shop_id, completed_onboarding")
        .eq("id", sess.user.id)
        .maybeSingle();
      profile = data || null;
    } catch {}
  }

  // current shop id from session (via accessor RPC)
  let currentShopId = null;
  try {
    const { data } = await sb.rpc("get_current_shop_id");
    currentShopId = data || null;
  } catch {}

  // tiny WO probe (does RLS allow the example WC0001 or your first WO?)
  let woProbe = null;
  try {
    const { data } = await sb
      .from("work_orders")
      .select("id, custom_id, shop_id")
      .limit(1);
    woProbe = data || null;
  } catch (e) {
    woProbe = { error: String(e) };
  }

  const dump = {
    session: {
      hasSession: !!sess,
      userId: sess && sess.user ? sess.user.id : null,
      expiresAt: sess ? sess.expires_at : null,
    },
    profile,
    current_shop_id: currentShopId,
    wo_probe: woProbe,
  };

  return (
    <div className="p-6 space-y-4 text-sm">
      <h1 className="text-xl font-semibold">Server Session / RLS Debug</h1>
      <pre className="rounded bg-neutral-900 p-3 overflow-auto">
        {JSON.stringify(dump, null, 2)}
      </pre>
    </div>
  );
}
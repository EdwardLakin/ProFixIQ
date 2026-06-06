import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import PageShell from "@/features/shared/components/PageShell";
import OwnerMarketingSettingsCard from "@/features/integrations/shopreel/components/OwnerMarketingSettingsCard";
import { DEFAULT_SHOPREEL_EVENT_TYPES, getShopReelBaseUrl } from "@/features/integrations/shopreel/server/shopreelConfig";


export default async function OwnerMarketingPage() {
  const supabase = createServerSupabaseRSC();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PageShell title="Marketing">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          You must be signed in.
        </div>
      </PageShell>
    );
  }

  const { data: membership } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!membership?.shop_id) {
    return (
      <PageShell title="Marketing">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          Owner access is required.
        </div>
      </PageShell>
    );
  }

  const { data: integration } = await supabase
    .from("shopreel_integrations")
    .select("*")
    .eq("shop_id", membership.shop_id)
    .maybeSingle();

  return (
    <PageShell title="Marketing">
      <div className="space-y-6">
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-white">
          <h1 className="text-2xl font-semibold">Marketing</h1>
          <p className="mt-2 text-sm text-white/70">
            Connect ProFixIQ to ShopReel and control automated story syncing.
          </p>
        </div>

        <OwnerMarketingSettingsCard
          initialState={{
            shopId: membership.shop_id,
            enabled: integration?.enabled ?? false,
            remoteShopId: integration?.remote_shop_id ?? null,
            shopreelBaseUrl:
              integration?.shopreel_base_url ??
              getShopReelBaseUrl(),
            enabledEventTypes: integration?.enabled_event_types ?? [...DEFAULT_SHOPREEL_EVENT_TYPES],
            lastTestedAt: integration?.last_tested_at ?? null,
            lastSuccessAt: integration?.last_success_at ?? null,
            lastErrorAt: integration?.last_error_at ?? null,
            lastErrorMessage: integration?.last_error_message ?? null,
          }}
        />
      </div>
    </PageShell>
  );
}

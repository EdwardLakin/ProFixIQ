import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = {
  public: {
    Tables: {
      property_members: {
        Row: {
          id: string;
          shop_id: string;
          user_id: string;
          role: string;
          portfolio_id: string | null;
          property_id: string | null;
          unit_id: string | null;
          created_at: string | null;
        };
      };
      property_properties: { Row: { id: string; name: string; portfolio_id: string | null } };
      property_units: { Row: { id: string; property_id: string; unit_label: string } };
      property_portfolios: { Row: { id: string; name: string } };
    };
  };
};

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function PropertyMemberPortalPage() {
  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: memberships } = await supabase
    .from("property_members")
    .select("id,shop_id,user_id,role,portfolio_id,property_id,unit_id,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!(memberships ?? []).length) {
    return (
      <section className="metal-card rounded-3xl p-5">
        <h1 className="text-2xl text-neutral-100">Property member portal</h1>
        <p className="mt-3 text-sm text-neutral-300">
          No property portal access is assigned to this account.
        </p>
      </section>
    );
  }

  const propertyIds = Array.from(new Set((memberships ?? []).map((m) => m.property_id).filter(Boolean))) as string[];
  const unitIds = Array.from(new Set((memberships ?? []).map((m) => m.unit_id).filter(Boolean))) as string[];
  const portfolioIds = Array.from(new Set((memberships ?? []).map((m) => m.portfolio_id).filter(Boolean))) as string[];

  const [propertiesResult, unitsResult, portfoliosResult] = await Promise.all([
    propertyIds.length
      ? supabase.from("property_properties").select("id,name,portfolio_id").in("id", propertyIds)
      : Promise.resolve({ data: [] as DB["public"]["Tables"]["property_properties"]["Row"][], error: null }),
    unitIds.length
      ? supabase.from("property_units").select("id,property_id,unit_label").in("id", unitIds)
      : Promise.resolve({ data: [] as DB["public"]["Tables"]["property_units"]["Row"][], error: null }),
    portfolioIds.length
      ? supabase.from("property_portfolios").select("id,name").in("id", portfolioIds)
      : Promise.resolve({ data: [] as DB["public"]["Tables"]["property_portfolios"]["Row"][], error: null }),
  ]);

  const propertyById = new Map((propertiesResult.data ?? []).map((row) => [row.id, row]));
  const unitById = new Map((unitsResult.data ?? []).map((row) => [row.id, row]));
  const portfolioById = new Map((portfoliosResult.data ?? []).map((row) => [row.id, row]));

  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Portal</p>
      <h1 className="mt-2 text-2xl text-neutral-100">Property member portal</h1>
      <p className="mt-2 text-sm text-neutral-300">Your access comes from assigned property membership scopes.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/portal/property/member/requests" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          View maintenance requests
        </Link>
        <Link href="/portal/property/member/requests/new" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          Submit maintenance request
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-neutral-400">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Shop</th>
            </tr>
          </thead>
          <tbody>
            {(memberships ?? []).map((member) => {
              const property = member.property_id ? propertyById.get(member.property_id) : null;
              const unit = member.unit_id ? unitById.get(member.unit_id) : null;
              const portfolio = member.portfolio_id ? portfolioById.get(member.portfolio_id) : null;

              return (
                <tr key={member.id} className="border-t border-white/10 text-neutral-200">
                  <td className="px-3 py-2">{member.role}</td>
                  <td className="px-3 py-2">
                    <div>Portfolio: {portfolio?.name ?? "All visible portfolios"}</div>
                    <div>Property: {property?.name ?? "All visible properties"}</div>
                    <div>Unit: {unit?.unit_label ?? "All visible units"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-400">{member.shop_id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

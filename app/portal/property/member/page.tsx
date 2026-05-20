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

const portalLinks = [
  { href: "/portal/property/member/requests", label: "Maintenance Requests", description: "Track open and completed requests" },
  { href: "/portal/property/member/requests/new", label: "Submit Request", description: "Report a maintenance issue" },
  { href: "/portal/property/member/inspections", label: "Inspections", description: "View inspection updates and results" },
] as const;

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
        <h1 className="text-2xl text-neutral-100">Property Portal</h1>
        <p className="mt-3 text-sm text-neutral-300">No property portal access is assigned to this account.</p>
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
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Property Access</p>
      <h1 className="mt-2 text-2xl text-neutral-100">Property Portal</h1>
      <p className="mt-2 text-sm text-neutral-300">View maintenance requests, inspections, photos, and property updates.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {portalLinks.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 transition hover:border-cyan-300/50">
            <p className="text-sm font-semibold text-cyan-100">{link.label}</p>
            <p className="mt-1 text-xs text-cyan-200/80">{link.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">Property Access</h2>
        <div className="mt-3 space-y-3">
          {(memberships ?? []).map((member) => {
            const property = member.property_id ? propertyById.get(member.property_id) : null;
            const unit = member.unit_id ? unitById.get(member.unit_id) : null;
            const portfolio = member.portfolio_id ? portfolioById.get(member.portfolio_id) : null;

            return (
              <article key={member.id} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-neutral-200">
                <p className="font-medium text-neutral-100">Assigned role: {member.role}</p>
                <p className="mt-1 text-neutral-300">Portfolio: {portfolio?.name ?? "All visible portfolios"}</p>
                <p className="text-neutral-300">Property: {property?.name ?? "All visible properties"}</p>
                <p className="text-neutral-300">Unit: {unit?.unit_label ?? "All visible units"}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

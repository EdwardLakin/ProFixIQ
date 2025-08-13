"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type StaffRole = "owner" | "admin" | "manager" | "advisor" | "parts";

export default function ShareBookingLink() {
  const supabase = createBrowserClient<Database>();
  const [slug, setSlug] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, shop_id")
        .eq("id", user.id)
        .single();

      if (!profile?.role) return;
      const staffRoles: StaffRole[] = [
        "owner",
        "admin",
        "manager",
        "advisor",
        "parts",
      ];
      const staff = staffRoles.includes(profile.role as StaffRole);
      setIsStaff(staff);

      if (!staff || !profile.shop_id) return;

      const { data: shop } = await supabase
        .from("shop")
        .select("slug")
        .eq("id", profile.shop_id)
        .single();

      if (shop?.slug) setSlug(shop.slug);
    })();
  }, [supabase]);

  if (!isStaff || !slug) return null;

  return (
    <Link
      href={`/portal/shop/${encodeURIComponent(slug)}`}
      className="rounded-md border border-orange-500 px-3 py-1.5 text-sm font-semibold text-orange-400 hover:bg-orange-500 hover:text-black transition"
    >
      Share booking link
    </Link>
  );
}
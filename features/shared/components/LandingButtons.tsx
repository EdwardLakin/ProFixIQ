"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

export default function LandingButtons() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      setRole(profile?.role || null);
    };

    checkAuthAndRole();
  }, []);

  const handleClick = (route: string) => {
    if (isAuthenticated) {
      router.push(route);
    } else {
      router.push(`/sign-in?redirectedFrom=${route}`);
    }
  };

  const getFeatures = () => {
    if (!isAuthenticated) {
      return [
        { label: "AI Diagnosis", route: "/ai" },
        { label: "Manual Library", route: "/manuals" },
        { label: "Compare Plans", route: "/compare-plans" },
      ];
    }

    switch (role) {
      case "mechanic":
        return [
          { label: "Queued Jobs", route: "/work-orders/queue" },
          { label: "Inspections", route: "/inspections" },
          { label: "Parts Requests", route: "/parts/requests" },
        ];
      case "advisor":
        return [
          { label: "Job Queue", route: "/work-orders/queue" },
          { label: "Create Work Order", route: "/work-orders/create" },
          { label: "Customer Messaging", route: "/messages" },
        ];
      case "parts":
        return [
          { label: "Incoming Requests", route: "/parts/incoming" },
          { label: "Parts Inventory", route: "/parts/inventory" },
          { label: "Parts Messaging", route: "/messages" },
        ];
      case "admin":
      case "owner":
      case "manager":
        return [
          { label: "Dashboard", route: "/dashboard/admin" },
          { label: "Manage Users", route: "/dashboard/admin/users" },
          { label: "Work Orders", route: "/work-orders" },
          { label: "Parts Dashboard", route: "/parts" },
        ];
      default:
        return [{ label: "AI Diagnosis", route: "/ai" }];
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-6 sm:px-12 lg:px-24 mt-12">
      {getFeatures().map(({ label, route }) => (
        <button
          key={label}
          onClick={() => handleClick(route)}
          className="rounded-2xl border border-orange-500 bg-black/30 backdrop-blur-md shadow-card hover:shadow-glow text-white px-6 py-8 transition-all duration-300 hover:scale-105"
        >
          <h3 className="text-2xl font-header text-white mb-3">{label}</h3>
          <p className="text-base text-neutral-300 leading-snug">
            {getDescription(label)}
          </p>
        </button>
      ))}
    </div>
  );
}

function getDescription(label: string) {
  switch (label) {
    case "AI Diagnosis":
      return "Chat, Visual, and DTC Code Support";
    case "Manual Library":
      return "OEM + Aftermarket References";
    case "Compare Plans":
      return "View Features by Subscription";
    case "Queued Jobs":
      return "Start and Track Assigned Repairs";
    case "Inspections":
      return "Vehicle Checklists and Status";
    case "Parts Requests":
      return "Request Parts by Job Line";
    case "Job Queue":
      return "Track and Manage Work Orders";
    case "Create Work Order":
      return "Initiate New Repair Job";
    case "Customer Messaging":
      return "Chat with Techs or Customers";
    case "Incoming Requests":
      return "See and Fulfill Part Requests";
    case "Parts Inventory":
      return "Manage Stock and Pricing";
    case "Parts Messaging":
      return "Conversations with Advisors & Techs";
    case "Dashboard":
      return "Admin Reporting and Overview";
    case "Manage Users":
      return "Create, Edit, and Assign Roles";
    case "Work Orders":
      return "All Work Orders in System";
    case "Parts Dashboard":
      return "Complete Parts Management Suite";
    default:
      return "";
  }
}

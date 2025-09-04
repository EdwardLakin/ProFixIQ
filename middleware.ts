// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Role = "owner" | "admin" | "manager" | "advisor" | "parts" | "mechanic" | "tech" | "customer" | null;

const STAFF_HOME: Record<Exclude<Role, "customer" | null>, string> = {
  owner: "/dashboard/owner",
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  advisor: "/dashboard/advisor",
  parts: "/dashboard/parts",
  mechanic: "/dashboard/tech",
  tech: "/dashboard/tech",
};

const PUBLIC_PATHS = new Set<string>([
  "/",
  "/compare-plans",
  "/subscribe",
  "/confirm",
  "/signup",
  "/sign-in",
  "/auth",
  "/onboarding",
  "/favicon.ico",
  "/logo.svg",
]);

// prefix public (static/assets/api)
function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith(".ttf")
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Helper: read role from profiles; default to "customer" when missing
  const getRole = async (): Promise<Role> => {
    if (!session?.user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    // normalize to union type; treat missing/empty as "customer"
    const role = (profile?.role ?? "customer") as Role;
    return role;
  };

  // 1) Always allow public assets
  if (isPublicPath(pathname)) {
    // If hitting the landing or auth pages while logged in, route by role
    if ((pathname === "/" || pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      const role = await getRole();
      if (role && role !== "customer") {
        return NextResponse.redirect(new URL(STAFF_HOME[role], req.url));
      }
      // customer
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    return res;
  }

  // 2) From here on, require an authenticated user
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const role = await getRole();

  // 3) Generic /dashboard → send to correct dashboard or onboarding
  if (pathname === "/dashboard") {
    if (!role) return NextResponse.redirect(new URL("/onboarding", req.url));
    if (role === "customer") return NextResponse.redirect(new URL("/portal", req.url));
    return NextResponse.redirect(new URL(STAFF_HOME[role], req.url));
  }

  // 4) Keep staff out of /portal
  if (pathname.startsWith("/portal")) {
    if (role && role !== "customer") {
      return NextResponse.redirect(new URL(STAFF_HOME[role], req.url));
    }
  }

  // 5) Keep customers out of /dashboard/*
  if (pathname.startsWith("/dashboard")) {
    if (!role) return NextResponse.redirect(new URL("/onboarding", req.url));
    if (role === "customer") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    // If they hit a dashboard they don't own, bounce to their home
    const expected = STAFF_HOME[role];
    if (!pathname.startsWith(expected)) {
      return NextResponse.redirect(new URL(expected, req.url));
    }
  }

  return res;
}

// Don’t run on static assets
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;

  const PUBLIC_PATHS = [
    '/',
    '/auth',
    '/reset-password',
    '/compare-plans',
    '/subscribe',
    '/onboarding',
    '/favicon.ico',
    '/logo.svg',
  ];

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/BlackOpsOne-Regular.ttf');

  if (isPublic) {
    // Handle root path redirection
    if (pathname === '/' && session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        // 👇 No profile? Stay on landing page
        return res;
      }

      const role = profile.role;
      let dashboardPath = '/dashboard';

      switch (role) {
        case 'mechanic':
          dashboardPath = '/dashboard/tech';
          break;
        case 'advisor':
          dashboardPath = '/dashboard/advisor';
          break;
        case 'admin':
          dashboardPath = '/dashboard/admin';
          break;
        case 'manager':
          dashboardPath = '/dashboard/manager';
          break;
        case 'owner':
          dashboardPath = '/dashboard/owner';
          break;
      }

      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }

    return res; // Allow access to public path
  }

  // ⛔ If path is protected and no session, redirect to landing (not /auth)
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // ✅ Session exists — ensure profile exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL('/', req.url)); // Go to landing if profile missing
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
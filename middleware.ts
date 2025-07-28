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
    // 🟠 Redirect logged-in user from landing page to dashboard
    if (pathname === '/' && session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!profile) return res;

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

    return res;
  }

  // 🔴 If user not signed in → redirect to landing
  if (!session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // ✅ If signed in, make sure profile exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (!profile) {
    // If no profile, redirect to onboarding
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
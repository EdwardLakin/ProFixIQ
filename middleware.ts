import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;
  const isLoggedIn = !!session?.user;

  if (sessionError) {
    console.error('❌ Session fetch error:', sessionError.message);
  }

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
    // 🟠 If logged in and on landing, redirect to dashboard
    if (pathname === '/' && isLoggedIn) {
      console.log('🔁 Logged in user on landing — checking role for redirect...');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        console.error('❌ Failed to fetch profile:', profileError.message);
        return res;
      }

      if (!profile) {
        console.warn('⚠️ No profile found for user — allowing access to public route');
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
        default:
          console.warn('⚠️ Unknown role:', role);
      }

      console.log(`✅ Redirecting user to ${dashboardPath}`);
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }

    // 🟢 Allow access to public route
    return res;
  }

  // 🔴 Private route: user must be logged in
  if (!isLoggedIn) {
    console.warn('🔒 User not logged in — redirecting to /');
    return NextResponse.redirect(new URL('/', req.url));
  }

  // ✅ Logged in: ensure profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (profileError) {
    console.error('❌ Failed to fetch profile:', profileError.message);
    return res;
  }

  if (!profile) {
    console.warn('⚠️ No profile found — redirecting to onboarding');
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
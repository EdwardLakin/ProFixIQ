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
    if (pathname === '/' && session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const role = profile?.role;

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

  if (!session) {
    const signInUrl = new URL('/auth', req.url);
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
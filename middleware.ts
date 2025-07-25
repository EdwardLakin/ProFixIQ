import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('sb-access-token')?.value;
  const role = req.cookies.get('role')?.value;

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
    pathname.startsWith('/auth') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/BlackOpsOne-Regular.ttf');

  if (isPublic) {
    if (pathname === '/' && token && role) {
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

    return NextResponse.next();
  }

  if (!token) {
    const signInUrl = new URL('/auth', req.url);
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}
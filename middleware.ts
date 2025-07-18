import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('sb-access-token')?.value;

  const PUBLIC_PATHS = [
    '/',
    '/sign-in',
    '/sign-up',
    '/reset-password',
    '/compare-plans',
    '/subscribe',
    '/onboarding/plan',
    '/onboarding/profile',
    '/onboarding/shop',
    '/favicon.ico',
    '/logo.svg',
  ];

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/fonts') ||        // ✅ Allow Next.js fonts folder
    pathname.startsWith('/BlackOpsOne-Regular.ttf'); // ✅ Allow direct font file

  if (isPublic) {
    return NextResponse.next();
  }

  if (!token) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const PUBLIC_PATHS = [
    '/',
    '/sign-in',
    '/sign-up',
    '/reset-password',
    '/thank-you',
    '/subscribe',
    '/compare-plans',
    '/onboarding/plan',
  ];

  const pathname = req.nextUrl.pathname;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('sb-access-token')?.value;
  if (!token) {
    console.warn('🔒 No access token, redirecting to /sign-in');
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.ttf|api/public|api/stripe).*)',
  ],
};
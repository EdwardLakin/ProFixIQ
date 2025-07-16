import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('sb-access-token')?.value;

  // Always allow these paths (no auth required)
  const openPaths = [
    '/sign-in',
    '/sign-up',
    '/_next',         // next.js internals
    '/favicon.ico',   // browser tab icon
    '/api',           // API routes
    '/fonts',
    '/images',
  ];

  // If the pathname starts with any open path → allow it
  for (const path of openPaths) {
    if (request.nextUrl.pathname.startsWith(path)) {
      return NextResponse.next();
    }
  }

  // Require auth for these paths
  const protectedPaths = [
    '/work-orders',
    '/inspection',
    '/create-work-order',
    '/job-queue',
    '/summary',
  ];

  const isProtected = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users
  if (isProtected && !token) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirectedFrom', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // All good
  return NextResponse.next();
}

// ✅ Apply to all routes except static files (e.g., .js, .png, .css)
export const config = {
  matcher: ['/((?!.*\\.).*)'],
};
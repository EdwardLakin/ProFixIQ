import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@shared/types/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const url = req.nextUrl;
  const pathname = url.pathname;

  // 🔓 EARLY ESCAPES — never block these routes
  if (
    pathname.startsWith('/auth') ||  // e.g., /auth/callback
    pathname === '/confirm' ||
    pathname === '/signup' ||
    pathname === '/subscribe' // harmless if you keep it
  ) {
    return res;
  }

  const supabase = createMiddlewareClient<Database>({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session?.user;

  // Public routes
  const PUBLIC_PATHS = [
    '/', '/compare-plans', '/onboarding',
    '/favicon.ico', '/logo.svg'
  ];

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/BlackOpsOne-Regular.ttf');

  if (isPublic) {
    // Optional: send logged-in users away from landing
    if (pathname === '/' && isLoggedIn) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session!.user.id)
        .single();

      const role = profile?.role;
      const dest =
        role === 'mechanic' || role === 'tech' ? '/dashboard/tech' :
        role === 'advisor'  ? '/dashboard/advisor' :
        role === 'admin'    ? '/dashboard/admin'   :
        role === 'manager'  ? '/dashboard/manager' :
        role === 'owner'    ? '/dashboard/owner'   :
        '/dashboard';

      return NextResponse.redirect(new URL(dest, req.url));
    }
    return res;
  }

  // Private: require login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Ensure profile exists for logged-in users
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session!.user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return res;
}

// Keep middleware off static + API (and let it run for pages like /confirm)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
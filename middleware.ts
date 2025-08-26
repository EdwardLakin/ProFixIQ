// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@shared/types/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  const pathname = req.nextUrl.pathname;
  const isLoggedIn = !!session?.user;

  if (sessionError) console.error('❌ Session fetch error:', sessionError.message);

  // ✅ Add the missing public routes used by the checkout → signup → callback flow
  const PUBLIC_PATHS = [
    '/',                 // landing
    '/compare-plans',
    '/subscribe',        // safe to keep, even if you stop using it
    '/signup',           // ← user lands here after Stripe success_url
    '/confirm',          // ← client exchanges session & role-redirects here
    '/onboarding',
    '/favicon.ico',
    '/logo.svg',
  ];

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/auth') ||            // ← /auth/callback, etc.
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/BlackOpsOne-Regular.ttf');

  if (isPublic) {
    // If the user is already logged in and visits the landing page, send them to their dashboard
    if (pathname === '/' && isLoggedIn) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) return res;

      const role = profile.role;
      const dashboardPath =
        role === 'mechanic' || role === 'tech' ? '/dashboard/tech' :
        role === 'advisor'  ? '/dashboard/advisor' :
        role === 'admin'    ? '/dashboard/admin'   :
        role === 'manager'  ? '/dashboard/manager' :
        role === 'owner'    ? '/dashboard/owner'   :
        '/dashboard';

      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
    return res; // allow public routes
  }

  // Private routes below this point
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Ensure profile exists for logged-in users
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (profileError) return res;
  if (!profile) return NextResponse.redirect(new URL('/onboarding', req.url));

  return res;
}

// 🔧 Optional perf: don’t run middleware for /api or static assets
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
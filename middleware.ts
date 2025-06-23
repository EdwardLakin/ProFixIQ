import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/api', '/thank-you', '/reset-password'];
  const pathname = req.nextUrl.pathname;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return res;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .single<Database['public']['Tables']['profiles']['Row']>();

    if (error || !profile) {
      console.error('Middleware profile error:', error);
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const plan = profile.plan;
    const restrictedProRoutes = ['/quote', '/inspections'];
    const restrictedEliteRoutes = ['/quote', '/settings/shop'];

    if (plan === 'diy' && restrictedProRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    if (plan === 'pro' && restrictedEliteRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    return res;
  } catch (err) {
    console.error('Middleware error:', err);
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
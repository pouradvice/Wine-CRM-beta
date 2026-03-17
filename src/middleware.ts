// src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Cookie used to short-circuit the DB lookup on return visits.
// The VALUE is the authenticated user's UUID so the check is user-specific:
// a cookie left from a previous user's session on the same browser will
// never match the current user's ID, forcing a fresh DB check.
const ONBOARDING_DONE_COOKIE = 'onboarding_done';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — critical, do not remove
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protect all /app/* routes
  if (pathname.startsWith('/app') && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/app/crm/clients';
    return NextResponse.redirect(url);
  }

  // Onboarding gate — authenticated users on /app/* routes only.
  // Skips the gate for the /app/onboarding page itself to prevent a redirect loop.
  if (
    user &&
    pathname.startsWith('/app') &&
    !pathname.startsWith('/app/onboarding')
  ) {
    // Fast path: cookie value must match the current user's ID.
    // A stale cookie from a different user's session on the same browser
    // will not match and falls through to the DB check below.
    const cookieVal = request.cookies.get(ONBOARDING_DONE_COOKIE)?.value;
    if (cookieVal === user.id) {
      return supabaseResponse;
    }

    // Slow path: query the DB (only needed on first visit after login).
    const { data: onboardingState, error: onboardingError } = await supabase
      .from('user_onboarding_state')
      .select('completed_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // If the query errors (e.g. table not yet created), let the user through
    // rather than looping. The page-level guards will catch any real issues.
    if (onboardingError) {
      return supabaseResponse;
    }

    const hasCompleted = onboardingState?.completed_at != null;

    if (!hasCompleted) {
      const url = request.nextUrl.clone();
      url.pathname = '/app/onboarding';
      return NextResponse.redirect(url);
    }

    // Set the cookie with this user's ID as the value so future requests
    // for THIS user skip the DB query without affecting other users.
    supabaseResponse.cookies.set(ONBOARDING_DONE_COOKIE, user.id, {
      path:     '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 365, // 1 year
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

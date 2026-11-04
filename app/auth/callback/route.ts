
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";

  // Only permit redirects within this application.
  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  // This response will carry the Supabase session cookies.
  const response = NextResponse.redirect(
    new URL(next, origin)
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          // Update the request cookies.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          // Persist the session in the browser.
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Exchange the magic-link code for an authenticated session.
  const { error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Auth code exchange failed:", error.message);

    const errorUrl = new URL("/login", origin);
    errorUrl.searchParams.set("error", error.message);

    const errorResponse = NextResponse.redirect(errorUrl);

    // Preserve any cookies set during the exchange.
    response.cookies.getAll().forEach((cookie) => {
      errorResponse.cookies.set(cookie);
    });

    return errorResponse;
  }

  // Authentication is complete.
  // Profile and volunteer records are not modified here.
  return response;
}

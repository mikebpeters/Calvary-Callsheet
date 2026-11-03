
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  const redirectUrl = new URL(next, origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("Auth code exchange failed:", exchangeError);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(exchangeError.message)}`,
        origin
      )
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Auth user lookup failed:", userError);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          userError?.message ?? "No user after login"
        )}`,
        origin
      )
    );
  }

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User";

  const { data: existingProfile, error: profileLookupError } =
    await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

  if (profileLookupError) {
    console.error("Profile lookup failed:", profileLookupError);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          `Profile lookup failed: ${profileLookupError.message}`
        )}`,
        origin
      )
    );
  }

  if (!existingProfile) {
    const { error: insertProfileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        full_name: fullName,
        role: "volunteer",
      });

    if (insertProfileError) {
      console.error("Profile insert failed:", insertProfileError);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(
            `Profile insert failed: ${insertProfileError.message}`
          )}`,
          origin
        )
      );
    }
  } else {
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        role: existingProfile.role ?? "volunteer",
      })
      .eq("id", user.id);

    if (updateProfileError) {
      console.error("Profile update failed:", updateProfileError);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(
            `Profile update failed: ${updateProfileError.message}`
          )}`,
          origin
        )
      );
    }
  }

  if (user.email) {
    const { data: linkedVolunteer, error: linkedVolunteerError } =
      await supabase
        .from("volunteers")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (linkedVolunteerError) {
      console.error(
        "Linked volunteer lookup failed:",
        linkedVolunteerError
      );
    }

    if (!linkedVolunteer && !linkedVolunteerError) {
      const {
        data: emailMatchedVolunteer,
        error: emailMatchedVolunteerError,
      } = await supabase
        .from("volunteers")
        .select("id, user_id, email")
        .ilike("email", user.email)
        .maybeSingle();

      if (emailMatchedVolunteerError) {
        console.error(
          "Email matched volunteer lookup failed:",
          emailMatchedVolunteerError
        );
      }

      if (emailMatchedVolunteer && !emailMatchedVolunteer.user_id) {
        const { error: volunteerUpdateError } = await supabase
          .from("volunteers")
          .update({ user_id: user.id })
          .eq("id", emailMatchedVolunteer.id);

        if (volunteerUpdateError) {
          console.error(
            "Volunteer link update failed:",
            volunteerUpdateError
          );
        }
      }
    }
  }

  return response;
}

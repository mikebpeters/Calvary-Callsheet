import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("Auth code exchange failed:", exchangeError);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Auth user lookup failed:", userError);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        userError?.message ?? "No user after login"
      )}`
    );
  }

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User";

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLookupError) {
    console.error("Profile lookup failed:", profileLookupError);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        `Profile lookup failed: ${profileLookupError.message}`
      )}`
    );
  }

  if (!existingProfile) {
    const { error: insertProfileError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      role: "volunteer",
    });

    if (insertProfileError) {
      console.error("Profile insert failed:", insertProfileError);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          `Profile insert failed: ${insertProfileError.message}`
        )}`
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
        `${origin}/login?error=${encodeURIComponent(
          `Profile update failed: ${updateProfileError.message}`
        )}`
      );
    }
  }

  if (user.email) {
    const { data: linkedVolunteer, error: linkedVolunteerError } = await supabase
      .from("volunteers")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (linkedVolunteerError) {
      console.error("Linked volunteer lookup failed:", linkedVolunteerError);
    }

    if (!linkedVolunteer && !linkedVolunteerError) {
      const { data: emailMatchedVolunteer, error: emailMatchedVolunteerError } =
        await supabase
          .from("volunteers")
          .select("id, user_id, email")
          .ilike("email", user.email)
          .maybeSingle();

      if (emailMatchedVolunteerError) {
        console.error("Email matched volunteer lookup failed:", emailMatchedVolunteerError);
      }

      if (emailMatchedVolunteer && !emailMatchedVolunteer.user_id) {
        const { error: volunteerUpdateError } = await supabase
          .from("volunteers")
          .update({ user_id: user.id })
          .eq("id", emailMatchedVolunteer.id);

        if (volunteerUpdateError) {
          console.error("Volunteer link update failed:", volunteerUpdateError);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
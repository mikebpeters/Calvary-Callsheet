import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "User";

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      role: "volunteer",
    });
  } else if (!existingProfile.role) {
    await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        role: "volunteer",
      })
      .eq("id", user.id);
  } else {
    await supabase
      .from("profiles")
      .update({
        full_name: fullName,
      })
      .eq("id", user.id);
  }

  if (user.email) {
    const { data: linkedVolunteer } = await supabase
      .from("volunteers")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!linkedVolunteer) {
      const { data: emailMatchedVolunteer } = await supabase
        .from("volunteers")
        .select("id, user_id, email")
        .ilike("email", user.email)
        .maybeSingle();

      if (emailMatchedVolunteer && !emailMatchedVolunteer.user_id) {
        await supabase
          .from("volunteers")
          .update({ user_id: user.id })
          .eq("id", emailMatchedVolunteer.id);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
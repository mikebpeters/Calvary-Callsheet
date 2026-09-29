"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        setCheckingSession(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (user) {
          router.replace("/");
          router.refresh();
          return;
        }
      } catch (err) {
        console.error("Login session check failed:", err);
      } finally {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      const lowerMessage = signInError.message.toLowerCase();

      if (
        lowerMessage.includes("security purposes") ||
        lowerMessage.includes("rate limit") ||
        lowerMessage.includes("seconds")
      ) {
        setError(
          "A sign-in email was recently requested. Please wait a few seconds before requesting another."
        );
      } else {
        setError(signInError.message);
      }

      setLoading(false);
      return;
    }

    setMessage(
      `We've sent a magic sign-in link to ${trimmedEmail}. Open the email and click the link to sign in. If you don't see it within a minute or two, check your junk or spam folder.`
    );

    setLoading(false);
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-stone-50">
        <div className="mx-auto flex max-w-5xl justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-semibold text-stone-900">Sign In</h1>
            <p className="mt-4 text-sm text-stone-600">
              Checking your session...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto flex max-w-5xl justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold text-stone-900">Sign In</h1>

          <p className="mt-4 text-sm leading-6 text-stone-600">
            Enter your email and we'll send you a secure sign-in link.
            The email will contain a <strong>magic link</strong> that signs
            you directly into Calvary Call Sheet.
          </p>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-900">
            <strong>Watch for an email from Calvary Call Sheet.</strong>{" "}
            It is a legitimate sign-in email, not spam. If you don't see it
            within a minute or two, check your junk or spam folder.
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
          </form>

          {message ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">
              <strong>Check your email.</strong>
              <div className="mt-1">{message}</div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

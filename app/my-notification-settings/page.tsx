"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type VolunteerSettings = {
  id: string;
  name: string;
  email: string | null;
  email_on_assignment: boolean;
  email_on_removal: boolean;
  email_on_reminder: boolean;
};

export default function MyNotificationSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [settings, setSettings] = useState<VolunteerSettings | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(`Could not check signed-in user: ${userError.message}`);
      }

      if (!user) {
        setIsSignedIn(false);
        setSettings(null);
        return;
      }

      setIsSignedIn(true);

      const { data, error: volunteerError } = await supabase
        .from("volunteers")
        .select(
          "id, name, email, email_on_assignment, email_on_removal, email_on_reminder"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (volunteerError) {
        throw new Error(`Could not load settings: ${volunteerError.message}`);
      }

      setSettings((data ?? null) as VolunteerSettings | null);
    } catch (err) {
      console.error("Notification settings load error:", err);
      setError(err instanceof Error ? err.message : "Could not load settings.");
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }

  function updateLocalSetting(
    key:
      | "email_on_assignment"
      | "email_on_removal"
      | "email_on_reminder",
    value: boolean
  ) {
    setSettings((current) =>
      current ? { ...current, [key]: value } : current
    );
    setSuccessMessage("");
  }

  async function saveSettings() {
    if (!settings) return;

    setSaving(true);
    setError("");
    setSuccessMessage("");

    const { error: updateError } = await supabase
      .from("volunteers")
      .update({
        email_on_assignment: settings.email_on_assignment,
        email_on_removal: settings.email_on_removal,
        email_on_reminder: settings.email_on_reminder,
      })
      .eq("id", settings.id);

    if (updateError) {
      setError(`Could not save settings: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setSuccessMessage("Notification settings saved.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Notification Settings
          </h1>
          <p className="mt-2 text-sm text-gray-600">Loading settings...</p>
        </section>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Notification Settings
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You need to sign in to manage notification settings.
          </p>

          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm"
            >
              Go to login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Notification Settings
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            No volunteer record is connected to your account yet.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Notification Settings
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            In-app notifications stay on. These settings control future email
            notifications.
          </p>

          <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            <div className="font-medium text-stone-900">{settings.name}</div>
            <div>{settings.email ?? "No email on volunteer record"}</div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Email me when...
          </h2>

          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <input
                type="checkbox"
                checked={settings.email_on_assignment}
                onChange={(e) =>
                  updateLocalSetting("email_on_assignment", e.target.checked)
                }
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  I am scheduled
                </span>
                <span className="block text-sm text-gray-600">
                  Receive an email when someone assigns you to a role.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <input
                type="checkbox"
                checked={settings.email_on_removal}
                onChange={(e) =>
                  updateLocalSetting("email_on_removal", e.target.checked)
                }
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  I am removed from a schedule
                </span>
                <span className="block text-sm text-gray-600">
                  Receive an email when you are removed from a role.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <input
                type="checkbox"
                checked={settings.email_on_reminder}
                onChange={(e) =>
                  updateLocalSetting("email_on_reminder", e.target.checked)
                }
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  I have an upcoming serving reminder
                </span>
                <span className="block text-sm text-gray-600">
                  Receive an email reminder before you serve.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>

            <Link
              href="/notifications"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100"
            >
              Back to Notifications
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
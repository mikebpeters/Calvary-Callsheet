"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Volunteer = {
  id: string;
  user_id: string | null;
  name: string;
  active: boolean;
};

type Role = {
  id: string;
  name: string;
  active: boolean;
};

type AssignmentRow = {
  entryId: string;
  date: string;
  roleId: string;
  roleName: string;
  status: string | null;
};

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatForGoogleCalendar(date: Date) {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function buildGoogleCalendarUrl({
  date,
  roleName,
}: {
  date: string;
  roleName: string;
}) {
  const start = new Date(`${date}T10:00:00`);
  const end = new Date(`${date}T12:00:00`);

  const title = `Calvary Serving: ${roleName}`;
  const details = `Serving at Calvary as ${roleName}.`;
  const location = "Calvary Baptist Church";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatForGoogleCalendar(start)}/${formatForGoogleCalendar(end)}`,
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function MySchedulePage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentVolunteer, setCurrentVolunteer] = useState<Volunteer | null>(
    null
  );
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [error, setError] = useState("");
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);

  const today = useMemo(() => toYmd(new Date()), []);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError) {
          throw new Error(
            `Could not check signed-in user: ${userError.message}`
          );
        }

        if (!user) {
          setIsSignedIn(false);
          setCurrentVolunteer(null);
          setAssignments([]);
          return;
        }

        setIsSignedIn(true);

        const { data: volunteerData, error: volunteerError } = await supabase
          .from("volunteers")
          .select("id, user_id, name, active")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();

        if (!isMounted) return;

        if (volunteerError) {
          throw new Error(
            `Could not load volunteer profile: ${volunteerError.message}`
          );
        }

        if (!volunteerData) {
          setCurrentVolunteer(null);
          setAssignments([]);
          return;
        }

        setCurrentVolunteer(volunteerData);

        const { data: entriesData, error: entriesError } = await supabase
  .from("schedule_entries")
  .select("id, date, role_id, volunteer_id, status")
  .eq("volunteer_id", volunteerData.id)
  .eq("published", true) // ← ADD THIS LINE
  .gte("date", today)
  .order("date", { ascending: true });

        if (!isMounted) return;

        if (entriesError) {
          throw new Error(
            `Could not load assignments: ${entriesError.message}`
          );
        }

        const entries = entriesData ?? [];

        if (entries.length === 0) {
          setAssignments([]);
          return;
        }

        const roleIds = [...new Set(entries.map((entry) => entry.role_id))];

        const { data: rolesData, error: rolesError } = await supabase
          .from("roles")
          .select("id, name, active")
          .in("id", roleIds);

        if (!isMounted) return;

        if (rolesError) {
          throw new Error(`Could not load roles: ${rolesError.message}`);
        }

        const roleMap = new Map(
          (rolesData ?? []).map((role: Role) => [role.id, role.name])
        );

        const rows: AssignmentRow[] = entries.map((entry) => ({
          entryId: entry.id,
          date: entry.date,
          roleId: entry.role_id,
          roleName: roleMap.get(entry.role_id) ?? "Unknown role",
          status: entry.status,
        }));

        setAssignments(rows);
      } catch (err) {
        if (!isMounted) return;
        console.error("My Schedule load error:", err);
        setError(
          err instanceof Error ? err.message : "Unknown schedule load error."
        );
        setCurrentVolunteer(null);
        setAssignments([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [supabase, today]);

  async function unclaimAssignment(entryId: string) {
    if (!currentVolunteer) return;

    const previousAssignments = [...assignments];

    setSavingEntryId(entryId);
    setError("");

    setAssignments((current) =>
      current.filter((item) => item.entryId !== entryId)
    );

    const { data, error: updateError } = await supabase
      .from("schedule_entries")
      .update({
        volunteer_id: null,
        status: null,
      })
      .eq("id", entryId)
      .eq("volunteer_id", currentVolunteer.id)
      .select("id");

    if (updateError) {
      console.error("Unclaim error:", updateError);
      setAssignments(previousAssignments);
      setError(`Could not unclaim assignment: ${updateError.message}`);
      setSavingEntryId(null);
      return;
    }

    if (!data || data.length === 0) {
      setAssignments(previousAssignments);
      setError(
        "This assignment changed before it could be removed. Please refresh and try again."
      );
      setSavingEntryId(null);
      return;
    }

    setSavingEntryId(null);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            My Schedule
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Loading your schedule...
          </p>
        </section>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            My Schedule
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You need to sign in to view your schedule.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            My Schedule
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            View your upcoming assignments, add them to Google Calendar, and
            step back from a commitment if needed.
          </p>

          {currentVolunteer && (
            <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
              Signed in as{" "}
              <span className="font-medium">{currentVolunteer.name}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>

        {!currentVolunteer ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              No volunteer profile found
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your account is signed in, but it is not linked to an active
              volunteer profile yet.
            </p>
          </section>
        ) : assignments.length === 0 ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              No upcoming assignments
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You do not have any upcoming scheduled roles right now.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm"
              >
                Back to home
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="space-y-4">
              {assignments.map((assignment) => {
                const isSaving = savingEntryId === assignment.entryId;
                const calendarUrl = buildGoogleCalendarUrl({
                  date: assignment.date,
                  roleName: assignment.roleName,
                });

                return (
                  <div
                    key={assignment.entryId}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-500">
                          {prettyDate(assignment.date)}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-gray-900">
                          {assignment.roleName}
                        </h2>
                        <p className="mt-2 text-sm font-medium text-emerald-700">
                          Assigned
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100"
                        >
                          Add to Google Calendar
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            unclaimAssignment(assignment.entryId)
                          }
                          disabled={isSaving}
                          className="inline-flex rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? "Removing..." : "Unclaim"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
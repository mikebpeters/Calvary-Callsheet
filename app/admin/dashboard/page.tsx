"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = {
  id: string;
  name: string;
  active: boolean;
};

type Volunteer = {
  id: string;
  name: string;
  active: boolean;
};

type ScheduleEntry = {
  id: string;
  date: string;
  role_id: string;
  volunteer_id: string | null;
};

type LeadRequest = {
  id: string;
  status: string;
};

type Blackout = {
  id: string;
  volunteer_id: string;
  date: string;
};

function addDays(input: Date, days: number) {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextSunday() {
  const today = new Date();
  const day = today.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return toYmd(addDays(today, daysUntilSunday));
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const nextSunday = useMemo(() => getNextSunday(), []);

  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [leadRequests, setLeadRequests] = useState<LeadRequest[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name, active")
        .eq("active", true);

      if (rolesError) throw new Error(rolesError.message);

      const { data: volunteersData, error: volunteersError } = await supabase
        .from("volunteers")
        .select("id, name, active")
        .eq("active", true);

      if (volunteersError) throw new Error(volunteersError.message);

      const { data: entriesData, error: entriesError } = await supabase
        .from("schedule_entries")
        .select("id, date, role_id, volunteer_id")
        .eq("date", nextSunday);

      if (entriesError) throw new Error(entriesError.message);

      const { data: leadRequestData, error: leadRequestError } = await supabase
        .from("lead_requests")
        .select("id, status")
        .eq("status", "pending");

      if (leadRequestError) throw new Error(leadRequestError.message);

      const { data: blackoutData, error: blackoutError } = await supabase
        .from("volunteer_blackouts")
        .select("id, volunteer_id, date")
        .eq("date", nextSunday);

      if (blackoutError) throw new Error(blackoutError.message);

      setRoles(rolesData ?? []);
      setVolunteers(volunteersData ?? []);
      setEntries(entriesData ?? []);
      setLeadRequests(leadRequestData ?? []);
      setBlackouts(blackoutData ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const openRoles = roles.filter((role) => {
    const entry = entries.find((item) => item.role_id === role.id);
    return !entry?.volunteer_id;
  });

  const blackoutConflicts = entries.filter((entry) => {
    if (!entry.volunteer_id) return false;
    return blackouts.some(
      (blackout) => blackout.volunteer_id === entry.volunteer_id
    );
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Quick health check before opening the schedule to beta users.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">Loading dashboard...</p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-5">
              <DashboardCard label="Active Volunteers" value={volunteers.length} />
              <DashboardCard label="Active Roles" value={roles.length} />
              <DashboardCard label="Open Next Sunday" value={openRoles.length} />
              <DashboardCard
                label="Blackout Conflicts"
                value={blackoutConflicts.length}
              />
              <DashboardCard
                label="Pending Lead Requests"
                value={leadRequests.length}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Quick Links
                </h2>

                <div className="mt-4 flex flex-wrap gap-2">
                  <QuickLink href="/planner" label="Planner" />
                  <QuickLink href="/schedule" label="Schedule" />
                  <QuickLink href="/volunteers" label="Volunteers" />
                  <QuickLink href="/roles" label="Roles" />
                  <QuickLink href="/admin/lead-requests" label="Lead Requests" />
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Next Sunday Open Roles
                </h2>

                {openRoles.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">
                    No open roles for next Sunday.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {openRoles.slice(0, 8).map((role) => (
                      <div
                        key={role.id}
                        className="rounded-xl border px-4 py-3 text-sm text-gray-800"
                      >
                        {role.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Beta Readiness Notes
              </h2>

              <div className="mt-4 space-y-2 text-sm text-gray-700">
                <p>✓ Roles and volunteers are loading.</p>
                <p>✓ Next Sunday schedule health is visible.</p>
                <p>✓ Lead requests are trackable.</p>
                <p>✓ Blackout conflicts are counted.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DashboardCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-600">{label}</div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
    >
      {label}
    </Link>
  );
}
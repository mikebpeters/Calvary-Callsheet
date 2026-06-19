"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPublicName } from "@/lib/formatPublicName";

type AppRole = "volunteer" | "ministry_leader" | "admin";

type Role = {
  id: string;
  name: string;
  active: boolean;
};

type Volunteer = {
  id: string;
  name: string;
  public_name: string | null;
};

type ScheduleEntry = {
  id: string;
  date: string;
  role_id: string;
  volunteer_id: string | null;
  status: string | null;
  published: boolean;
};

type DashboardItem = {
  title: string;
  description: string;
  href: string;
  buttonText: string;
};

function withTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

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
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return addDays(today, daysUntilSunday);
}

function prettyDate(date: Date) {
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function prettyUserRole(role: AppRole | null) {
  if (role === "admin") return "Admin";
  if (role === "ministry_leader") return "Ministry Leader";
  if (role === "volunteer") return "Volunteer";
  return "Volunteer";
}

function getRoleIcon(roleName: string) {
  const key = roleName.trim().toLowerCase();

  if (key.includes("worship")) return "🎤";
  if (key.includes("sound") || key.includes("audio")) return "🎚️";
  if (key.includes("projection") || key.includes("slides")) return "📽️";
  if (key.includes("livestream") || key.includes("stream")) return "📡";
  if (key.includes("host") || key.includes("greeter") || key.includes("welcome")) return "👋";
  if (key.includes("kids") || key.includes("children") || key.includes("nursery")) return "👶";
  if (key.includes("coffee") || key.includes("cafe") || key.includes("hospitality")) return "☕";
  if (key.includes("prayer")) return "🙏";
  if (key.includes("security")) return "🛡️";
  if (key.includes("setup")) return "🪑";
  if (key.includes("teardown")) return "🧰";
  if (key.includes("camera")) return "📷";
  if (key.includes("lighting") || key.includes("lights")) return "💡";

  return "📋";
}

function getDashboardItems(role: AppRole | null): DashboardItem[] {
  if (role === "admin") {
    return [
      {
        title: "Planner",
        description: "Create schedule rows, assign volunteers, and publish Sundays.",
        href: "/planner",
        buttonText: "Open",
      },
      {
        title: "Open Schedule",
        description: "Build and manage the upcoming service schedule.",
        href: "/schedule",
        buttonText: "Open",
      },
      {
        title: "Volunteers",
        description: "Manage volunteer records and active serving status.",
        href: "/volunteers",
        buttonText: "Manage",
      },
      {
        title: "Roles",
        description: "Manage serving roles used across the schedule.",
        href: "/roles",
        buttonText: "Manage",
      },
      {
        title: "Lead Requests",
        description: "Review and approve ministry leader access requests.",
        href: "/admin/lead-requests",
        buttonText: "Review",
      },
    ];
  }

  if (role === "ministry_leader") {
    return [
      {
        title: "Planner",
        description: "Review schedule gaps and suggested coverage.",
        href: "/planner",
        buttonText: "Open",
      },
      {
        title: "Open Schedule",
        description: "Assign volunteers and manage upcoming services.",
        href: "/schedule",
        buttonText: "Open",
      },
      {
        title: "My Availability",
        description: "Update dates when you are unavailable to serve.",
        href: "/my-blackouts",
        buttonText: "Update",
      },
    ];
  }

  return [
    {
      title: "My Schedule",
      description: "View your upcoming serving assignments.",
      href: "/my-schedule",
      buttonText: "Open",
    },
    {
      title: "My Availability",
      description: "Add dates when you are unavailable to serve.",
      href: "/my-blackouts",
      buttonText: "Update",
    },
    {
      title: "Notification Settings",
      description: "Choose which schedule emails you want to receive.",
      href: "/my-notification-settings",
      buttonText: "Update",
    },
  ];
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);

  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);

  const [homeLoading, setHomeLoading] = useState(true);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [homeError, setHomeError] = useState("");
  const [authError, setAuthError] = useState("");

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  const nextSunday = useMemo(() => getNextSunday(), []);
  const nextSundayStr = useMemo(() => toYmd(nextSunday), [nextSunday]);

  const isSignedIn = !!userEmail;
  const effectiveRole: AppRole | null = isSignedIn ? userRole ?? "volunteer" : null;
  const canSeeDraftSchedules =
    effectiveRole === "admin" || effectiveRole === "ministry_leader";

  useEffect(() => {
    let isMounted = true;

    async function loadAuthState() {
      setAuthLoaded(false);
      setAuthError("");

      try {
        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          "Home session check"
        );

        if (!isMounted) return;

        const user = sessionRes.data.session?.user;

        if (!user) {
          setUserEmail(null);
          setUserRole(null);
          setAuthLoaded(true);
          return;
        }

        setUserEmail(user.email ?? null);

        const profileRes = await withTimeout(
          supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle(),
          "Home profile query"
        );

        if (!isMounted) return;

        if (profileRes.error) {
          console.error("Home profile lookup failed:", profileRes.error);
          setUserRole("volunteer");
        } else {
          setUserRole((profileRes.data?.role as AppRole | null) ?? "volunteer");
        }

        setAuthLoaded(true);
      } catch (err) {
        if (!isMounted) return;

        console.error("Home auth load error:", err);
        setAuthError(
          err instanceof Error ? err.message : "Failed to load sign-in status."
        );
        setUserEmail(null);
        setUserRole(null);
        setAuthLoaded(true);
      }
    }

    loadAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        loadAuthState();
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authLoaded) return;

    let isMounted = true;

    async function loadHomeData() {
      setHomeLoading(true);
      setHomeError("");

      try {
        const rolesRes = await withTimeout(
          supabase
            .from("roles")
            .select("id, name, active")
            .eq("active", true)
            .order("name", { ascending: true }),
          "Home roles query"
        );

        if (!isMounted) return;

        if (rolesRes.error) {
          throw new Error(`Roles query failed: ${rolesRes.error.message}`);
        }

        setRoles((rolesRes.data as Role[]) ?? []);

        const volunteersRes = await withTimeout(
          supabase
            .from("volunteers")
            .select("id, name, public_name")
            .eq("active", true),
          "Home volunteers query"
        );

        if (!isMounted) return;

        if (volunteersRes.error) {
          throw new Error(`Volunteers query failed: ${volunteersRes.error.message}`);
        }

        setVolunteers((volunteersRes.data as Volunteer[]) ?? []);

        let entriesQuery = supabase
          .from("schedule_entries")
          .select("id, date, role_id, volunteer_id, status, published")
          .eq("date", nextSundayStr);

        if (!canSeeDraftSchedules) {
          entriesQuery = entriesQuery.eq("published", true);
        }

        const entriesRes = await withTimeout(
          entriesQuery,
          "Home schedule entries query"
        );

        if (!isMounted) return;

        if (entriesRes.error) {
          throw new Error(
            `Schedule entries query failed: ${entriesRes.error.message}`
          );
        }

        setEntries((entriesRes.data as ScheduleEntry[]) ?? []);
      } catch (err) {
        if (!isMounted) return;

        console.error("Home page load error:", err);
        setHomeError(
          err instanceof Error ? err.message : "Failed to load home page data."
        );
      } finally {
        if (isMounted) {
          setHomeLoading(false);
        }
      }
    }

    loadHomeData();

    return () => {
      isMounted = false;
    };
  }, [authLoaded, canSeeDraftSchedules, nextSundayStr, supabase]);

  const volunteerMap = useMemo(() => {
    return new Map(
      volunteers.map((volunteer) => [
        volunteer.id,
        volunteer.public_name?.trim() || formatPublicName(volunteer.name),
      ])
    );
  }, [volunteers]);

  const roleRows = useMemo(() => {
    return roles.map((role) => {
      const entry = entries.find((item) => item.role_id === role.id);
      const displayAssignedName = entry?.volunteer_id
        ? volunteerMap.get(entry.volunteer_id) || null
        : null;

      return {
        roleId: role.id,
        roleName: role.name,
        icon: getRoleIcon(role.name),
        assignedName: displayAssignedName,
        isOpen: !displayAssignedName,
      };
    });
  }, [roles, entries, volunteerMap]);

  const assignedCount = roleRows.filter((row) => !row.isOpen).length;
  const openCount = roleRows.filter((row) => row.isOpen).length;
  const dashboardItems = getDashboardItems(effectiveRole);

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Calvary Call Sheet
            </p>

            <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Sunday serving schedule
            </h1>

            <p className="mt-4 max-w-2xl text-lg text-gray-700">
              View the upcoming service schedule and access the tools available
              for your role.
            </p>

            {authError ? (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {authError}
              </div>
            ) : null}

            {!authLoaded ? (
              <div className="mt-5 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">
                Checking sign-in status...
              </div>
            ) : isSignedIn ? (
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
                  Signed in
                </span>

                <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  {userEmail}
                </span>

                <span className="rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700">
                  Role: {prettyUserRole(effectiveRole)}
                </span>
              </div>
            ) : (
              <div className="mt-5 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">
                Viewing as guest. Sign in to see your dashboard.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        {!authLoaded ? null : !isSignedIn ? (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Sign in required
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              Sign in to view the schedule, availability tools, and role-specific
              actions.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">
                    {prettyDate(nextSunday)} Schedule
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    This is the current schedule for the upcoming Sunday.
                  </p>
                </div>

                <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-gray-700">
                  <div className="font-medium">
                    {assignedCount} of {roleRows.length} roles filled
                  </div>
                  <div className="mt-1 text-gray-600">{openCount} open</div>
                </div>
              </div>

              {homeError ? (
                <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {homeError}
                </div>
              ) : null}

              {homeLoading ? (
                <div className="mt-6 text-sm text-gray-600">
                  Loading schedule...
                </div>
              ) : roleRows.length === 0 ? (
                <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5 text-sm text-gray-700">
                  No schedule rows found for this Sunday yet.
                </div>
              ) : (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {roleRows.map((row) => (
                    <div
                      key={row.roleId}
                      className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-xl" aria-hidden="true">
                          {row.icon}
                        </span>
                        <span className="truncate font-medium text-gray-900">
                          {row.roleName}
                        </span>
                      </div>

                      <div
                        className={`shrink-0 text-sm font-medium ${
                          row.isOpen ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {row.isOpen ? "Open" : row.assignedName}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canSeeDraftSchedules ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Admin view: draft and published schedule rows may be visible
                  here.
                </div>
              ) : null}
            </section>

            <section>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Your next actions
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  These are the most relevant tools for your current access
                  level.
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dashboardItems.map((item) => (
                  <div
                    key={item.href}
                    className="flex min-h-[160px] flex-col justify-between rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200"
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-gray-700">
                        {item.description}
                      </p>
                    </div>

                    <Link
                      href={item.href}
                      className="mt-5 inline-flex w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      {item.buttonText}
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
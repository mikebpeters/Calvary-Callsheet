"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

type CurrentVolunteer = {
  id: string;
  user_id: string | null;
  name: string;
  public_name: string | null;
  email: string | null;
  active: boolean;
};

type ScheduleEntry = {
  id: string;
  date: string;
  role_id: string;
  volunteer_id: string | null;
  status: string | null;
  published: boolean;
};

type Blackout = {
  id: string;
  volunteer_id: string;
  date: string;
  note: string | null;
  is_hard: boolean;
};

type DashboardItem = {
  title: string;
  description: string;
  href: string;
  buttonText: string;
};

type DisplayGroup = {
  label: string;
  icon: string;
  roleNames: string[];
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
  return "Volunteer";
}

function getDashboardItems(role: AppRole | null): DashboardItem[] {
  if (role === "admin") {
    return [
      {
        title: "Planner",
        description:
          "Create schedule rows, assign volunteers, and publish services.",
        href: "/planner",
        buttonText: "Open",
      },
      {
        title: "Open Schedule",
        description: "Build and manage upcoming service schedules.",
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
        title: "Requests",
        description:
          "Review volunteer role requests and ministry leader access requests.",
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

/*
 * These are the roles Heike currently includes
 * in the weekly Sunday serving list.
 */
const DISPLAY_GROUPS: DisplayGroup[] = [
  {
    label: "Worship Leader",
    icon: "🎤",
    roleNames: ["Worship Leader"],
  },
  {
    label: "Piano",
    icon: "🎹",
    roleNames: ["Piano"],
  },
  {
    label: "Instruments",
    icon: "🎸",
    roleNames: ["Instruments"],
  },
  {
    label: "Vocals",
    icon: "🎶",
    roleNames: ["Vocals 1", "Vocals 2", "Vocals 3"],
  },
  {
    label: "Audio",
    icon: "🎚️",
    roleNames: ["Sound"],
  },
  {
    label: "Projection",
    icon: "🎥",
    roleNames: ["Projection"],
  },
  {
    label: "Greeters",
    icon: "👋",
    roleNames: ["Greeter 1"],
  },
  {
    label: "Ushers",
    icon: "🙋",
    roleNames: ["Usher 1", "Usher 2"],
  },
  {
    label: "Coffee",
    icon: "☕",
    roleNames: ["Coffee 1"],
  },
  {
    label: "Calvary Kids",
    icon: "👶",
    roleNames: ["Calvary Kids"],
  },
];

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);

  const firstSunday = useMemo(() => getNextSunday(), []);

  const [selectedSunday, setSelectedSunday] =
    useState<Date>(firstSunday);

  const selectedSundayStr = useMemo(
    () => toYmd(selectedSunday),
    [selectedSunday]
  );

  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);

  const [homeLoading, setHomeLoading] = useState(true);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [homeError, setHomeError] = useState("");
  const [authError, setAuthError] = useState("");

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  const [currentVolunteer, setCurrentVolunteer] =
    useState<CurrentVolunteer | null>(null);

  const [blackout, setBlackout] = useState<Blackout | null>(null);

  const [claimingEntryId, setClaimingEntryId] =
    useState<string | null>(null);

  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState("");

  const isSignedIn = !!userEmail;

  const effectiveRole: AppRole | null = isSignedIn
    ? userRole ?? "volunteer"
    : null;

  const canSeeDraftSchedules =
    effectiveRole === "admin" ||
    effectiveRole === "ministry_leader";

  const canClaim =
    effectiveRole === "volunteer" && !!currentVolunteer;

  const isFirstSunday =
    selectedSundayStr === toYmd(firstSunday);

  /*
   * ---------------------------------------------------------
   * AUTHENTICATION + CURRENT VOLUNTEER
   * ---------------------------------------------------------
   */

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
          setCurrentVolunteer(null);
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
          console.error(
            "Home profile lookup failed:",
            profileRes.error
          );

          setUserRole("volunteer");
        } else {
          setUserRole(
            (profileRes.data?.role as AppRole | null) ??
              "volunteer"
          );
        }

        let volunteer: CurrentVolunteer | null = null;

        const volunteerByUserRes = await withTimeout(
          supabase
            .from("volunteers")
            .select(
              "id, user_id, name, public_name, email, active"
            )
            .eq("user_id", user.id)
            .eq("active", true)
            .maybeSingle(),
          "Home volunteer user lookup"
        );

        if (!isMounted) return;

        if (volunteerByUserRes.error) {
          console.error(
            "Home volunteer user lookup failed:",
            volunteerByUserRes.error
          );
        } else {
          volunteer =
            (volunteerByUserRes.data as CurrentVolunteer | null) ??
            null;
        }

        /*
         * Fall back to email if the permanent user_id link
         * has not yet been established.
         */

        if (!volunteer && user.email) {
          const normalizedEmail =
            user.email.trim().toLowerCase();

          const volunteerByEmailRes = await withTimeout(
            supabase
              .from("volunteers")
              .select(
                "id, user_id, name, public_name, email, active"
              )
              .ilike("email", normalizedEmail)
              .eq("active", true)
              .maybeSingle(),
            "Home volunteer email lookup"
          );

          if (!isMounted) return;

          if (volunteerByEmailRes.error) {
            console.error(
              "Home volunteer email lookup failed:",
              volunteerByEmailRes.error
            );
          } else {
            volunteer =
              (volunteerByEmailRes.data as CurrentVolunteer | null) ??
              null;
          }
        }

        setCurrentVolunteer(volunteer);
        setAuthLoaded(true);
      } catch (err) {
        if (!isMounted) return;

        console.error("Home auth load error:", err);

        setAuthError(
          err instanceof Error
            ? err.message
            : "Failed to load sign-in status."
        );

        setUserEmail(null);
        setUserRole(null);
        setCurrentVolunteer(null);
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

  /*
   * ---------------------------------------------------------
   * LOAD SELECTED SUNDAY
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!authLoaded) return;

    let isMounted = true;

    async function loadHomeData() {
      setHomeLoading(true);
      setHomeError("");
      setClaimError("");
      setClaimMessage("");

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
          throw new Error(
            `Roles query failed: ${rolesRes.error.message}`
          );
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
          throw new Error(
            `Volunteers query failed: ${volunteersRes.error.message}`
          );
        }

        setVolunteers(
          (volunteersRes.data as Volunteer[]) ?? []
        );

        let entriesQuery = supabase
          .from("schedule_entries")
          .select(
            "id, date, role_id, volunteer_id, status, published"
          )
          .eq("date", selectedSundayStr);

        /*
         * Volunteers see only published rows.
         * Admins and ministry leaders can also see drafts.
         */

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

        setEntries(
          (entriesRes.data as ScheduleEntry[]) ?? []
        );

        /*
         * Check the signed-in volunteer's availability
         * for this Sunday.
         */

        if (currentVolunteer) {
          const blackoutRes = await withTimeout(
            supabase
              .from("volunteer_blackouts")
              .select(
                "id, volunteer_id, date, note, is_hard"
              )
              .eq("volunteer_id", currentVolunteer.id)
              .eq("date", selectedSundayStr)
              .maybeSingle(),
            "Home blackout query"
          );

          if (!isMounted) return;

          if (blackoutRes.error) {
            console.error(
              "Home blackout lookup failed:",
              blackoutRes.error
            );

            setBlackout(null);
          } else {
            setBlackout(
              (blackoutRes.data as Blackout | null) ?? null
            );
          }
        } else {
          setBlackout(null);
        }
      } catch (err) {
        if (!isMounted) return;

        console.error("Home page load error:", err);

        setHomeError(
          err instanceof Error
            ? err.message
            : "Failed to load home page data."
        );

        setEntries([]);
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
  }, [
    authLoaded,
    canSeeDraftSchedules,
    currentVolunteer,
    selectedSundayStr,
    supabase,
  ]);

  /*
   * ---------------------------------------------------------
   * LOOKUP MAPS
   * ---------------------------------------------------------
   */

  const volunteerMap = useMemo(() => {
    return new Map(
      volunteers.map((volunteer) => [
        volunteer.id,
        volunteer.public_name?.trim() ||
          volunteer.name.trim(),
      ])
    );
  }, [volunteers]);

  const roleMap = useMemo(() => {
    return new Map(
      roles.map((role) => [
        role.name.trim().toLowerCase(),
        role,
      ])
    );
  }, [roles]);

  const entryByRoleId = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();

    for (const entry of entries) {
      map.set(entry.role_id, entry);
    }

    return map;
  }, [entries]);

  /*
   * ---------------------------------------------------------
   * COMPACT WEEKLY ROSTER
   * ---------------------------------------------------------
   */

  const displayGroups = useMemo(() => {
    return DISPLAY_GROUPS.map((group) => {
      const positions = group.roleNames.map((roleName) => {
        const role =
          roleMap.get(roleName.toLowerCase()) ?? null;

        const entry = role
          ? entryByRoleId.get(role.id) ?? null
          : null;

        const assignedName = entry?.volunteer_id
          ? volunteerMap.get(entry.volunteer_id) ?? null
          : null;

        return {
          roleName,
          role,
          entry,
          assignedName,
        };
      });

      return {
        ...group,
        positions,
      };
    });
  }, [roleMap, entryByRoleId, volunteerMap]);

  const dashboardItems =
    getDashboardItems(effectiveRole);

  /*
   * ---------------------------------------------------------
   * SUNDAY NAVIGATION
   * ---------------------------------------------------------
   */

  function goPreviousSunday() {
    if (isFirstSunday) return;

    setSelectedSunday((current) =>
      addDays(current, -7)
    );
  }

  function goNextSunday() {
    setSelectedSunday((current) =>
      addDays(current, 7)
    );
  }

  function goToUpcomingSunday() {
    setSelectedSunday(firstSunday);
  }

  /*
   * ---------------------------------------------------------
   * CLAIM OPEN ROLE
   * ---------------------------------------------------------
   */

  async function claimRole(
    entryId: string,
    roleName: string
  ) {
    if (!currentVolunteer) {
      setClaimError(
        "Your account is not linked to an active volunteer profile."
      );
      return;
    }

    setClaimMessage("");
    setClaimError("");

    if (blackout?.is_hard) {
      setClaimError(
        blackout.note
          ? `You marked this Sunday unavailable: ${blackout.note}`
          : "You marked this Sunday unavailable, so this role cannot be claimed."
      );
      return;
    }

    if (blackout && !blackout.is_hard) {
      const warning = blackout.note
        ? `You marked this date with the note: "${blackout.note}". Do you still want to claim ${roleName}?`
        : `You previously marked this date as unavailable. Do you still want to claim ${roleName}?`;

      const continueClaim =
        window.confirm(warning);

      if (!continueClaim) return;
    }

    const confirmed = window.confirm(
      `Claim ${roleName} for ${prettyDate(
        selectedSunday
      )}?`
    );

    if (!confirmed) return;

    setClaimingEntryId(entryId);

    try {
      const { data, error } = await supabase
        .from("schedule_entries")
        .update({
          volunteer_id: currentVolunteer.id,
          status: "assigned",
        })
        .eq("id", entryId)
        .eq("published", true)
        .is("volunteer_id", null)
        .select(
          "id, date, role_id, volunteer_id, status, published"
        );

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error(
          "This position is no longer available. Another volunteer may have claimed it first. Please refresh the page."
        );
      }

      const claimedEntry =
        data[0] as ScheduleEntry;

      setEntries((current) =>
        current.map((entry) =>
          entry.id === claimedEntry.id
            ? claimedEntry
            : entry
        )
      );

      setVolunteers((current) => {
        if (
          current.some(
            (volunteer) =>
              volunteer.id === currentVolunteer.id
          )
        ) {
          return current;
        }

        return [
          ...current,
          {
            id: currentVolunteer.id,
            name: currentVolunteer.name,
            public_name:
              currentVolunteer.public_name,
          },
        ];
      });

      setClaimMessage(
        `You're now scheduled for ${roleName} on ${prettyDate(
          selectedSunday
        )}.`
      );
    } catch (err) {
      console.error("Claim role error:", err);

      setClaimError(
        err instanceof Error
          ? err.message
          : "Could not claim this position."
      );
    } finally {
      setClaimingEntryId(null);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      {/*
       * -------------------------------------------------------
       * INTRO
       * -------------------------------------------------------
       */}

      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Calvary Call Sheet
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Serving together at Calvary
            </h1>

            <p className="mt-3 max-w-2xl text-base text-gray-700">
              See who is serving, find open positions, and
              manage your own schedule and availability.
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
                Viewing as guest. Sign in to see the serving
                schedule and your tools.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        {!authLoaded ? null : !isSignedIn ? (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Sign in required
            </h2>

            <p className="mt-2 text-sm text-gray-700">
              Sign in to view the serving schedule,
              availability tools, and role-specific actions.
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
            {/*
             * -------------------------------------------------
             * WEEKLY SERVING ROSTER
             * -------------------------------------------------
             */}

            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
              <div className="border-b border-stone-200 px-6 py-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">
                      {isFirstSunday
                        ? "This Sunday at Calvary"
                        : "Sunday at Calvary"}
                    </p>

                    <h2 className="mt-1 text-2xl font-bold text-gray-900">
                      {prettyDate(selectedSunday)}
                    </h2>

                    <p className="mt-1 text-sm text-gray-600">
                      Your serving team for this service.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={goPreviousSunday}
                      disabled={isFirstSunday}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      ← Previous
                    </button>

                    {!isFirstSunday ? (
                      <button
                        type="button"
                        onClick={goToUpcomingSunday}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Upcoming
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={goNextSunday}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-stone-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>

              {homeError ? (
                <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {homeError}
                </div>
              ) : null}

              {claimError ? (
                <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {claimError}
                </div>
              ) : null}

              {claimMessage ? (
                <div className="m-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  {claimMessage}
                </div>
              ) : null}

              {homeLoading ? (
                <div className="px-6 py-10 text-sm text-gray-600">
                  Loading serving team...
                </div>
              ) : entries.length === 0 ? (
                <div className="px-6 py-10">
                  <p className="font-medium text-gray-900">
                    No schedule has been published for this
                    Sunday yet.
                  </p>

                  {canSeeDraftSchedules ? (
                    <p className="mt-1 text-sm text-gray-600">
                      There are no schedule rows for this date
                      yet.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-600">
                      Check back later or try another Sunday.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid md:grid-cols-2">
                  {displayGroups.map((group, index) => {
                    const names = group.positions.map(
                      (position) =>
                        position.assignedName || "Open"
                    );

                    const hasOpenPosition =
                      group.positions.some(
                        (position) =>
                          !!position.entry &&
                          !position.entry.volunteer_id
                      );

                    return (
                      <div
                        key={group.label}
                        className={`border-stone-200 px-6 py-4 ${
                          index <
                          displayGroups.length - 2
                            ? "border-b"
                            : ""
                        } ${
                          index % 2 === 0
                            ? "md:border-r"
                            : ""
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xl">
                            {group.icon}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-900">
                              {group.label}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                              {group.positions.map(
                                (position, positionIndex) => {
                                  const entry =
                                    position.entry;

                                  const isOpen =
                                    !!entry &&
                                    !entry.volunteer_id;

                                  const canClaimThis =
                                    canClaim &&
                                    isOpen &&
                                    entry.published;

                                  const isClaiming =
                                    claimingEntryId ===
                                    entry?.id;

                                  return (
                                    <span
                                      key={
                                        position.roleName
                                      }
                                      className="inline-flex items-center"
                                    >
                                      {positionIndex >
                                      0 ? (
                                        <span className="mr-2 text-stone-400">
                                          •
                                        </span>
                                      ) : null}

                                      {position.assignedName ? (
                                        <span className="text-gray-700">
                                          {
                                            position.assignedName
                                          }
                                        </span>
                                      ) : canClaimThis ? (
                                        <button
                                          type="button"
                                          disabled={
                                            isClaiming
                                          }
                                          onClick={() =>
                                            claimRole(
                                              entry.id,
                                              position.roleName
                                            )
                                          }
                                          className="font-semibold text-amber-700 hover:text-amber-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isClaiming
                                            ? "Claiming..."
                                            : "Open — Claim"}
                                        </button>
                                      ) : (
                                        <span
                                          className={
                                            isOpen
                                              ? "text-amber-700"
                                              : "text-stone-400"
                                          }
                                        >
                                          {isOpen
                                            ? "Open"
                                            : "—"}
                                        </span>
                                      )}
                                    </span>
                                  );
                                }
                              )}
                            </div>

                            {hasOpenPosition &&
                            canClaim ? (
                              <div className="sr-only">
                                Open positions may be
                                claimed.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canSeeDraftSchedules ? (
                <div className="border-t border-stone-200 bg-amber-50 px-6 py-3 text-xs text-amber-800">
                  Admin/leader view: draft schedule entries
                  may also be visible.
                </div>
              ) : null}
            </section>

            {/*
             * -------------------------------------------------
             * NEXT ACTIONS
             * -------------------------------------------------
             */}

            <section>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Your next actions
                </h2>

                <p className="mt-1 text-sm text-gray-600">
                  These are the most relevant tools for your
                  current access level.
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

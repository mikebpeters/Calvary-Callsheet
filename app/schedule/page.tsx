"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";

type RoleCategory = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

type Role = {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  sort_order: number;
  lead_volunteer_id: string | null;
};

type Volunteer = {
  id: string;
  user_id: string | null;
  name: string;
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

type VolunteerBlackout = {
  id: string;
  volunteer_id: string;
  date: string;
  note: string | null;
  is_hard: boolean;
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

  return addDays(today, daysUntilSunday);
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

function notifyTopNavToRefresh() {
  window.dispatchEvent(new Event("notifications-updated"));
}

export default function SchedulePage() {
  const supabase = useMemo(() => createClient(), []);

  const [selectedDate, setSelectedDate] = useState(
    toYmd(getNextSunday())
  );

  const [roleCategories, setRoleCategories] = useState<RoleCategory[]>(
    []
  );

  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [blackouts, setBlackouts] = useState<VolunteerBlackout[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [currentVolunteerId, setCurrentVolunteerId] = useState<
    string | null
  >(null);

  const [appRole, setAppRole] = useState<AppRole | null>(null);

  const canManageSchedule =
    appRole === "ministry_leader" || appRole === "admin";

  useEffect(() => {
    loadScheduleData(selectedDate);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function loadScheduleData(date: string) {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          `Could not get signed-in user: ${userError.message}`
        );
      }

      let loadedAppRole: AppRole | null = null;

      if (user) {
        const { data: profileRecord, error: profileError } =
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          throw new Error(
            `Could not load profile role: ${profileError.message}`
          );
        }

        loadedAppRole =
          (profileRecord?.role as AppRole | null) ?? null;

        setAppRole(loadedAppRole);

        const {
          data: volunteerRecord,
          error: volunteerLookupError,
        } = await supabase
          .from("volunteers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (volunteerLookupError) {
          throw new Error(
            `Could not find volunteer record: ${volunteerLookupError.message}`
          );
        }

        setCurrentVolunteerId(volunteerRecord?.id ?? null);
      } else {
        setAppRole(null);
        setCurrentVolunteerId(null);
      }

      const {
        data: categoriesData,
        error: categoriesError,
      } = await supabase
        .from("role_categories")
        .select("id, name, sort_order, active")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (categoriesError) {
        throw new Error(
          `Role categories query failed: ${categoriesError.message}`
        );
      }

      setRoleCategories(
        (categoriesData ?? []) as RoleCategory[]
      );

      const { data: rolesData, error: rolesError } =
        await supabase
          .from("roles")
          .select(
            "id, name, active, category_id, sort_order, lead_volunteer_id"
          )
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

      if (rolesError) {
        throw new Error(
          `Roles query failed: ${rolesError.message}`
        );
      }

      const activeRoles: Role[] = (rolesData ?? []).map(
        (role) => ({
          id: role.id,
          name: role.name,
          active: role.active,
          category_id: role.category_id ?? null,
          sort_order: role.sort_order ?? 999,
          lead_volunteer_id: role.lead_volunteer_id ?? null,
        })
      );

      setRoles(activeRoles);

      const {
        data: volunteersData,
        error: volunteersError,
      } = await supabase
        .from("volunteers")
        .select("id, user_id, name, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (volunteersError) {
        throw new Error(
          `Volunteers query failed: ${volunteersError.message}`
        );
      }

      setVolunteers(
        (volunteersData ?? []) as Volunteer[]
      );

      const {
        data: blackoutData,
        error: blackoutError,
      } = await supabase
        .from("volunteer_blackouts")
        .select("id, volunteer_id, date, note, is_hard")
        .eq("date", date);

      if (blackoutError) {
        throw new Error(
          `Blackouts query failed: ${blackoutError.message}`
        );
      }

      setBlackouts(
        (blackoutData ?? []).map((blackout) => ({
          id: blackout.id,
          volunteer_id: blackout.volunteer_id,
          date: blackout.date,
          note: blackout.note,
          is_hard: blackout.is_hard ?? false,
        }))
      );

      /*
       * Schedule rows are created in Planner from service templates.
       *
       * This page deliberately does NOT create missing rows.
       * Opening Schedule should never modify the schedule.
       */

      let entriesQuery = supabase
        .from("schedule_entries")
        .select(
          "id, date, role_id, volunteer_id, status, published"
        )
        .eq("date", date);

      /*
       * Volunteers only see published schedules.
       * Leaders/admins may see drafts while managing the schedule.
       */

      if (
        loadedAppRole !== "admin" &&
        loadedAppRole !== "ministry_leader"
      ) {
        entriesQuery = entriesQuery.eq("published", true);
      }

      const {
        data: existingEntries,
        error: entriesError,
      } = await entriesQuery;

      if (entriesError) {
        throw new Error(
          `Schedule entries query failed: ${entriesError.message}`
        );
      }

      setEntries(
        (existingEntries ?? []) as ScheduleEntry[]
      );
    } catch (err) {
      console.error("Schedule load error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unknown schedule error"
      );

      setRoleCategories([]);
      setRoles([]);
      setVolunteers([]);
      setEntries([]);
      setBlackouts([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshEntriesForDate(date: string) {
    let query = supabase
      .from("schedule_entries")
      .select(
        "id, date, role_id, volunteer_id, status, published"
      )
      .eq("date", date);

    if (!canManageSchedule) {
      query = query.eq("published", true);
    }

    const { data, error: refreshError } = await query;

    if (refreshError) {
      throw new Error(
        `Could not refresh schedule: ${refreshError.message}`
      );
    }

    setEntries((data ?? []) as ScheduleEntry[]);
  }

  function getBlackoutForVolunteer(
    volunteerId: string | null
  ) {
    if (!volunteerId) return null;

    return (
      blackouts.find(
        (blackout) =>
          blackout.volunteer_id === volunteerId
      ) ?? null
    );
  }

  function getVolunteerName(volunteerId: string) {
    return volunteers.find(
      (volunteer) => volunteer.id === volunteerId
    )?.name;
  }

  function getRoleName(roleId: string) {
    return (
      roles.find((role) => role.id === roleId)?.name ??
      "a role"
    );
  }

  function getVolunteerUserId(
    volunteerId: string | null
  ) {
    if (!volunteerId) return null;

    return (
      volunteers.find(
        (volunteer) => volunteer.id === volunteerId
      )?.user_id ?? null
    );
  }

  async function createAssignmentNotifications({
    roleId,
    date,
    oldVolunteerId,
    newVolunteerId,
  }: {
    roleId: string;
    date: string;
    oldVolunteerId: string | null;
    newVolunteerId: string | null;
  }) {
    if (oldVolunteerId === newVolunteerId) return;

    const roleName = getRoleName(roleId);
    const serviceDate = prettyDate(date);
    const href = "/my-schedule";

    const rowsToInsert: {
      user_id: string;
      title: string;
      body: string;
      href: string;
      read_at: null;
      type: "assignment" | "removal";
    }[] = [];

    if (newVolunteerId) {
      const newUserId =
        getVolunteerUserId(newVolunteerId);

      if (newUserId) {
        rowsToInsert.push({
          user_id: newUserId,
          title: "You have been scheduled",
          body: `You are scheduled for ${roleName} on ${serviceDate}.`,
          href,
          read_at: null,
          type: "assignment",
        });
      }
    }

    if (oldVolunteerId) {
      const oldUserId =
        getVolunteerUserId(oldVolunteerId);

      if (oldUserId) {
        rowsToInsert.push({
          user_id: oldUserId,
          title: "You have been removed from a schedule",
          body: `You are no longer scheduled for ${roleName} on ${serviceDate}.`,
          href,
          read_at: null,
          type: "removal",
        });
      }
    }

    if (rowsToInsert.length === 0) return;

    const { error: notificationError } =
      await supabase
        .from("notifications")
        .insert(rowsToInsert);

    if (notificationError) {
      console.error(
        "Notification insert failed:",
        notificationError
      );

      setError(
        `Assignment saved, but notification failed: ${notificationError.message}`
      );

      return;
    }

    notifyTopNavToRefresh();
  }

  async function updateAssignment(
    entryId: string,
    roleId: string,
    volunteerId: string,
    expectedVolunteerId: string | null
  ) {
    if (!canManageSchedule) return;

    const normalizedVolunteerId =
      volunteerId === "" ? null : volunteerId;

    if (
      normalizedVolunteerId === expectedVolunteerId
    ) {
      return;
    }

    const selectedBlackout =
      getBlackoutForVolunteer(
        normalizedVolunteerId
      );

    if (
      selectedBlackout &&
      normalizedVolunteerId
    ) {
      const volunteerName =
        getVolunteerName(normalizedVolunteerId) ??
        "This volunteer";

      if (selectedBlackout.is_hard) {
        setError(
          `${volunteerName} is marked unavailable for ${prettyDate(
            selectedDate
          )} and cannot be scheduled.`
        );

        return;
      }

      const blackoutNote =
        selectedBlackout.note
          ? `\n\nNote: ${selectedBlackout.note}`
          : "";

      const shouldContinue = window.confirm(
        `${volunteerName} is marked unavailable for ${prettyDate(
          selectedDate
        )}.${blackoutNote}\n\nAssign anyway?`
      );

      if (!shouldContinue) return;
    }

    const previousEntries = [...entries];

    setSavingRoleId(roleId);
    setError("");

    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              volunteer_id:
                normalizedVolunteerId,
              status: normalizedVolunteerId
                ? "assigned"
                : null,
            }
          : entry
      )
    );

    let query = supabase
      .from("schedule_entries")
      .update({
        volunteer_id: normalizedVolunteerId,
        status: normalizedVolunteerId
          ? "assigned"
          : null,
      })
      .eq("id", entryId)
      .select("id");

    if (expectedVolunteerId === null) {
      query = query.is("volunteer_id", null);
    } else {
      query = query.eq(
        "volunteer_id",
        expectedVolunteerId
      );
    }

    const { data, error: updateError } =
      await query;

    if (updateError) {
      console.error(
        "Schedule update error:",
        updateError
      );

      setEntries(previousEntries);

      setError(
        `Could not save assignment: ${updateError.message}`
      );

      setSavingRoleId(null);
      return;
    }

    if (!data || data.length === 0) {
      setEntries(previousEntries);

      setError(
        "This assignment changed before your update could be saved. Please refresh and try again."
      );

      await refreshEntriesForDate(
        selectedDate
      );

      setSavingRoleId(null);
      return;
    }

    await createAssignmentNotifications({
      roleId,
      date: selectedDate,
      oldVolunteerId: expectedVolunteerId,
      newVolunteerId: normalizedVolunteerId,
    });

    setSavingRoleId(null);
  }

  async function claimRole(
    entryId: string,
    roleId: string
  ) {
    if (
      !currentVolunteerId ||
      canManageSchedule
    ) {
      return;
    }

    const ownBlackout =
      getBlackoutForVolunteer(
        currentVolunteerId
      );

    if (ownBlackout) {
      if (ownBlackout.is_hard) {
        setError(
          `You are marked unavailable for ${prettyDate(
            selectedDate
          )} and cannot claim this role.`
        );

        return;
      }

      const blackoutNote =
        ownBlackout.note
          ? `\n\nNote: ${ownBlackout.note}`
          : "";

      const shouldContinue = window.confirm(
        `You are marked unavailable for ${prettyDate(
          selectedDate
        )}.${blackoutNote}\n\nClaim this role anyway?`
      );

      if (!shouldContinue) return;
    }

    const previousEntries = [...entries];

    setSavingRoleId(roleId);
    setError("");

    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              volunteer_id:
                currentVolunteerId,
              status: "assigned",
            }
          : entry
      )
    );

    const { data, error } = await supabase
      .from("schedule_entries")
      .update({
        volunteer_id:
          currentVolunteerId,
        status: "assigned",
      })
      .eq("id", entryId)
      .is("volunteer_id", null)
      .select("id");

    if (error) {
      console.error("Claim failed:", error);

      setEntries(previousEntries);

      setError(
        `Could not claim role: ${error.message}`
      );

      setSavingRoleId(null);
      return;
    }

    if (!data || data.length === 0) {
      setEntries(previousEntries);

      setError(
        "That role was just claimed by someone else. Please refresh and try again."
      );

      await refreshEntriesForDate(
        selectedDate
      );

      setSavingRoleId(null);
      return;
    }

    await createAssignmentNotifications({
      roleId,
      date: selectedDate,
      oldVolunteerId: null,
      newVolunteerId:
        currentVolunteerId,
    });

    setSavingRoleId(null);
  }

  /*
   * Only show roles that actually have schedule rows
   * for the selected service date.
   *
   * The Planner/template determines which roles belong
   * to a particular Sunday.
   */
  const rows = useMemo(() => {
    return entries
      .map((entry) => {
        const role =
          roles.find(
            (role) =>
              role.id === entry.role_id
          ) ?? null;

        return role
          ? {
              role,
              entry,
            }
          : null;
      })
      .filter(
        (
          row
        ): row is {
          role: Role;
          entry: ScheduleEntry;
        } => row !== null
      );
  }, [roles, entries]);

  const groupedRows = useMemo(() => {
    const groups = roleCategories
      .map((category) => ({
        id: category.id,
        category: category.name,
        sort_order: category.sort_order,
        rows: rows
          .filter(
            (row) =>
              row.role.category_id ===
              category.id
          )
          .sort(
            (a, b) =>
              a.role.sort_order -
                b.role.sort_order ||
              a.role.name.localeCompare(
                b.role.name
              )
          ),
      }))
      .filter(
        (group) => group.rows.length > 0
      );

    const uncategorizedRows = rows
      .filter(
        (row) =>
          !row.role.category_id
      )
      .sort(
        (a, b) =>
          a.role.sort_order -
            b.role.sort_order ||
          a.role.name.localeCompare(
            b.role.name
          )
      );

    if (uncategorizedRows.length > 0) {
      groups.push({
        id: "uncategorized",
        category: "Other",
        sort_order: 999,
        rows: uncategorizedRows,
      });
    }

    return groups.sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.category.localeCompare(
          b.category
        )
    );
  }, [roleCategories, rows]);

  const assignedCount = rows.filter(
    (row) => row.entry.volunteer_id
  ).length;

  const totalCount = rows.length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Schedule
              </h1>

              <p className="mt-1 text-sm text-gray-600">
                View the service schedule and open
                serving opportunities.
              </p>

              <p className="mt-1 text-xs text-gray-500">
                {canManageSchedule
                  ? "Leader view: you can assign or clear volunteers."
                  : "Volunteer view: you can claim open roles."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="service-date"
                className="text-sm font-medium text-gray-700"
              >
                Service date
              </label>

              <input
                id="service-date"
                type="date"
                value={selectedDate}
                onChange={(e) =>
                  setSelectedDate(
                    e.target.value
                  )
                }
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-800">
              {prettyDate(selectedDate)}
            </span>

            <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
              {assignedCount} of{" "}
              {totalCount} roles filled
            </span>

            {blackouts.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                {blackouts.length} blackout
                {blackouts.length === 1
                  ? ""
                  : "s"}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">
              Loading schedule...
            </p>
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">
              {canManageSchedule
                ? "No schedule has been created for this date yet. Use Planner to create one from a template."
                : "There is no published schedule for this date yet."}
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            {groupedRows.map(
              ({
                id,
                category,
                rows: categoryRows,
              }) => {
                const categoryAssignedCount =
                  categoryRows.filter(
                    (row) =>
                      row.entry.volunteer_id
                  ).length;

                return (
                  <section
                    key={id}
                    className="rounded-2xl border bg-white p-6 shadow-sm"
                  >
                    <div className="mb-4 border-b border-gray-100 pb-3">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {category}
                      </h2>

                      <p className="text-sm text-gray-500">
                        {
                          categoryAssignedCount
                        }{" "}
                        of{" "}
                        {categoryRows.length}{" "}
                        filled
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-y-3">
                        <thead>
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Role
                            </th>

                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Volunteer
                            </th>

                            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {categoryRows.map(
                            ({
                              role,
                              entry,
                            }) => {
                              const value =
                                entry.volunteer_id ??
                                "";

                              const isSaving =
                                savingRoleId ===
                                role.id;

                              const assignedVolunteer =
                                volunteers.find(
                                  (volunteer) =>
                                    volunteer.id ===
                                    entry.volunteer_id
                                );

                              const blackout =
                                getBlackoutForVolunteer(
                                  entry.volunteer_id
                                );

                              return (
                                <tr
                                  key={role.id}
                                  className="rounded-2xl bg-gray-50"
                                >
                                  <td className="rounded-l-2xl px-4 py-4 text-sm font-medium text-gray-900">
                                    <div>
                                      {role.name}
                                    </div>

                                    {role.lead_volunteer_id ? (
                                      <div className="mt-1 text-xs text-gray-500">
                                        Lead:{" "}
                                        {getVolunteerName(
                                          role.lead_volunteer_id
                                        ) ??
                                          "Assigned"}
                                      </div>
                                    ) : null}
                                  </td>

                                  <td className="px-4 py-4">
                                    {canManageSchedule ? (
                                      <div className="space-y-1">
                                        <select
                                          value={
                                            value
                                          }
                                          onChange={(
                                            e
                                          ) =>
                                            updateAssignment(
                                              entry.id,
                                              role.id,
                                              e
                                                .target
                                                .value,
                                              entry.volunteer_id
                                            )
                                          }
                                          disabled={
                                            isSaving
                                          }
                                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                                        >
                                          <option value="">
                                            Open
                                          </option>

                                          {volunteers.map(
                                            (
                                              volunteer
                                            ) => (
                                              <option
                                                key={
                                                  volunteer.id
                                                }
                                                value={
                                                  volunteer.id
                                                }
                                              >
                                                {
                                                  volunteer.name
                                                }
                                              </option>
                                            )
                                          )}
                                        </select>

                                        {blackout ? (
                                          <div
                                            className={`text-xs font-medium ${
                                              blackout.is_hard
                                                ? "text-red-700"
                                                : "text-amber-700"
                                            }`}
                                          >
                                            {blackout.is_hard
                                              ? "⛔ Hard blackout"
                                              : "⚠ Unavailable"}

                                            {blackout.note
                                              ? `: ${blackout.note}`
                                              : ""}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : entry.volunteer_id ===
                                      null ? (
                                      currentVolunteerId ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            claimRole(
                                              entry.id,
                                              role.id
                                            )
                                          }
                                          disabled={
                                            isSaving
                                          }
                                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
                                        >
                                          {isSaving
                                            ? "Claiming..."
                                            : "Claim"}
                                        </button>
                                      ) : (
                                        <span className="text-sm text-gray-500">
                                          Open
                                        </span>
                                      )
                                    ) : (
                                      <div className="space-y-1">
                                        <span className="text-sm font-medium text-gray-800">
                                          {assignedVolunteer?.name ??
                                            "Assigned"}
                                        </span>

                                        {blackout ? (
                                          <div
                                            className={`text-xs font-medium ${
                                              blackout.is_hard
                                                ? "text-red-700"
                                                : "text-amber-700"
                                            }`}
                                          >
                                            {blackout.is_hard
                                              ? "⛔ Hard blackout"
                                              : "⚠ Unavailable"}

                                            {blackout.note
                                              ? `: ${blackout.note}`
                                              : ""}
                                          </div>
                                        ) : null}
                                      </div>
                                    )}
                                  </td>

                                  <td className="rounded-r-2xl px-4 py-4 text-sm">
                                    {isSaving ? (
                                      <span className="text-gray-500">
                                        Saving...
                                      </span>
                                    ) : assignedVolunteer ? (
                                      blackout ? (
                                        <span className="font-medium text-amber-700">
                                          Assigned,
                                          unavailable
                                        </span>
                                      ) : (
                                        <span className="font-medium text-green-700">
                                          Assigned
                                        </span>
                                      )
                                    ) : (
                                      <span className="font-medium text-amber-700">
                                        Open
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              }
            )}
          </div>
        )}
      </div>
    </main>
  );
}

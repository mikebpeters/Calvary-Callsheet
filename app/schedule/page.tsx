"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";
type RoleCategory = "Lead" | "Platform" | "AV" | "Other";

type Role = {
  id: string;
  name: string;
  active: boolean;
  category: RoleCategory;
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
};

type VolunteerBlackout = {
  id: string;
  volunteer_id: string;
  date: string;
  note: string | null;
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

const categoryOrder: RoleCategory[] = ["Lead", "Platform", "AV", "Other"];

export default function SchedulePage() {
  const supabase = useMemo(() => createClient(), []);

  const [selectedDate, setSelectedDate] = useState(toYmd(getNextSunday()));
  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [blackouts, setBlackouts] = useState<VolunteerBlackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [currentVolunteerId, setCurrentVolunteerId] = useState<string | null>(
    null
  );
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
        throw new Error(`Could not get signed-in user: ${userError.message}`);
      }

      if (user) {
        const { data: profileRecord, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(
            `Could not load profile role: ${profileError.message}`
          );
        }

        setAppRole((profileRecord?.role as AppRole | null) ?? null);

        const { data: volunteerRecord, error: volunteerLookupError } =
          await supabase
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

      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name, active, category, sort_order, lead_volunteer_id")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (rolesError) {
        throw new Error(`roles query failed: ${rolesError.message}`);
      }

      const activeRoles: Role[] = (rolesData ?? []).map((role) => ({
        id: role.id,
        name: role.name,
        active: role.active,
        category: (role.category ?? "Other") as RoleCategory,
        sort_order: role.sort_order ?? 999,
        lead_volunteer_id: role.lead_volunteer_id ?? null,
      }));

      setRoles(activeRoles);

      const { data: volunteersData, error: volunteersError } = await supabase
        .from("volunteers")
        .select("id, user_id, name, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (volunteersError) {
        throw new Error(`volunteers query failed: ${volunteersError.message}`);
      }

      setVolunteers(volunteersData ?? []);

      const { data: blackoutData, error: blackoutError } = await supabase
        .from("volunteer_blackouts")
        .select("id, volunteer_id, date, note")
        .eq("date", date);

      if (blackoutError) {
        throw new Error(`blackouts query failed: ${blackoutError.message}`);
      }

      setBlackouts(blackoutData ?? []);

      const { data: existingEntries, error: entriesError } = await supabase
        .from("schedule_entries")
        .select("id, date, role_id, volunteer_id, status")
        .eq("date", date);

      if (entriesError) {
        throw new Error(
          `schedule_entries query failed: ${entriesError.message}`
        );
      }

      const currentEntries = existingEntries ?? [];
      const existingRoleIds = new Set(currentEntries.map((e) => e.role_id));
      const missingRoles = activeRoles.filter(
        (role) => !existingRoleIds.has(role.id)
      );

      if (missingRoles.length > 0) {
        const rowsToInsert = missingRoles.map((role) => ({
          date,
          role_id: role.id,
          volunteer_id: null,
          status: null,
        }));

        const { error: insertError } = await supabase
          .from("schedule_entries")
          .upsert(rowsToInsert, {
            onConflict: "date,role_id",
            ignoreDuplicates: true,
          });

        if (insertError) {
          throw new Error(`insert failed: ${insertError.message}`);
        }

        const { data: refreshedEntries, error: refreshedError } = await supabase
          .from("schedule_entries")
          .select("id, date, role_id, volunteer_id, status")
          .eq("date", date);

        if (refreshedError) {
          throw new Error(`refetch failed: ${refreshedError.message}`);
        }

        setEntries(refreshedEntries ?? []);
      } else {
        setEntries(currentEntries);
      }
    } catch (err) {
      console.error("Schedule load error:", err);
      setError(err instanceof Error ? err.message : "Unknown schedule error");
      setRoles([]);
      setVolunteers([]);
      setEntries([]);
      setBlackouts([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshEntriesForDate(date: string) {
    const { data, error: refreshError } = await supabase
      .from("schedule_entries")
      .select("id, date, role_id, volunteer_id, status")
      .eq("date", date);

    if (refreshError) {
      throw new Error(`Could not refresh schedule: ${refreshError.message}`);
    }

    setEntries(data ?? []);
  }

  function getBlackoutForVolunteer(volunteerId: string | null) {
    if (!volunteerId) return null;

    return (
      blackouts.find((blackout) => blackout.volunteer_id === volunteerId) ??
      null
    );
  }

  function getVolunteerName(volunteerId: string) {
    return volunteers.find((volunteer) => volunteer.id === volunteerId)?.name;
  }

  function getRoleName(roleId: string) {
    return roles.find((role) => role.id === roleId)?.name ?? "a role";
  }

  function getVolunteerUserId(volunteerId: string | null) {
    if (!volunteerId) return null;
    return volunteers.find((volunteer) => volunteer.id === volunteerId)?.user_id ?? null;
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
    const href = `/schedule?date=${date}`;
    const rowsToInsert = [];

    if (newVolunteerId) {
      const newUserId = getVolunteerUserId(newVolunteerId);

      if (newUserId) {
        rowsToInsert.push({
          user_id: newUserId,
          title: "You have been scheduled",
          body: `You are scheduled for ${roleName} on ${serviceDate}.`,
          href,
          read_at: null,
        });
      }
    }

    if (oldVolunteerId) {
      const oldUserId = getVolunteerUserId(oldVolunteerId);

      if (oldUserId) {
        rowsToInsert.push({
          user_id: oldUserId,
          title: "You have been removed from a schedule",
          body: `You are no longer scheduled for ${roleName} on ${serviceDate}.`,
          href,
          read_at: null,
        });
      }
    }

    if (rowsToInsert.length === 0) return;

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert(rowsToInsert);

    if (notificationError) {
      console.error("Notification insert failed:", notificationError);
      setError(`Assignment saved, but notification failed: ${notificationError.message}`);
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

    const normalizedVolunteerId = volunteerId === "" ? null : volunteerId;
    const selectedBlackout = getBlackoutForVolunteer(normalizedVolunteerId);

    if (selectedBlackout && normalizedVolunteerId) {
      const volunteerName =
        getVolunteerName(normalizedVolunteerId) ?? "This volunteer";
      const blackoutNote = selectedBlackout.note
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
              volunteer_id: normalizedVolunteerId,
              status: normalizedVolunteerId ? "assigned" : null,
            }
          : entry
      )
    );

    let query = supabase
      .from("schedule_entries")
      .update({
        volunteer_id: normalizedVolunteerId,
        status: normalizedVolunteerId ? "assigned" : null,
      })
      .eq("id", entryId)
      .select("id");

    if (expectedVolunteerId === null) {
      query = query.is("volunteer_id", null);
    } else {
      query = query.eq("volunteer_id", expectedVolunteerId);
    }

    const { data, error: updateError } = await query;

    if (updateError) {
      console.error("Schedule update error:", updateError);
      setEntries(previousEntries);
      setError(`Could not save assignment: ${updateError.message}`);
      setSavingRoleId(null);
      return;
    }

    if (!data || data.length === 0) {
      setEntries(previousEntries);
      setError(
        "This assignment changed before your update could be saved. Please refresh and try again."
      );
      await refreshEntriesForDate(selectedDate);
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

  async function claimRole(entryId: string, roleId: string) {
    if (!currentVolunteerId || canManageSchedule) return;

    const previousEntries = [...entries];

    setSavingRoleId(roleId);
    setError("");

    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              volunteer_id: currentVolunteerId,
              status: "assigned",
            }
          : entry
      )
    );

    const { data, error } = await supabase
      .from("schedule_entries")
      .update({
        volunteer_id: currentVolunteerId,
        status: "assigned",
      })
      .eq("id", entryId)
      .is("volunteer_id", null)
      .select("id");

    if (error) {
      console.error("Claim failed:", error);
      setEntries(previousEntries);
      setError(`Could not claim role: ${error.message}`);
      setSavingRoleId(null);
      return;
    }

    if (!data || data.length === 0) {
      setEntries(previousEntries);
      setError(
        "That role was just claimed by someone else. Please refresh and try again."
      );
      await refreshEntriesForDate(selectedDate);
      setSavingRoleId(null);
      return;
    }

    await createAssignmentNotifications({
      roleId,
      date: selectedDate,
      oldVolunteerId: null,
      newVolunteerId: currentVolunteerId,
    });

    setSavingRoleId(null);
  }

  const rows = useMemo(() => {
    return roles.map((role) => {
      const entry = entries.find((e) => e.role_id === role.id) ?? null;
      return { role, entry };
    });
  }, [roles, entries]);

  const groupedRows = useMemo(() => {
    return categoryOrder.map((category) => ({
      category,
      rows: rows.filter((row) => row.role.category === category),
    }));
  }, [rows]);

  const assignedCount = rows.filter((r) => r.entry?.volunteer_id).length;
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
                Manage assignments for the upcoming service.
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
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-800">
              {prettyDate(selectedDate)}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
              {assignedCount} of {totalCount} roles filled
            </span>
            {blackouts.length > 0 ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                {blackouts.length} blackout{blackouts.length === 1 ? "" : "s"}
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
            <p className="text-sm text-gray-600">Loading schedule...</p>
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">No active roles found.</p>
          </section>
        ) : (
          <div className="space-y-6">
            {groupedRows.map(({ category, rows: categoryRows }) => {
              if (categoryRows.length === 0) return null;

              const categoryAssignedCount = categoryRows.filter(
                (r) => r.entry?.volunteer_id
              ).length;

              return (
                <section
                  key={category}
                  className="rounded-2xl border bg-white p-6 shadow-sm"
                >
                  <div className="mb-4 border-b border-gray-100 pb-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {category}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {categoryAssignedCount} of {categoryRows.length} filled
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
                        {categoryRows.map(({ role, entry }) => {
                          const value = entry?.volunteer_id ?? "";
                          const isSaving = savingRoleId === role.id;
                          const assignedVolunteer = volunteers.find(
                            (v) => v.id === entry?.volunteer_id
                          );
                          const blackout = getBlackoutForVolunteer(
                            entry?.volunteer_id ?? null
                          );

                          return (
                            <tr key={role.id} className="rounded-2xl bg-gray-50">
                              <td className="rounded-l-2xl px-4 py-4 text-sm font-medium text-gray-900">
                                <div>{role.name}</div>
                                {role.lead_volunteer_id ? (
                                  <div className="mt-1 text-xs text-gray-500">
                                    Lead:{" "}
                                    {getVolunteerName(role.lead_volunteer_id) ??
                                      "Assigned"}
                                  </div>
                                ) : null}
                              </td>

                              <td className="px-4 py-4">
                                {!entry ? (
                                  <span className="text-sm text-gray-500">
                                    No schedule row
                                  </span>
                                ) : canManageSchedule ? (
                                  <div className="space-y-1">
                                    <select
                                      value={value}
                                      onChange={(e) =>
                                        updateAssignment(
                                          entry.id,
                                          role.id,
                                          e.target.value,
                                          entry.volunteer_id
                                        )
                                      }
                                      disabled={isSaving}
                                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                                    >
                                      <option value="">Open</option>
                                      {volunteers.map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.name}
                                        </option>
                                      ))}
                                    </select>

                                    {blackout ? (
                                      <div className="text-xs font-medium text-amber-700">
                                        ⚠ Unavailable
                                        {blackout.note
                                          ? `: ${blackout.note}`
                                          : ""}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : entry.volunteer_id === null ? (
                                  currentVolunteerId ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        claimRole(entry.id, role.id)
                                      }
                                      disabled={isSaving}
                                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
                                    >
                                      {isSaving ? "Claiming..." : "Claim"}
                                    </button>
                                  ) : (
                                    <span className="text-sm text-gray-500">
                                      Open
                                    </span>
                                  )
                                ) : (
                                  <div className="space-y-1">
                                    <span className="text-sm font-medium text-gray-800">
                                      {assignedVolunteer?.name ?? "Assigned"}
                                    </span>

                                    {blackout ? (
                                      <div className="text-xs font-medium text-amber-700">
                                        ⚠ Unavailable
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
                                      Assigned, unavailable
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
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
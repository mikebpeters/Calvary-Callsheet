"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type NotificationType = "assignment" | "removal";

type Role = {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  sort_order: number;
};

type RoleCategory = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

type Volunteer = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  active: boolean;
  email_on_assignment: boolean;
  email_on_removal: boolean;
  email_on_reminder: boolean;
};

type ScheduleEntry = {
  id: string;
  date: string;
  role_id: string;
  volunteer_id: string | null;
  status: string | null;
  published: boolean;
  template_id: string | null;
};

type VolunteerBlackout = {
  id: string;
  volunteer_id: string;
  date: string;
  note: string | null;
  is_hard: boolean;
};

type ServiceTemplate = {
  id: string;
  name: string;
  active: boolean;
};

type ServiceTemplateRole = {
  id: string;
  template_id: string;
  role_id: string;
  sort_order: number;
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

function shortDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);

  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function notifyTopNavToRefresh() {
  window.dispatchEvent(new Event("notifications-updated"));
}

export default function PlannerPage() {
  const supabase = useMemo(() => createClient(), []);

  const [startDate, setStartDate] = useState(toYmd(getNextSunday()));
  const [templateDate, setTemplateDate] = useState(toYmd(getNextSunday()));
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [roles, setRoles] = useState<Role[]>([]);
  const [roleCategories, setRoleCategories] = useState<RoleCategory[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [blackouts, setBlackouts] = useState<VolunteerBlackout[]>([]);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templateRoles, setTemplateRoles] = useState<ServiceTemplateRole[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [publishingDate, setPublishingDate] = useState<string | null>(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const plannerDates = useMemo(() => {
    const first = new Date(`${startDate}T12:00:00`);

    return [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77].map((days) =>
      toYmd(addDays(first, days))
    );
  }, [startDate]);

  useEffect(() => {
    loadPlannerData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  async function loadPlannerData() {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const { data: categoriesData, error: categoriesError } = await supabase
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

      setRoleCategories((categoriesData ?? []) as RoleCategory[]);

      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("id, name, active, category_id, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (rolesError) {
        throw new Error(`Roles query failed: ${rolesError.message}`);
      }

      const activeRoles: Role[] = (rolesData ?? []).map((role) => ({
        id: role.id,
        name: role.name,
        active: role.active,
        category_id: role.category_id ?? null,
        sort_order: role.sort_order ?? 999,
      }));

      setRoles(activeRoles);

      const { data: volunteersData, error: volunteersError } = await supabase
        .from("volunteers")
        .select(
          "id, user_id, name, email, active, email_on_assignment, email_on_removal, email_on_reminder"
        )
        .eq("active", true)
        .order("name", { ascending: true });

      if (volunteersError) {
        throw new Error(
          `Volunteers query failed: ${volunteersError.message}`
        );
      }

      setVolunteers((volunteersData ?? []) as Volunteer[]);

      const { data: templatesData, error: templatesError } = await supabase
        .from("service_templates")
        .select("id, name, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (templatesError) {
        throw new Error(`Templates query failed: ${templatesError.message}`);
      }

      const loadedTemplates = (templatesData ?? []) as ServiceTemplate[];

      setTemplates(loadedTemplates);

      if (!selectedTemplateId && loadedTemplates.length > 0) {
        setSelectedTemplateId(loadedTemplates[0].id);
      }

      const { data: templateRolesData, error: templateRolesError } =
        await supabase
          .from("service_template_roles")
          .select("id, template_id, role_id, sort_order")
          .order("sort_order", { ascending: true });

      if (templateRolesError) {
        throw new Error(
          `Template roles query failed: ${templateRolesError.message}`
        );
      }

      setTemplateRoles((templateRolesData ?? []) as ServiceTemplateRole[]);

      const { data: entriesData, error: entriesError } = await supabase
        .from("schedule_entries")
        .select(
          "id, date, role_id, volunteer_id, status, published, template_id"
        )
        .in("date", plannerDates);

      if (entriesError) {
        throw new Error(`Schedule query failed: ${entriesError.message}`);
      }

      setEntries((entriesData ?? []) as ScheduleEntry[]);

      const { data: blackoutData, error: blackoutError } = await supabase
        .from("volunteer_blackouts")
        .select("id, volunteer_id, date, note, is_hard")
        .in("date", plannerDates);

      if (blackoutError) {
        throw new Error(`Blackout query failed: ${blackoutError.message}`);
      }

      const safeBlackouts: VolunteerBlackout[] = (blackoutData ?? []).map(
        (blackout) => ({
          id: blackout.id,
          volunteer_id: blackout.volunteer_id,
          date: blackout.date,
          note: blackout.note,
          is_hard: blackout.is_hard ?? false,
        })
      );

      setBlackouts(safeBlackouts);
    } catch (err) {
      console.error("Planner load error:", err);

      setError(err instanceof Error ? err.message : "Planner load failed.");

      setRoles([]);
      setRoleCategories([]);
      setVolunteers([]);
      setEntries([]);
      setBlackouts([]);
      setTemplates([]);
      setTemplateRoles([]);
    } finally {
      setLoading(false);
    }
  }

  function findEntry(roleId: string, date: string) {
    return (
      entries.find(
        (entry) => entry.role_id === roleId && entry.date === date
      ) ?? null
    );
  }

  function findBlackout(volunteerId: string | null, date: string) {
    if (!volunteerId) return null;

    return (
      blackouts.find(
        (blackout) =>
          blackout.volunteer_id === volunteerId && blackout.date === date
      ) ?? null
    );
  }

  function getVolunteerName(volunteerId: string) {
    return volunteers.find((volunteer) => volunteer.id === volunteerId)?.name;
  }

  function getVolunteerById(volunteerId: string | null) {
    if (!volunteerId) return null;

    return (
      volunteers.find((volunteer) => volunteer.id === volunteerId) ?? null
    );
  }

  function getRoleName(roleId: string) {
    return roles.find((role) => role.id === roleId)?.name ?? "a role";
  }

  function getDateEntries(date: string) {
    return entries.filter((entry) => entry.date === date);
  }

  function getDatePublishState(date: string) {
    const dateEntries = getDateEntries(date);

    if (dateEntries.length === 0) {
      return {
        total: 0,
        published: 0,
        assigned: 0,
        isPublished: false,
      };
    }

    const published = dateEntries.filter((entry) => entry.published).length;
    const assigned = dateEntries.filter((entry) => entry.volunteer_id).length;

    return {
      total: dateEntries.length,
      published,
      assigned,
      isPublished: published === dateEntries.length,
    };
  }

  async function sendEmail({
    to,
    subject,
    text,
  }: {
    to: string;
    subject: string;
    text: string;
  }) {
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          subject,
          text,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        console.error("Email send failed:", result);
      }
    } catch (err) {
      console.error("Email send failed:", err);
    }
  }

  async function insertNotification({
    volunteer,
    roleId,
    date,
    type,
  }: {
    volunteer: Volunteer;
    roleId: string;
    date: string;
    type: NotificationType;
  }) {
    const roleName = getRoleName(roleId);
    const serviceDate = shortDate(date);

    const title =
      type === "assignment"
        ? "You have been scheduled"
        : "You have been removed from a schedule";

    const body =
      type === "assignment"
        ? `You are scheduled for ${roleName} on ${serviceDate}.`
        : `You are no longer scheduled for ${roleName} on ${serviceDate}.`;

    if (volunteer.user_id) {
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          user_id: volunteer.user_id,
          title,
          body,
          href: "/my-schedule",
          read_at: null,
          type,
        });

      if (notificationError) {
        console.error("Notification insert failed:", notificationError);

        throw new Error(
          `Notification failed: ${notificationError.message}`
        );
      }
    }

    const shouldEmail =
      type === "assignment"
        ? volunteer.email_on_assignment
        : volunteer.email_on_removal;

    if (volunteer.email && shouldEmail) {
      await sendEmail({
        to: volunteer.email,
        subject: title,
        text: body,
      });
    }
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
    const isNewAssignment =
      !oldVolunteerId && Boolean(newVolunteerId);

    const isRemoval =
      Boolean(oldVolunteerId) && !newVolunteerId;

    const isChange =
      Boolean(oldVolunteerId) &&
      Boolean(newVolunteerId) &&
      oldVolunteerId !== newVolunteerId;

    if (!isNewAssignment && !isRemoval && !isChange) {
      return;
    }

    const oldVolunteer = getVolunteerById(oldVolunteerId);
    const newVolunteer = getVolunteerById(newVolunteerId);

    if ((isRemoval || isChange) && oldVolunteer) {
      await insertNotification({
        volunteer: oldVolunteer,
        roleId,
        date,
        type: "removal",
      });
    }

    if ((isNewAssignment || isChange) && newVolunteer) {
      await insertNotification({
        volunteer: newVolunteer,
        roleId,
        date,
        type: "assignment",
      });
    }

    notifyTopNavToRefresh();
  }

  async function sendPublishNotifications(date: string) {
    const dateEntries = getDateEntries(date).filter(
      (entry) => entry.volunteer_id
    );

    for (const entry of dateEntries) {
      const volunteer = getVolunteerById(entry.volunteer_id);

      if (!volunteer) continue;

      await insertNotification({
        volunteer,
        roleId: entry.role_id,
        date,
        type: "assignment",
      });
    }

    if (dateEntries.length > 0) {
      notifyTopNavToRefresh();
    }
  }

  async function createScheduleFromTemplate() {
    if (!selectedTemplateId) {
      setError("Please select a service template.");
      return;
    }

    if (!templateDate) {
      setError("Please select a service date.");
      return;
    }

    setCreatingFromTemplate(true);
    setError("");
    setSuccessMessage("");

    try {
      const roleIdsForTemplate = templateRoles
        .filter((item) => item.template_id === selectedTemplateId)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => item.role_id);

      if (roleIdsForTemplate.length === 0) {
        throw new Error(
          "This template does not have any roles yet. Open Manage Templates and add roles first."
        );
      }

      const { data: existingData, error: existingError } = await supabase
        .from("schedule_entries")
        .select("id, date, role_id, volunteer_id, status, published")
        .eq("date", templateDate)
        .in("role_id", roleIdsForTemplate);

      if (existingError) {
        throw new Error(
          `Could not check existing schedule: ${existingError.message}`
        );
      }

      const existingRoleIds = new Set(
        (existingData ?? []).map((entry) => entry.role_id)
      );

      const rowsToInsert = roleIdsForTemplate
        .filter((roleId) => !existingRoleIds.has(roleId))
        .map((roleId) => ({
          date: templateDate,
          role_id: roleId,
          volunteer_id: null,
          status: null,
          published: false,
          template_id: selectedTemplateId,
        }));

      if (rowsToInsert.length === 0) {
        setSuccessMessage(
          `No new rows needed. ${shortDate(
            templateDate
          )} already has all roles from this template.`
        );

        return;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("schedule_entries")
        .insert(rowsToInsert)
        .select(
          "id, date, role_id, volunteer_id, status, published, template_id"
        );

      if (insertError) {
        throw new Error(
          `Could not create schedule rows: ${insertError.message}`
        );
      }

      const insertedRows = (insertedData ?? []) as ScheduleEntry[];

      if (plannerDates.includes(templateDate)) {
        setEntries((current) => [...current, ...insertedRows]);
      }

      setSuccessMessage(
        `Created ${insertedRows.length} draft schedule row${
          insertedRows.length === 1 ? "" : "s"
        } for ${shortDate(templateDate)}.`
      );
    } catch (err) {
      console.error("Create schedule from template error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not create schedule from template."
      );
    } finally {
      setCreatingFromTemplate(false);
    }
  }

  async function togglePublishedForDate(
    date: string,
    nextPublished: boolean
  ) {
    const dateEntries = getDateEntries(date);

    if (dateEntries.length === 0) {
      setError("There are no schedule rows for this date yet.");
      return;
    }

    setPublishingDate(date);
    setError("");
    setSuccessMessage("");

    const previousEntries = [...entries];

    try {
      const { error: updateError } = await supabase
        .from("schedule_entries")
        .update({
          published: nextPublished,
        })
        .eq("date", date);

      if (updateError) {
        throw new Error(
          `Could not ${
            nextPublished ? "publish" : "unpublish"
          } ${shortDate(date)}: ${updateError.message}`
        );
      }

      setEntries((current) =>
        current.map((entry) =>
          entry.date === date
            ? {
                ...entry,
                published: nextPublished,
              }
            : entry
        )
      );

      if (nextPublished) {
        try {
          await sendPublishNotifications(date);

          setSuccessMessage(
            `${shortDate(
              date
            )} published. Assigned volunteers have been notified.`
          );
        } catch (notificationErr) {
          console.error(
            "Publish notification error:",
            notificationErr
          );

          setError(
            notificationErr instanceof Error
              ? `Schedule published, but one or more notifications failed: ${notificationErr.message}`
              : "Schedule published, but one or more notifications failed."
          );

          setSuccessMessage(
            `${shortDate(
              date
            )} was published, but check the notification error above.`
          );
        }
      } else {
        setSuccessMessage(
          `${shortDate(
            date
          )} returned to draft. No cancellation notifications were sent.`
        );
      }
    } catch (err) {
      console.error("Publish error:", err);

      setEntries(previousEntries);

      setError(
        err instanceof Error
          ? err.message
          : `Could not ${
              nextPublished ? "publish" : "unpublish"
            } this schedule.`
      );
    } finally {
      setPublishingDate(null);
    }
  }

  async function updatePlannerAssignment(
    entry: ScheduleEntry,
    roleId: string,
    date: string,
    volunteerId: string
  ) {
    const normalizedVolunteerId =
      volunteerId === "" ? null : volunteerId;

    const previousVolunteerId = entry.volunteer_id;

    if (previousVolunteerId === normalizedVolunteerId) {
      return;
    }

    const blackout = findBlackout(normalizedVolunteerId, date);

    if (blackout && normalizedVolunteerId) {
      const volunteerName =
        getVolunteerName(normalizedVolunteerId) ?? "This volunteer";

      if (blackout.is_hard) {
        setError(
          `${volunteerName} is marked unavailable for ${shortDate(
            date
          )} and cannot be scheduled.`
        );

        return;
      }

      const note = blackout.note
        ? `\n\nNote: ${blackout.note}`
        : "";

      const shouldContinue = window.confirm(
        `${volunteerName} is marked unavailable for ${shortDate(
          date
        )}.${note}\n\nAssign anyway?`
      );

      if (!shouldContinue) {
        return;
      }
    }

    const cellKey = `${roleId}-${date}`;
    const previousEntries = [...entries];

    const dateWasPublished = getDatePublishState(date).isPublished;

    setSavingCell(cellKey);
    setError("");
    setSuccessMessage("");

    setEntries((current) =>
      current.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              volunteer_id: normalizedVolunteerId,
              status: normalizedVolunteerId ? "assigned" : null,
            }
          : item
      )
    );

    try {
      const { error: updateError } = await supabase
        .from("schedule_entries")
        .update({
          volunteer_id: normalizedVolunteerId,
          status: normalizedVolunteerId ? "assigned" : null,
        })
        .eq("id", entry.id);

      if (updateError) {
        throw new Error(
          `Could not save assignment: ${updateError.message}`
        );
      }

      if (dateWasPublished) {
        try {
          await createAssignmentNotifications({
            roleId,
            date,
            oldVolunteerId: previousVolunteerId,
            newVolunteerId: normalizedVolunteerId,
          });

          const oldVolunteer =
            getVolunteerById(previousVolunteerId);

          const newVolunteer =
            getVolunteerById(normalizedVolunteerId);

          if (previousVolunteerId && normalizedVolunteerId) {
            setSuccessMessage(
              `${getRoleName(roleId)} on ${shortDate(
                date
              )} changed from ${
                oldVolunteer?.name ?? "the previous volunteer"
              } to ${
                newVolunteer?.name ?? "the new volunteer"
              }. Affected volunteers have been notified.`
            );
          } else if (normalizedVolunteerId) {
            setSuccessMessage(
              `${newVolunteer?.name ?? "Volunteer"} was added to ${getRoleName(
                roleId
              )} on ${shortDate(
                date
              )} and has been notified.`
            );
          } else if (previousVolunteerId) {
            setSuccessMessage(
              `${oldVolunteer?.name ?? "Volunteer"} was removed from ${getRoleName(
                roleId
              )} on ${shortDate(
                date
              )} and has been notified.`
            );
          }
        } catch (notificationErr) {
          console.error(
            "Assignment notification error:",
            notificationErr
          );

          setError(
            notificationErr instanceof Error
              ? `Assignment saved, but notification failed: ${notificationErr.message}`
              : "Assignment saved, but notification failed."
          );
        }
      } else {
        setSuccessMessage(
          `Draft assignment updated for ${shortDate(
            date
          )}. No notifications were sent.`
        );
      }
    } catch (err) {
      console.error("Assignment save error:", err);

      setEntries(previousEntries);

      setError(
        err instanceof Error
          ? err.message
          : "Could not save assignment."
      );
    } finally {
      setSavingCell(null);
    }
  }

  const visibleRoleIds = useMemo(() => {
    const ids = new Set<string>();

    entries.forEach((entry) => {
      if (plannerDates.includes(entry.date)) {
        ids.add(entry.role_id);
      }
    });

    return ids;
  }, [entries, plannerDates]);

  const visibleRoles = useMemo(() => {
    return roles.filter((role) => visibleRoleIds.has(role.id));
  }, [roles, visibleRoleIds]);

  const groupedRoles = useMemo(() => {
    const groups = roleCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        sort_order: category.sort_order,
        roles: visibleRoles
          .filter((role) => role.category_id === category.id)
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order ||
              a.name.localeCompare(b.name)
          ),
      }))
      .filter((group) => group.roles.length > 0);

    const uncategorizedRoles = visibleRoles
      .filter((role) => !role.category_id)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.name.localeCompare(b.name)
      );

    if (uncategorizedRoles.length > 0) {
      groups.push({
        id: "uncategorized",
        name: "Other",
        sort_order: 999,
        roles: uncategorizedRoles,
      });
    }

    return groups.sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name)
    );
  }, [roleCategories, visibleRoles]);

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  const selectedTemplateRoleCount = templateRoles.filter(
    (item) => item.template_id === selectedTemplateId
  ).length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Planner
              </h1>

              <p className="mt-1 text-sm text-gray-600">
                Create draft schedules from templates, assign volunteers, then
                publish a Sunday when it is ready.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                Starting Sunday
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
              />
            </div>
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Start with a Template
              </h2>

              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Use a service template to create the structure for a Sunday
                before assigning volunteers. New rows are created as drafts.
              </p>

              <div className="mt-3">
                <Link
                  href="/service-templates"
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Manage templates →
                </Link>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">No service templates yet.</p>

                <p className="mt-1">
                  Create a template first, then return here to start a schedule
                  from it.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[180px_240px_auto]">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    Service Date
                  </label>

                  <input
                    type="date"
                    value={templateDate}
                    onChange={(e) => setTemplateDate(e.target.value)}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    Template
                  </label>

                  <select
                    value={selectedTemplateId}
                    onChange={(e) =>
                      setSelectedTemplateId(e.target.value)
                    }
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="">Select template</option>

                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={createScheduleFromTemplate}
                    disabled={
                      creatingFromTemplate ||
                      !selectedTemplateId ||
                      !templateDate
                    }
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingFromTemplate
                      ? "Creating..."
                      : "Create Schedule"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedTemplate ? (
            <p className="mt-4 text-sm text-gray-600">
              Selected template:{" "}
              <span className="font-medium text-gray-900">
                {selectedTemplate.name}
              </span>{" "}
              ({selectedTemplateRoleCount} role
              {selectedTemplateRoleCount === 1 ? "" : "s"})
            </p>
          ) : null}
        </section>

        {!loading && visibleRoles.length > 0 ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Publish Sundays
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Draft schedules can be edited without notifying volunteers.
              Publishing makes the schedule visible and sends assignment
              notifications. Changes made after publication notify only the
              affected volunteers.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {plannerDates.map((date) => {
                const state = getDatePublishState(date);
                const isSaving = publishingDate === date;

                if (state.total === 0) {
                  return null;
                }

                return (
                  <div
                    key={date}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {shortDate(date)}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                          {state.assigned} of {state.total} assigned
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          state.isPublished
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {state.isPublished ? "Published" : "Draft"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        togglePublishedForDate(date, !state.isPublished)
                      }
                      disabled={isSaving}
                      className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving
                        ? "Saving..."
                        : state.isPublished
                        ? "Unpublish"
                        : "Publish"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">Loading planner...</p>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Scroll sideways to view all 12 weeks
            </div>

            {visibleRoles.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  No schedule rows yet
                </h2>

                <p className="mt-2 text-sm text-gray-600">
                  Use Start with a Template above to add roles for a service
                  date.
                </p>
              </div>
            ) : (
              <div className="max-w-full overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-[2400px] border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 border-b border-r bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Role
                      </th>

                      {plannerDates.map((date) => {
                        const state = getDatePublishState(date);

                        return (
                          <th
                            key={date}
                            className="border-b border-r bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            <div className="space-y-1">
                              <div>{shortDate(date)}</div>

                              {state.total > 0 ? (
                                <div
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    state.isPublished
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {state.isPublished
                                    ? "Published"
                                    : "Draft"}
                                </div>
                              ) : null}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {groupedRoles.map((group) => (
                      <React.Fragment key={group.id}>
                        <tr>
                          <td
                            colSpan={plannerDates.length + 1}
                            className="bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-900"
                          >
                            {group.name}
                          </td>
                        </tr>

                        {group.roles.map((role) => (
                          <tr key={role.id} className="border-b">
                            <td className="sticky left-0 z-10 border-r bg-white px-4 py-3 text-sm font-medium text-gray-900">
                              {role.name}
                            </td>

                            {plannerDates.map((date) => {
                              const entry = findEntry(role.id, date);

                              const value = entry?.volunteer_id ?? "";

                              const blackout = findBlackout(
                                value || null,
                                date
                              );

                              const cellKey = `${role.id}-${date}`;

                              const isSaving = savingCell === cellKey;

                              return (
                                <td
                                  key={cellKey}
                                  className="border-r px-4 py-3 align-top"
                                >
                                  {entry ? (
                                    <div className="min-w-44 space-y-1">
                                      <select
                                        value={value}
                                        onChange={(e) =>
                                          updatePlannerAssignment(
                                            entry,
                                            role.id,
                                            date,
                                            e.target.value
                                          )
                                        }
                                        disabled={isSaving}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm shadow-sm"
                                      >
                                        <option value="">Open</option>

                                        {volunteers.map((volunteer) => (
                                          <option
                                            key={volunteer.id}
                                            value={volunteer.id}
                                          >
                                            {volunteer.name}
                                          </option>
                                        ))}
                                      </select>

                                      {isSaving ? (
                                        <div className="text-xs text-gray-500">
                                          Saving...
                                        </div>
                                      ) : blackout ? (
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
                                  ) : (
                                    <span className="text-sm text-gray-500">
                                      No row
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

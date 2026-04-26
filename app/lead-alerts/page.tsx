"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  date: string;
  notification_type: string;
  old_volunteer_id: string | null;
  new_volunteer_id: string | null;
  read_at: string | null;
  created_at: string;
  roles: { name: string } | null;
};

type Volunteer = {
  id: string;
  name: string;
};

function prettyDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function LeadAlertsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [currentVolunteerId, setCurrentVolunteerId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function volunteerName(id: string | null) {
    if (!id) return "Open";
    return volunteers.find((v) => v.id === id)?.name ?? "Unknown volunteer";
  }

  async function loadAlerts() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw new Error(userError.message);
      if (!user) throw new Error("Not signed in.");

      const { data: volunteer, error: volunteerError } = await supabase
        .from("volunteers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (volunteerError) throw new Error(volunteerError.message);

      const volunteerId = volunteer?.id ?? null;
      setCurrentVolunteerId(volunteerId);

      if (!volunteerId) {
        setNotifications([]);
        return;
      }

      const { data: volunteersData, error: volunteersError } = await supabase
        .from("volunteers")
        .select("id, name")
        .order("name", { ascending: true });

      if (volunteersError) throw new Error(volunteersError.message);

      setVolunteers(volunteersData ?? []);

      const { data: alertsData, error: alertsError } = await supabase
        .from("schedule_notifications")
        .select(
          `
          id,
          date,
          notification_type,
          old_volunteer_id,
          new_volunteer_id,
          read_at,
          created_at,
          roles (
            name
          )
        `
        )
        .eq("lead_volunteer_id", volunteerId)
        .order("created_at", { ascending: false });

      if (alertsError) throw new Error(alertsError.message);

      setNotifications((alertsData as Notification[]) ?? []);
    } catch (err) {
      console.error("Lead alerts load error:", err);
      setError(err instanceof Error ? err.message : "Could not load alerts.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    setError("");

    const { error } = await supabase
      .from("schedule_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadAlerts();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Lead Alerts</h1>
          <p className="mt-1 text-sm text-gray-600">
            See when roles you lead are filled, emptied, or changed.
          </p>

          {currentVolunteerId ? (
            <p className="mt-3 text-xs text-gray-500">
              Showing alerts for your assigned activity lead roles.
            </p>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-gray-600">Loading alerts...</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-gray-500">No alerts yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const isUnread = !notification.read_at;
                const roleName = notification.roles?.name ?? "Role";

                return (
                  <div
                    key={notification.id}
                    className={`rounded-xl border px-4 py-4 ${
                      isUnread ? "bg-amber-50" : "bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {roleName} • {prettyDate(notification.date)}
                        </div>

                        <div className="mt-1 text-sm text-gray-700">
                          {notification.notification_type === "filled" && (
                            <>
                              Filled by{" "}
                              <span className="font-medium">
                                {volunteerName(notification.new_volunteer_id)}
                              </span>
                            </>
                          )}

                          {notification.notification_type === "unfilled" && (
                            <>
                              Emptied from{" "}
                              <span className="font-medium">
                                {volunteerName(notification.old_volunteer_id)}
                              </span>
                            </>
                          )}

                          {notification.notification_type === "updated" && (
                            <>
                              Changed from{" "}
                              <span className="font-medium">
                                {volunteerName(notification.old_volunteer_id)}
                              </span>{" "}
                              to{" "}
                              <span className="font-medium">
                                {volunteerName(notification.new_volunteer_id)}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          {isUnread ? "Unread" : "Read"}
                        </div>
                      </div>

                      {isUnread ? (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification.id)}
                          className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
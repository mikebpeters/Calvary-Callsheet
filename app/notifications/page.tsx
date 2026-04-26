"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type NotificationType = "assignment" | "removal" | "reminder" | "publish";

type Notification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
  type: NotificationType;
};

function prettyDate(dateString: string) {
  const date = new Date(dateString);

  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeLabel(type: NotificationType) {
  if (type === "assignment") return "Scheduled";
  if (type === "removal") return "Removed";
  if (type === "reminder") return "Reminder";
  if (type === "publish") return "Published";
  return "Notice";
}

function typeClass(type: NotificationType) {
  if (type === "assignment") return "bg-blue-50 text-blue-700";
  if (type === "removal") return "bg-red-50 text-red-700";
  if (type === "reminder") return "bg-purple-50 text-purple-700";
  return "bg-stone-200 text-stone-700";
}

function notifyTopNavToRefresh() {
  window.dispatchEvent(new Event("notifications-updated"));
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadNotifications = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError("");

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
          setCurrentUserId(null);
          setNotifications([]);
          return;
        }

        setIsSignedIn(true);
        setCurrentUserId(user.id);

        const { data: unreadData, error: unreadError } = await supabase
          .from("notifications")
          .select("id, title, body, href, read_at, created_at, type")
          .eq("user_id", user.id)
          .is("read_at", null)
          .order("created_at", { ascending: false });

        if (unreadError) {
          throw new Error(
            `Could not load unread notifications: ${unreadError.message}`
          );
        }

        const { data: readData, error: readError } = await supabase
          .from("notifications")
          .select("id, title, body, href, read_at, created_at, type")
          .eq("user_id", user.id)
          .not("read_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(10);

        if (readError) {
          throw new Error(
            `Could not load read notifications: ${readError.message}`
          );
        }

        setNotifications([
          ...((unreadData ?? []) as Notification[]),
          ...((readData ?? []) as Notification[]),
        ]);
      } catch (err) {
        console.error("Notifications load error:", err);
        setError(
          err instanceof Error ? err.message : "Unknown notifications error."
        );
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`notifications-page-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          loadNotifications(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, loadNotifications]);

  async function markRead(notificationId: string) {
    const target = notifications.find((item) => item.id === notificationId);

    if (!target || target.read_at) return;

    setSavingId(notificationId);
    setError("");

    const previousNotifications = [...notifications];
    const now = new Date().toISOString();

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, read_at: now } : item
      )
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("id", notificationId);

    if (updateError) {
      setNotifications(previousNotifications);
      setError(`Could not mark notification read: ${updateError.message}`);
      setSavingId(null);
      return;
    }

    setSavingId(null);
    notifyTopNavToRefresh();
  }

  async function openNotification(notification: Notification) {
    if (!notification.href) return;

    if (!notification.read_at) {
      await markRead(notification.id);
    }

    router.push(notification.href);
  }

  async function markAllRead() {
    const unread = notifications.filter((item) => !item.read_at);

    if (unread.length === 0) return;

    setSavingId("all");
    setError("");

    const previousNotifications = [...notifications];
    const now = new Date().toISOString();

    setNotifications((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? now }))
    );

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", currentUserId)
      .is("read_at", null);

    if (updateError) {
      setNotifications(previousNotifications);
      setError(`Could not mark all notifications read: ${updateError.message}`);
      setSavingId(null);
      return;
    }

    setSavingId(null);
    notifyTopNavToRefresh();
  }

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Notifications
          </h1>
          <p className="mt-2 text-sm text-gray-600">Loading notifications...</p>
        </section>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Notifications
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You need to sign in to view notifications.
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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Notifications
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Showing all unread notifications plus the 10 most recent read
                notifications.
              </p>
            </div>

            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={savingId === "all"}
                className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingId === "all" ? "Saving..." : "Mark all read"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        {notifications.length === 0 ? (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              No notifications yet
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              When schedules are updated, notifications will appear here.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="space-y-4">
              {notifications.map((notification) => {
                const isUnread = !notification.read_at;
                const isSaving = savingId === notification.id;

                return (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border p-5 ${
                      isUnread
                        ? "border-amber-200 bg-amber-50"
                        : "border-stone-200 bg-stone-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-gray-900">
                            {notification.title}
                          </h2>

                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${typeClass(
                              notification.type
                            )}`}
                          >
                            {typeLabel(notification.type)}
                          </span>

                          {isUnread ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                              Unread
                            </span>
                          ) : (
                            <span className="rounded-full bg-stone-200 px-2 py-1 text-xs font-medium text-stone-700">
                              Read
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-gray-700">
                          {notification.body}
                        </p>

                        <p className="mt-3 text-xs text-gray-500">
                          {prettyDate(notification.created_at)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {notification.href ? (
                          <button
                            type="button"
                            onClick={() => openNotification(notification)}
                            disabled={isSaving}
                            className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Open
                          </button>
                        ) : null}

                        {isUnread ? (
                          <button
                            type="button"
                            onClick={() => markRead(notification.id)}
                            disabled={isSaving}
                            className="inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? "Saving..." : "Mark read"}
                          </button>
                        ) : null}
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
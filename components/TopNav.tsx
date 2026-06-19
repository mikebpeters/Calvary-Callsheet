"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";

type Profile = {
  full_name: string | null;
  role: AppRole | null;
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

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadUnreadCount(userId: string) {
      try {
        const unreadRes = await withTimeout(
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .is("read_at", null),
          "TopNav unread notifications query"
        );

        if (!isMounted) return;

        if (unreadRes.error) {
          console.error("TopNav unread count failed:", unreadRes.error);
          setUnreadCount(0);
          return;
        }

        setUnreadCount(unreadRes.count ?? 0);
      } catch (error) {
        console.error("TopNav unread count failed:", error);
        if (!isMounted) return;
        setUnreadCount(0);
      }
    }

    async function refreshUnreadCount() {
      try {
        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          "TopNav unread refresh session check"
        );

        if (!isMounted) return;

        const user = sessionRes.data.session?.user;

        if (!user) {
          setUnreadCount(0);
          return;
        }

        await loadUnreadCount(user.id);
      } catch (error) {
        console.error("TopNav unread refresh failed:", error);
        if (!isMounted) return;
        setUnreadCount(0);
      }
    }

    async function loadProfileForUser(userId: string, email: string | null) {
      if (!isMounted) return;

      setCurrentUserId(userId);
      setUserEmail(email);
      setLoading(true);

      try {
        const profileRes = await withTimeout(
          supabase
            .from("profiles")
            .select("full_name, role")
            .eq("id", userId)
            .maybeSingle(),
          "TopNav profile query"
        );

        if (!isMounted) return;

        if (profileRes.error) {
          console.error("TopNav profile load failed:", profileRes.error);
          setProfile(null);
          setRole(null);
          setUnreadCount(0);
          return;
        }

        const loadedProfile = (profileRes.data as Profile | null) ?? null;

        setProfile(loadedProfile);
        setRole(loadedProfile?.role ?? null);

        await loadUnreadCount(userId);
      } catch (error) {
        console.error("TopNav profile load failed:", error);
        if (!isMounted) return;
        setProfile(null);
        setRole(null);
        setUnreadCount(0);
      } finally {
        if (isMounted) {
          setLoading(false);
          setSigningOut(false);
        }
      }
    }

    async function loadInitialState() {
      setLoading(true);

      try {
        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          "TopNav session check"
        );

        if (!isMounted) return;

        const user = sessionRes.data.session?.user;

        if (!user) {
          setProfile(null);
          setRole(null);
          setUserEmail(null);
          setCurrentUserId(null);
          setUnreadCount(0);
          setLoading(false);
          setSigningOut(false);
          return;
        }

        await loadProfileForUser(user.id, user.email ?? null);
      } catch (error) {
        console.error("TopNav session load failed:", error);
        if (!isMounted) return;
        setProfile(null);
        setRole(null);
        setUserEmail(null);
        setCurrentUserId(null);
        setUnreadCount(0);
        setLoading(false);
        setSigningOut(false);
      }
    }

    function handleNotificationsUpdated() {
      refreshUnreadCount();
    }

    loadInitialState();

    window.addEventListener("notifications-updated", handleNotificationsUpdated);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      const user = session?.user;

      if (!user) {
        setProfile(null);
        setRole(null);
        setUserEmail(null);
        setCurrentUserId(null);
        setUnreadCount(0);
        setLoading(false);
        setSigningOut(false);
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email ?? null);

      setTimeout(() => {
        loadProfileForUser(user.id, user.email ?? null);
      }, 0);
    });

    return () => {
      isMounted = false;
      window.removeEventListener(
        "notifications-updated",
        handleNotificationsUpdated
      );
      subscription.unsubscribe();
    };
  }, [supabase, pathname]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`topnav-notifications-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        async () => {
          const unreadRes = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", currentUserId)
            .is("read_at", null);

          if (unreadRes.error) {
            console.error("TopNav realtime unread count failed:", unreadRes.error);
            return;
          }

          setUnreadCount(unreadRes.count ?? 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId]);

  function navClass(path: string) {
    const isActive = pathname === path;

    return `rounded-lg px-4 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-emerald-600 text-white"
        : "text-stone-700 hover:bg-stone-100"
    }`;
  }

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await withTimeout(supabase.auth.signOut(), "Sign out");
      setProfile(null);
      setRole(null);
      setUserEmail(null);
      setCurrentUserId(null);
      setUnreadCount(0);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Sign out failed:", error);
      setSigningOut(false);
    }
  }

  const displayName = profile?.full_name ?? userEmail ?? null;
  const isSignedIn = !!userEmail;
  const canManageSchedule = role === "ministry_leader" || role === "admin";

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <Link href="/" className="flex items-center gap-4">
            <div className="relative h-14 w-56 shrink-0">
              <Image
                src="/calvary-baptist-gibsons.png"
                alt="Calvary Baptist Gibsons"
                fill
                sizes="224px"
                className="object-contain"
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="text-lg font-semibold text-stone-900">
                Calvary Call Sheet
              </div>
              <div className="text-sm text-stone-500">
                Calvary Baptist Gibsons
              </div>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <Link href="/" className={navClass("/")}>
              Home
            </Link>

            {isSignedIn && (
              <>
                <Link href="/my-schedule" className={navClass("/my-schedule")}>
                  My Schedule
                </Link>

                <Link href="/my-blackouts" className={navClass("/my-blackouts")}>
                  My Availability
                </Link>

                <Link href="/notifications" className={navClass("/notifications")}>
                  <span className="inline-flex items-center gap-2">
                    Notifications
                    {unreadCount > 0 ? (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                        {unreadCount}
                      </span>
                    ) : null}
                  </span>
                </Link>

                <Link
                  href="/my-notification-settings"
                  className={navClass("/my-notification-settings")}
                >
                  Notification Settings
                </Link>

                <Link
                  href="/request-lead-access"
                  className={navClass("/request-lead-access")}
                >
                  Request Lead Access
                </Link>
              </>
            )}

            {canManageSchedule && (
              <>
                <Link href="/schedule" className={navClass("/schedule")}>
                  Schedule
                </Link>

                <Link href="/planner" className={navClass("/planner")}>
                  Planner
                </Link>

                <Link
                  href="/service-templates"
                  className={navClass("/service-templates")}
                >
                  Templates
                </Link>

                <Link href="/lead-alerts" className={navClass("/lead-alerts")}>
                  Alerts
                </Link>
              </>
            )}

            {role === "admin" && (
              <>
                <Link
                  href="/admin/lead-requests"
                  className={navClass("/admin/lead-requests")}
                >
                  Lead Requests
                </Link>

                <Link href="/volunteers" className={navClass("/volunteers")}>
                  Volunteers
                </Link>

                <Link href="/roles" className={navClass("/roles")}>
                  Roles
                </Link>

                <Link href="/assignments" className={navClass("/assignments")}>
                  Assignments
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-stone-600">
            {loading ? "Loading..." : displayName ?? "Signed out"}
          </div>

          {isSignedIn && (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Log out"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
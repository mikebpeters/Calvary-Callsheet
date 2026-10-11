"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";
type Role = { id: string; name: string; active: boolean };
type Volunteer = { id: string; name: string; public_name: string | null };
type CurrentVolunteer = Volunteer & { user_id: string | null; email: string | null; active: boolean };
type VolunteerRole = { volunteer_id: string; role_id: string };
type ScheduleEntry = { id: string; date: string; role_id: string; volunteer_id: string | null; status: string | null; published: boolean; template_id: string | null };
type ServiceTemplate = { id: string; name: string };
type Blackout = { id: string; volunteer_id: string; date: string; note: string | null; is_hard: boolean };
type DashboardItem = { title: string; description: string; href: string; buttonText: string };
type DisplayGroup = { label: string; icon: string; roleNames: string[] };
type ServiceGroup = { key: string; templateId: string | null; templateName: string; entries: ScheduleEntry[] };
type DisplayPosition = { roleName: string; role: Role | null; entry: ScheduleEntry | null; assignedName: string | null };

function withTimeout<T>(promise: PromiseLike<T>, label: string, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}
function addDays(input: Date, days: number) { const date = new Date(input); date.setDate(date.getDate() + days); return date; }
function toYmd(date: Date) { return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`; }
function fromYmd(ymd: string) { const [year, month, day] = ymd.split("-").map(Number); return new Date(year, month - 1, day); }
function getNextSunday() { const today = new Date(); today.setHours(0, 0, 0, 0); return addDays(today, (7 - today.getDay()) % 7); }
function prettyDate(date: Date) { return date.toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", year: "numeric" }); }
function prettyUserRole(role: AppRole | null) { return role === "admin" ? "Admin" : role === "ministry_leader" ? "Ministry Leader" : "Volunteer"; }
function getDashboardItems(role: AppRole | null): DashboardItem[] {
  if (role === "admin") return [
    { title: "Planner", description: "Create services, assign volunteers, and publish schedules.", href: "/planner", buttonText: "Open" },
    { title: "Open Schedule", description: "Build and manage upcoming service schedules.", href: "/schedule", buttonText: "Open" },
    { title: "Volunteers", description: "Manage volunteer records and active serving status.", href: "/volunteers", buttonText: "Manage" },
    { title: "Roles", description: "Manage serving roles used across the schedule.", href: "/roles", buttonText: "Manage" },
    { title: "Requests", description: "Review volunteer role requests and ministry leader access requests.", href: "/admin/lead-requests", buttonText: "Review" },
  ];
  if (role === "ministry_leader") return [
    { title: "Planner", description: "Review schedule gaps and suggested coverage.", href: "/planner", buttonText: "Open" },
    { title: "Open Schedule", description: "Assign volunteers and manage upcoming services.", href: "/schedule", buttonText: "Open" },
    { title: "My Availability", description: "Update dates when you are unavailable to serve.", href: "/my-blackouts", buttonText: "Update" },
  ];
  return [
    { title: "My Schedule", description: "View your upcoming serving assignments.", href: "/my-schedule", buttonText: "Open" },
    { title: "My Availability", description: "Set your serving preference and dates when you are unavailable.", href: "/my-blackouts", buttonText: "Update" },
    { title: "Notification Settings", description: "Choose which schedule emails you want to receive.", href: "/my-notification-settings", buttonText: "Update" },
  ];
}
const DISPLAY_GROUPS: DisplayGroup[] = [
  { label: "Worship Leader", icon: "🎤", roleNames: ["Worship Leader"] },
  { label: "Piano", icon: "🎹", roleNames: ["Piano"] },
  { label: "Instruments", icon: "🎸", roleNames: ["Instruments"] },
  { label: "Vocals", icon: "🎶", roleNames: ["Vocals 1", "Vocals 2", "Vocals 3"] },
  { label: "Audio", icon: "🎚️", roleNames: ["Sound"] },
  { label: "Projection", icon: "🎥", roleNames: ["Projection"] },
  { label: "Greeters", icon: "👋", roleNames: ["Greeter 1"] },
  { label: "Ushers", icon: "🙋", roleNames: ["Usher 1", "Usher 2"] },
  { label: "Coffee", icon: "☕", roleNames: ["Coffee 1"] },
  { label: "Calvary Kids", icon: "👶", roleNames: ["Calvary Kids"] },
];

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const firstSunday = useMemo(() => getNextSunday(), []);
  const [selectedSunday, setSelectedSunday] = useState<Date>(firstSunday);
  const selectedSundayStr = useMemo(() => toYmd(selectedSunday), [selectedSunday]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [upcomingEntries, setUpcomingEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [volunteerRoles, setVolunteerRoles] = useState<VolunteerRole[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [homeError, setHomeError] = useState("");
  const [upcomingError, setUpcomingError] = useState("");
  const [authError, setAuthError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [currentVolunteer, setCurrentVolunteer] = useState<CurrentVolunteer | null>(null);
  const [blackout, setBlackout] = useState<Blackout | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const isSignedIn = !!userEmail;
  const effectiveRole: AppRole | null = isSignedIn ? userRole ?? "volunteer" : null;
  const canSeeDraftSchedules = effectiveRole === "admin" || effectiveRole === "ministry_leader";
  const canClaim = effectiveRole === "volunteer" && !!currentVolunteer;
  const isFirstSunday = selectedSundayStr === toYmd(firstSunday);
  const todayStr = toYmd(new Date());

  useEffect(() => {
    let isMounted = true;
    async function loadAuthState() {
      setAuthLoaded(false); setAuthError("");
      try {
        const sessionRes = await withTimeout(supabase.auth.getSession(), "Home session check");
        if (!isMounted) return;
        const user = sessionRes.data.session?.user;
        if (!user) { setUserEmail(null); setUserRole(null); setCurrentVolunteer(null); setVolunteerRoles([]); setAuthLoaded(true); return; }
        setUserEmail(user.email ?? null);
        const profileRes = await withTimeout(supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(), "Home profile query");
        if (!isMounted) return;
        if (profileRes.error) { console.error("Home profile lookup failed:", profileRes.error); setUserRole("volunteer"); }
        else setUserRole((profileRes.data?.role as AppRole | null) ?? "volunteer");
        let volunteer: CurrentVolunteer | null = null;
        const byUser = await withTimeout(supabase.from("volunteers").select("id, user_id, name, public_name, email, active").eq("user_id", user.id).eq("active", true).maybeSingle(), "Home volunteer user lookup");
        if (!isMounted) return;
        if (byUser.error) console.error("Home volunteer user lookup failed:", byUser.error);
        else volunteer = (byUser.data as CurrentVolunteer | null) ?? null;
        if (!volunteer && user.email) {
          const byEmail = await withTimeout(supabase.from("volunteers").select("id, user_id, name, public_name, email, active").ilike("email", user.email.trim().toLowerCase()).eq("active", true).maybeSingle(), "Home volunteer email lookup");
          if (!isMounted) return;
          if (byEmail.error) console.error("Home volunteer email lookup failed:", byEmail.error);
          else volunteer = (byEmail.data as CurrentVolunteer | null) ?? null;
        }
        setCurrentVolunteer(volunteer);
        if (volunteer) {
          const approved = await withTimeout(supabase.from("volunteer_roles").select("volunteer_id, role_id").eq("volunteer_id", volunteer.id), "Home volunteer roles query");
          if (!isMounted) return;
          if (approved.error) { console.error("Home volunteer roles lookup failed:", approved.error); setVolunteerRoles([]); }
          else setVolunteerRoles((approved.data as VolunteerRole[]) ?? []);
        } else setVolunteerRoles([]);
        setAuthLoaded(true);
      } catch (err) {
        if (!isMounted) return;
        console.error("Home auth load error:", err);
        setAuthError(err instanceof Error ? err.message : "Failed to load sign-in status.");
        setUserEmail(null); setUserRole(null); setCurrentVolunteer(null); setVolunteerRoles([]); setAuthLoaded(true);
      }
    }
    loadAuthState();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { if (isMounted) loadAuthState(); }, 0); });
    return () => { isMounted = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    let isMounted = true;
    async function loadHomeData() {
      setHomeLoading(true); setHomeError("");
      try {
        const rolesRes = await withTimeout(supabase.from("roles").select("id, name, active").eq("active", true).order("name", { ascending: true }), "Home roles query");
        if (!isMounted) return;
        if (rolesRes.error) throw new Error(`Roles query failed: ${rolesRes.error.message}`);
        setRoles((rolesRes.data as Role[]) ?? []);
        const volunteersRes = await withTimeout(supabase.from("volunteers").select("id, name, public_name").eq("active", true), "Home volunteers query");
        if (!isMounted) return;
        if (volunteersRes.error) throw new Error(`Volunteers query failed: ${volunteersRes.error.message}`);
        setVolunteers((volunteersRes.data as Volunteer[]) ?? []);
        const templatesRes = await withTimeout(supabase.from("service_templates").select("id, name"), "Home templates query");
        if (!isMounted) return;
        if (templatesRes.error) throw new Error(`Templates query failed: ${templatesRes.error.message}`);
        setTemplates((templatesRes.data as ServiceTemplate[]) ?? []);
        let query = supabase.from("schedule_entries").select("id, date, role_id, volunteer_id, status, published, template_id").eq("date", selectedSundayStr);
        if (!canSeeDraftSchedules) query = query.eq("published", true);
        const entriesRes = await withTimeout(query, "Home schedule entries query");
        if (!isMounted) return;
        if (entriesRes.error) throw new Error(`Schedule entries query failed: ${entriesRes.error.message}`);
        setEntries((entriesRes.data as ScheduleEntry[]) ?? []);
        if (currentVolunteer) {
          const blackoutRes = await withTimeout(supabase.from("volunteer_blackouts").select("id, volunteer_id, date, note, is_hard").eq("volunteer_id", currentVolunteer.id).eq("date", selectedSundayStr).maybeSingle(), "Home blackout query");
          if (!isMounted) return;
          if (blackoutRes.error) { console.error("Home blackout lookup failed:", blackoutRes.error); setBlackout(null); }
          else setBlackout((blackoutRes.data as Blackout | null) ?? null);
        } else setBlackout(null);
      } catch (err) {
        if (!isMounted) return;
        console.error("Home page load error:", err);
        setHomeError(err instanceof Error ? err.message : "Failed to load home page data."); setEntries([]);
      } finally { if (isMounted) setHomeLoading(false); }
    }
    loadHomeData();
    return () => { isMounted = false; };
  }, [authLoaded, isSignedIn, canSeeDraftSchedules, currentVolunteer, selectedSundayStr, supabase, refreshCounter]);

  useEffect(() => {
    if (!authLoaded || !currentVolunteer || !isSignedIn) { setUpcomingEntries([]); setUpcomingLoading(false); return; }
    let isMounted = true;
    async function loadUpcoming() {
      setUpcomingLoading(true); setUpcomingError("");
      try {
        const result = await withTimeout(supabase.from("schedule_entries").select("id, date, role_id, volunteer_id, status, published, template_id").eq("volunteer_id", currentVolunteer!.id).eq("published", true).gte("date", toYmd(new Date())).order("date", { ascending: true }).limit(1000), "Upcoming assignments query");
        if (!isMounted) return;
        if (result.error) throw new Error(result.error.message);
        setUpcomingEntries((result.data as ScheduleEntry[]) ?? []);
      } catch (err) {
        if (!isMounted) return;
        setUpcomingError(err instanceof Error ? err.message : "Could not load upcoming assignments."); setUpcomingEntries([]);
      } finally { if (isMounted) setUpcomingLoading(false); }
    }
    loadUpcoming();
    return () => { isMounted = false; };
  }, [authLoaded, currentVolunteer, isSignedIn, supabase, refreshCounter]);

  const volunteerMap = useMemo(() => new Map(volunteers.map(v => [v.id, v.public_name?.trim() || v.name.trim()])), [volunteers]);
  const roleMap = useMemo(() => new Map(roles.map(r => [r.name.trim().toLowerCase(), r])), [roles]);
  const roleIdMap = useMemo(() => new Map(roles.map(r => [r.id, r.name])), [roles]);
  const templateMap = useMemo(() => new Map(templates.map(t => [t.id, t.name])), [templates]);
  const approvedRoleIds = useMemo(() => new Set(volunteerRoles.map(item => item.role_id)), [volunteerRoles]);
  const services = useMemo<ServiceGroup[]>(() => {
    const groups = new Map<string, ServiceGroup>();
    for (const entry of entries) {
      const key = entry.template_id ?? "legacy";
      if (!groups.has(key)) groups.set(key, { key, templateId: entry.template_id, templateName: entry.template_id ? templateMap.get(entry.template_id) ?? "Sunday Service" : "Legacy Schedule", entries: [] });
      groups.get(key)!.entries.push(entry);
    }
    return Array.from(groups.values()).sort((a, b) => a.templateId === null && b.templateId !== null ? 1 : a.templateId !== null && b.templateId === null ? -1 : a.templateName.localeCompare(b.templateName));
  }, [entries, templateMap]);
  const dashboardItems = getDashboardItems(effectiveRole);
  function goPreviousSunday() { if (!isFirstSunday) setSelectedSunday(current => addDays(current, -7)); }
  function goNextSunday() { setSelectedSunday(current => addDays(current, 7)); }
  function goToUpcomingSunday() { setSelectedSunday(firstSunday); }
  const refreshSchedules = useCallback(() => setRefreshCounter(n => n + 1), []);

  async function claimRole(entry: ScheduleEntry, roleName: string) {
    if (!canClaim || !currentVolunteer) { setActionError("Your account is not linked to an active volunteer profile with volunteer access."); return; }
    setActionMessage(""); setActionError("");
    if (!approvedRoleIds.has(entry.role_id)) { setActionError(`You are not currently approved to serve in ${roleName}.`); return; }
    if (!entry.published || entry.volunteer_id) { setActionError("This position is no longer available to claim."); refreshSchedules(); return; }
    if (blackout?.is_hard) { setActionError(blackout.note ? `You marked this Sunday unavailable: ${blackout.note}` : "You marked this Sunday unavailable, so this role cannot be claimed."); return; }
    if (blackout && !blackout.is_hard && !window.confirm(blackout.note ? `You marked this date with the note: "${blackout.note}". Claim ${roleName} anyway?` : `You previously marked this date as unavailable. Claim ${roleName} anyway?`)) return;
    const sameDay = upcomingEntries.filter(e => e.date === entry.date && e.id !== entry.id);
    if (sameDay.length > 0) {
      const existing = sameDay.map(e => `${roleIdMap.get(e.role_id) ?? "Another role"} (${e.template_id ? templateMap.get(e.template_id) ?? "Sunday Service" : "Legacy Schedule"})`).join(", ");
      if (!window.confirm(`Potential scheduling conflict: you're already serving on ${prettyDate(fromYmd(entry.date))}: ${existing}.\n\nContinue claiming ${roleName}?`)) return;
    }
    if (!window.confirm(`Claim ${roleName} for ${prettyDate(fromYmd(entry.date))}?`)) return;
    setBusyEntryId(entry.id);
    try {
      const qualification = await withTimeout(supabase.from("volunteer_roles").select("volunteer_id, role_id").eq("volunteer_id", currentVolunteer.id).eq("role_id", entry.role_id).maybeSingle(), "Claim qualification check");
      if (qualification.error) throw new Error(`Could not verify role approval: ${qualification.error.message}`);
      if (!qualification.data) { setVolunteerRoles(current => current.filter(item => item.role_id !== entry.role_id)); throw new Error(`You are not currently approved to serve in ${roleName}.`); }
      const { data, error } = await withTimeout(supabase.from("schedule_entries").update({ volunteer_id: currentVolunteer.id, status: "assigned" }).eq("id", entry.id).eq("published", true).is("volunteer_id", null).select("id, date, role_id, volunteer_id, status, published, template_id"), "Claim schedule update");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("This position is no longer available. Another volunteer may have claimed it first.");
      const claimed = data[0] as ScheduleEntry;
      setEntries(current => current.map(item => item.id === claimed.id ? claimed : item));
      setUpcomingEntries(current => [...current.filter(item => item.id !== claimed.id), claimed].sort((a, b) => a.date.localeCompare(b.date)));
      setVolunteers(current => current.some(v => v.id === currentVolunteer.id) ? current : [...current, { id: currentVolunteer.id, name: currentVolunteer.name, public_name: currentVolunteer.public_name }]);
      setActionMessage(`You're now scheduled for ${roleName} on ${prettyDate(fromYmd(entry.date))}.`);
      refreshSchedules();
    } catch (err) { console.error("Claim role error:", err); setActionError(err instanceof Error ? err.message : "Could not claim this position."); refreshSchedules(); }
    finally { setBusyEntryId(null); }
  }

  async function releaseRole(entry: ScheduleEntry) {
    if (!currentVolunteer || !isSignedIn) { setActionError("Your volunteer profile could not be verified."); return; }
    setActionMessage(""); setActionError("");
    const roleName = roleIdMap.get(entry.role_id) ?? "this role";
    const dateLabel = prettyDate(fromYmd(entry.date));
    const serviceName = entry.template_id ? templateMap.get(entry.template_id) ?? "Sunday Service" : "Legacy Schedule";
    if (!window.confirm(`Release your ${roleName} assignment for ${dateLabel} (${serviceName})?\n\nThis will reopen the position for another volunteer.`)) return;
    const hoursUntilDate = (fromYmd(entry.date).getTime() - Date.now()) / 3600000;
    if (hoursUntilDate < 48 && !window.confirm("IMPORTANT: This service is less than 48 hours away (or is today). Releasing now could leave the team short-staffed. Please contact your team lead directly as well.\n\nRelease anyway?")) return;
    setBusyEntryId(entry.id);
    try {
      // Conditional update: only the currently assigned volunteer can release this exact row.
      const { data, error } = await withTimeout(supabase.from("schedule_entries").update({ volunteer_id: null, status: "open" }).eq("id", entry.id).eq("published", true).eq("volunteer_id", currentVolunteer.id).select("id, date, role_id, volunteer_id, status, published, template_id"), "Release schedule update");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("This assignment could not be released. It may already have changed, or your account may not have permission to release it.");
      const released = data[0] as ScheduleEntry;
      setEntries(current => current.map(item => item.id === released.id ? released : item));
      setUpcomingEntries(current => current.filter(item => item.id !== released.id));
      setActionMessage(`${roleName} on ${dateLabel} has been released. Please contact your team lead directly if this is a last-minute change.`);
      refreshSchedules();
    } catch (err) { console.error("Release role error:", err); setActionError(err instanceof Error ? err.message : "Could not release this assignment."); refreshSchedules(); }
    finally { setBusyEntryId(null); }
  }

  function shouldShowPosition(position: DisplayPosition) {
    if (position.assignedName) return true;
    const entry = position.entry;
    if (!entry || entry.volunteer_id) return false;
    if (canSeeDraftSchedules) return true;
    return canClaim && entry.published && approvedRoleIds.has(entry.role_id);
  }

  function renderService(service: ServiceGroup) {
    const entryByRoleId = new Map<string, ScheduleEntry>();
    for (const entry of service.entries) entryByRoleId.set(entry.role_id, entry);
    const displayGroups = DISPLAY_GROUPS.map(group => ({ ...group, positions: group.roleNames.map((roleName): DisplayPosition => {
      const role = roleMap.get(roleName.toLowerCase()) ?? null;
      const entry = role ? entryByRoleId.get(role.id) ?? null : null;
      const assignedName = entry?.volunteer_id ? volunteerMap.get(entry.volunteer_id) ?? null : null;
      return { roleName, role, entry, assignedName };
    }) }));
    return <div key={service.key}>
      {services.length > 1 ? <div className="border-b border-stone-200 bg-stone-50 px-6 py-3"><div className="text-sm font-semibold text-gray-900">{service.templateName}</div></div> : null}
      <div className="grid md:grid-cols-2">
        {displayGroups.map((group, index) => {
          const visiblePositions = group.positions.filter(shouldShowPosition);
          return <div key={`${service.key}-${group.label}`} className={`border-stone-200 px-6 py-4 ${index < displayGroups.length - 2 ? "border-b" : ""} ${index % 2 === 0 ? "md:border-r" : ""}`}>
            <div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xl">{group.icon}</div>
              <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900">{group.label}</div>
                {visiblePositions.length > 0 ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {visiblePositions.map((position, visibleIndex) => {
                    const entry = position.entry;
                    const isOpen = !!entry && !entry.volunteer_id;
                    const canClaimThis = canClaim && isOpen && !!entry?.published && approvedRoleIds.has(entry.role_id);
                    const isBusy = busyEntryId === entry?.id;
                    return <span key={position.roleName} className="inline-flex items-center">
                      {visibleIndex > 0 ? <span className="mr-2 text-stone-400">•</span> : null}
                      {position.assignedName ? <span className="text-gray-700">{position.assignedName}</span> : canClaimThis && entry ? <button type="button" disabled={!!busyEntryId} onClick={() => claimRole(entry, position.roleName)} className="font-semibold text-amber-700 hover:text-amber-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50">{isBusy ? "Claiming..." : "Open — Claim"}</button> : isOpen && canSeeDraftSchedules ? <span className="font-medium text-amber-700">Open</span> : null}
                    </span>;
                  })}
                </div> : <div className="h-5" />}
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>;
  }

  return <main className="min-h-screen bg-stone-50">
    <section className="border-b border-stone-200 bg-white"><div className="mx-auto max-w-6xl px-6 py-8"><div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Calvary Call Sheet</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Serving together at Calvary</h1>
      <p className="mt-3 max-w-2xl text-base text-gray-700">See who is serving, find open positions, and manage your own schedule and availability.</p>
      {authError ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{authError}</div> : null}
      {!authLoaded ? <div className="mt-5 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">Checking sign-in status...</div> : isSignedIn ? <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">Signed in</span>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">{userEmail}</span>
        <span className="rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700">Role: {prettyUserRole(effectiveRole)}</span>
      </div> : <div className="mt-5 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">Viewing as guest. Sign in to see the serving schedule and your tools.</div>}
    </div></div></section>
    <section className="mx-auto max-w-6xl px-6 py-8">
      {!authLoaded ? null : !isSignedIn ? <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200"><h2 className="text-xl font-semibold text-gray-900">Sign in required</h2><p className="mt-2 text-sm text-gray-700">Sign in to view the serving schedule, availability tools, and role-specific actions.</p><Link href="/login" className="mt-5 inline-block rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-800">Sign In</Link></div> :
      <div className="space-y-8">
        {actionError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div> : null}
        {actionMessage ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{actionMessage}</div> : null}
        {currentVolunteer ? <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          <div className="border-b border-stone-200 px-6 py-5"><h2 className="text-xl font-bold text-gray-900">My Upcoming Assignments</h2><p className="mt-1 text-sm text-gray-600">Your published commitments, across all upcoming services. Release an individual assignment if you can no longer serve.</p></div>
          {upcomingError ? <div role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{upcomingError}</div> : null}
          {upcomingLoading ? <div className="px-6 py-6 text-sm text-gray-600">Loading your assignments...</div> : upcomingEntries.length === 0 && !upcomingError ? <div className="px-6 py-6 text-sm text-gray-600">You have no upcoming published assignments.</div> :
            <div className="divide-y divide-stone-200">{upcomingEntries.map(entry => <div key={entry.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-semibold text-gray-900">{prettyDate(fromYmd(entry.date))}</div><div className="mt-1 text-sm text-gray-700">{roleIdMap.get(entry.role_id) ?? "Serving role"} · {entry.template_id ? templateMap.get(entry.template_id) ?? "Sunday Service" : "Legacy Schedule"}</div></div>
              <button type="button" disabled={!!busyEntryId} onClick={() => releaseRole(entry)} className="w-fit rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{busyEntryId === entry.id ? "Releasing..." : "Release"}</button>
            </div>)}</div>}
        </section> : null}
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          <div className="border-b border-stone-200 px-6 py-5"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">{isFirstSunday ? "This Sunday at Calvary" : "Sunday at Calvary"}</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{prettyDate(selectedSunday)}</h2>
            <p className="mt-1 text-sm text-gray-600">Your serving team for this service.</p>
          </div><div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={goPreviousSunday} disabled={isFirstSunday} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35">← Previous</button>
            {!isFirstSunday ? <button type="button" onClick={goToUpcomingSunday} className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Upcoming</button> : null}
            <button type="button" onClick={goNextSunday} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-stone-50">Next →</button>
          </div></div></div>
          {homeError ? <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{homeError}</div> : null}
          {homeLoading ? <div className="px-6 py-10 text-sm text-gray-600">Loading serving team...</div> : entries.length === 0 ? <div className="px-6 py-10"><p className="font-medium text-gray-900">No schedule has been published for this Sunday yet.</p><p className="mt-1 text-sm text-gray-600">{canSeeDraftSchedules ? "There are no schedule rows for this date yet." : "Check back later or try another Sunday."}</p></div> : <div>{services.map(service => renderService(service))}</div>}
          {canSeeDraftSchedules ? <div className="border-t border-stone-200 bg-amber-50 px-6 py-3 text-xs text-amber-800">Admin/leader view: draft schedule entries may also be visible.</div> : null}
        </section>
        <section><h2 className="text-xl font-semibold text-gray-900">Your next actions</h2><p className="mt-1 text-sm text-gray-600">These are the most relevant tools for your current access level.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{dashboardItems.map(item => <div key={item.href} className="flex min-h-[160px] flex-col justify-between rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200"><div><h3 className="text-lg font-semibold text-gray-900">{item.title}</h3><p className="mt-2 text-sm leading-6 text-gray-700">{item.description}</p></div><Link href={item.href} className="mt-5 inline-flex w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">{item.buttonText}</Link></div>)}</div>
        </section>
      </div>}
    </section>
  </main>;
}

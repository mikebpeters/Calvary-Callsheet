"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";

type Volunteer = {
  id: string;
  name: string;
  active: boolean;
};

type Role = {
  id: string;
  name: string;
  active: boolean;
};

type Assignment = {
  id: string;
  volunteer_id: string;
  role_id: string;
};

function prettyUserRole(role: AppRole | null) {
  if (role === "admin") return "Admin";
  if (role === "ministry_leader") return "Ministry Leader";
  if (role === "volunteer") return "Volunteer";
  return "";
}

export default function AssignmentsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    const [assignmentsRes, volunteersRes, rolesRes] = await Promise.all([
      supabase
        .from("volunteer_roles")
        .select("id, volunteer_id, role_id")
        .order("volunteer_id", { ascending: true }),

      supabase
        .from("volunteers")
        .select("id, name, active")
        .order("name", { ascending: true }),

      supabase
        .from("roles")
        .select("id, name, active")
        .order("name", { ascending: true }),
    ]);

    if (assignmentsRes.error || volunteersRes.error || rolesRes.error) {
      setError(
        assignmentsRes.error?.message ||
          volunteersRes.error?.message ||
          rolesRes.error?.message ||
          "Failed to load assignments page data."
      );
      setAssignments([]);
      setVolunteers([]);
      setRoles([]);
      setLoading(false);
      return;
    }

    setAssignments(assignmentsRes.data || []);
    setVolunteers(volunteersRes.data || []);
    setRoles(rolesRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    async function checkAccessAndLoad() {
      setAuthLoading(true);
      setAccessDenied(false);
      setError(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        setAccessDenied(true);
        setAuthLoading(false);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message || "Failed to load user profile.");
        setAuthLoading(false);
        setLoading(false);
        return;
      }

      const role = (profile?.role || "volunteer") as AppRole;
      setUserRole(role);

      if (role !== "admin") {
        setAccessDenied(true);
        setAuthLoading(false);
        setLoading(false);
        return;
      }

      setAuthLoading(false);
      await loadData();
    }

    checkAccessAndLoad();
  }, [supabase]);

  const activeVolunteers = useMemo(
    () => volunteers.filter((volunteer) => volunteer.active),
    [volunteers]
  );

  const activeRoles = useMemo(
    () => roles.filter((role) => role.active),
    [roles]
  );

  const volunteerMap = useMemo(() => {
    return new Map(volunteers.map((volunteer) => [volunteer.id, volunteer.name]));
  }, [volunteers]);

  const roleMap = useMemo(() => {
    return new Map(roles.map((role) => [role.id, role.name]));
  }, [roles]);

  const groupedAssignments = useMemo(() => {
    return assignments
      .map((assignment) => ({
        ...assignment,
        volunteerName:
          volunteerMap.get(assignment.volunteer_id) || "Unknown volunteer",
        roleName: roleMap.get(assignment.role_id) || "Unknown role",
      }))
      .sort((a, b) => {
        if (a.volunteerName < b.volunteerName) return -1;
        if (a.volunteerName > b.volunteerName) return 1;
        if (a.roleName < b.roleName) return -1;
        if (a.roleName > b.roleName) return 1;
        return 0;
      });
  }, [assignments, volunteerMap, roleMap]);

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedVolunteerId || !selectedRoleId) {
      setError("Please select both a volunteer and a role.");
      return;
    }

    const alreadyExists = assignments.some(
      (assignment) =>
        assignment.volunteer_id === selectedVolunteerId &&
        assignment.role_id === selectedRoleId
    );

    if (alreadyExists) {
      setError("That volunteer is already assigned to that role.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("volunteer_roles").insert([
      {
        volunteer_id: selectedVolunteerId,
        role_id: selectedRoleId,
      },
    ]);

    if (error) {
      setError(error.message || "Failed to add assignment.");
      setSaving(false);
      return;
    }

    setSelectedVolunteerId("");
    setSelectedRoleId("");
    setSaving(false);
    await loadData();
  }

  async function handleDeleteAssignment(id: string) {
    const confirmed = window.confirm("Remove this volunteer-role assignment?");
    if (!confirmed) return;

    setError(null);

    const { error } = await supabase
      .from("volunteer_roles")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message || "Failed to remove assignment.");
      return;
    }

    await loadData();
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
              <p className="mt-2 text-sm text-gray-700">
                Link volunteers to the ministry roles they are able to serve in.
              </p>
            </div>

            {!authLoading && !accessDenied && (
              <div className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-gray-700">
                <div className="font-medium">
                  {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </div>
        </div>

        {authLoading ? (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200 text-sm text-gray-600">
            Checking access...
          </div>
        ) : accessDenied ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">
              Access restricted
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              This page is available only to Admins.
            </p>
            {userRole && (
              <p className="mt-2 text-sm text-amber-800">
                Your current role: {prettyUserRole(userRole)}
              </p>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
              <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
                <h2 className="text-lg font-semibold text-gray-900">Add Assignment</h2>
                <p className="mt-2 text-sm text-gray-700">
                  Choose a volunteer and a role to create a valid scheduling assignment.
                </p>

                <form onSubmit={handleAddAssignment} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="volunteer"
                      className="mb-1 block text-sm font-medium text-gray-800"
                    >
                      Volunteer
                    </label>
                    <select
                      id="volunteer"
                      value={selectedVolunteerId}
                      onChange={(e) => setSelectedVolunteerId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Select a volunteer</option>
                      {activeVolunteers.map((volunteer) => (
                        <option key={volunteer.id} value={volunteer.id}>
                          {volunteer.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="role"
                      className="mb-1 block text-sm font-medium text-gray-800"
                    >
                      Role
                    </label>
                    <select
                      id="role"
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Select a role</option>
                      {activeRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Adding..." : "Add Assignment"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
                <h2 className="text-lg font-semibold text-gray-900">Current Assignments</h2>
                <p className="mt-2 text-sm text-gray-700">
                  These assignments determine which volunteers appear as options for each role in the schedule.
                </p>

                {loading ? (
                  <div className="mt-6 text-sm text-gray-600">Loading assignments...</div>
                ) : groupedAssignments.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-600">No assignments found.</div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {groupedAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="rounded-lg border border-stone-200 px-4 py-4"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {assignment.volunteerName}
                            </p>
                            <p className="mt-1 text-sm text-gray-700">
                              {assignment.roleName}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteAssignment(assignment.id)}
                            className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
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

type RoleItem = {
  id: string;
  name: string;
  active: boolean;
  category_id: string | null;
  sort_order: number;
  lead_volunteer_id: string | null;
};

type Volunteer = {
  id: string;
  name: string;
  active: boolean;
};

function prettyUserRole(role: AppRole | null) {
  if (role === "admin") return "Admin";
  if (role === "ministry_leader") return "Ministry Leader";
  if (role === "volunteer") return "Volunteer";
  return "";
}

export default function RolesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleActive, setNewRoleActive] = useState(true);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("999");
  const [newLeadVolunteerId, setNewLeadVolunteerId] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("999");
  const [editLeadVolunteerId, setEditLeadVolunteerId] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    const { data: categoriesData, error: categoriesError } = await supabase
      .from("role_categories")
      .select("id, name, sort_order, active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (categoriesError) {
      setError(categoriesError.message || "Failed to load role categories.");
      setCategories([]);
      setLoading(false);
      return;
    }

    const safeCategories: RoleCategory[] = (categoriesData ?? []).map(
      (category) => ({
        id: category.id,
        name: category.name,
        sort_order: category.sort_order ?? 999,
        active: category.active ?? true,
      })
    );

    setCategories(safeCategories);

    const activeCategories = safeCategories.filter(
      (category) => category.active
    );

    const { data: rolesData, error: rolesError } = await supabase
      .from("roles")
      .select(
        "id, name, active, category_id, sort_order, lead_volunteer_id"
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (rolesError) {
      setError(rolesError.message || "Failed to load roles.");
      setRoles([]);
      setLoading(false);
      return;
    }

    const safeRoles: RoleItem[] = (rolesData ?? []).map((role) => ({
      id: role.id,
      name: role.name,
      active: role.active ?? true,
      category_id: role.category_id ?? null,
      sort_order: role.sort_order ?? 999,
      lead_volunteer_id: role.lead_volunteer_id ?? null,
    }));

    setRoles(safeRoles);

    const { data: volunteersData, error: volunteersError } = await supabase
      .from("volunteers")
      .select("id, name, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (volunteersError) {
      setError(volunteersError.message || "Failed to load volunteers.");
      setVolunteers([]);
      setLoading(false);
      return;
    }

    setVolunteers(volunteersData ?? []);

    if (!newCategoryId && activeCategories.length > 0) {
      const otherCategory = activeCategories.find(
        (category) => category.name.toLowerCase() === "other"
      );

      setNewCategoryId(
        otherCategory?.id ?? activeCategories[0].id
      );
    }

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const categoryNameById = useMemo(() => {
    return new Map(
      categories.map((category) => [category.id, category.name])
    );
  }, [categories]);

  const volunteerNameById = useMemo(() => {
    return new Map(
      volunteers.map((volunteer) => [volunteer.id, volunteer.name])
    );
  }, [volunteers]);

  const activeCategories = useMemo(() => {
    return categories.filter((category) => category.active);
  }, [categories]);

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      const search = searchTerm.trim().toLowerCase();

      const categoryName = role.category_id
        ? categoryNameById.get(role.category_id)?.toLowerCase() ?? ""
        : "";

      const leadName = role.lead_volunteer_id
        ? volunteerNameById.get(role.lead_volunteer_id)?.toLowerCase() ?? ""
        : "";

      const matchesSearch =
        role.name.toLowerCase().includes(search) ||
        categoryName.includes(search) ||
        leadName.includes(search);

      const matchesActiveFilter = showInactive ? true : role.active;

      return matchesSearch && matchesActiveFilter;
    });
  }, [
    roles,
    searchTerm,
    showInactive,
    categoryNameById,
    volunteerNameById,
  ]);

  const activeCount = roles.filter((role) => role.active).length;

  function getDefaultCategoryId() {
    const otherCategory = activeCategories.find(
      (category) => category.name.toLowerCase() === "other"
    );

    return otherCategory?.id ?? activeCategories[0]?.id ?? "";
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = newRoleName.trim();
    const parsedSortOrder = Number.parseInt(newSortOrder, 10);

    if (!trimmedName) {
      setError("Role name is required.");
      return;
    }

    if (Number.isNaN(parsedSortOrder)) {
      setError("Sort order must be a number.");
      return;
    }

    if (!newCategoryId) {
      setError("Please select a category.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("roles").insert([
      {
        name: trimmedName,
        active: newRoleActive,
        category_id: newCategoryId,
        sort_order: parsedSortOrder,
        lead_volunteer_id: newLeadVolunteerId || null,
      },
    ]);

    if (error) {
      setError(error.message || "Failed to add role.");
      setSaving(false);
      return;
    }

    setNewRoleName("");
    setNewRoleActive(true);
    setNewCategoryId(getDefaultCategoryId());
    setNewSortOrder("999");
    setNewLeadVolunteerId("");

    setSaving(false);
    await loadData();
  }

  function startEdit(role: RoleItem) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditActive(role.active);
    setEditCategoryId(role.category_id ?? getDefaultCategoryId());
    setEditSortOrder(String(role.sort_order ?? 999));
    setEditLeadVolunteerId(role.lead_volunteer_id ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditActive(true);
    setEditCategoryId("");
    setEditSortOrder("999");
    setEditLeadVolunteerId("");
  }

  async function handleSaveEdit(id: string) {
    const trimmedName = editName.trim();
    const parsedSortOrder = Number.parseInt(editSortOrder, 10);

    if (!trimmedName) {
      setError("Role name is required.");
      return;
    }

    if (Number.isNaN(parsedSortOrder)) {
      setError("Sort order must be a number.");
      return;
    }

    if (!editCategoryId) {
      setError("Please select a category.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("roles")
      .update({
        name: trimmedName,
        active: editActive,
        category_id: editCategoryId,
        sort_order: parsedSortOrder,
        lead_volunteer_id: editLeadVolunteerId || null,
      })
      .eq("id", id);

    if (error) {
      setError(error.message || "Failed to update role.");
      setSaving(false);
      return;
    }

    cancelEdit();
    setSaving(false);
    await loadData();
  }

  async function handleToggleActive(role: RoleItem) {
    setError(null);

    const { error } = await supabase
      .from("roles")
      .update({ active: !role.active })
      .eq("id", role.id);

    if (error) {
      setError(error.message || "Failed to update role status.");
      return;
    }

    await loadData();
  }

  async function handleDeleteRole(id: string) {
    const confirmed = window.confirm(
      "Delete this role? If it has been used in schedules or templates, it may be better to deactivate it instead."
    );

    if (!confirmed) return;

    setError(null);

    const { error } = await supabase
      .from("roles")
      .delete()
      .eq("id", id);

    if (error) {
      setError(
        error.message ||
          "Failed to delete role. If the role is already in use, deactivate it instead."
      );
      return;
    }

    await loadData();
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Roles</h1>

              <p className="mt-2 text-sm text-gray-700">
                Add, edit, organize, and assign activity leads for ministry
                roles.
              </p>
            </div>

            {!authLoading && !accessDenied && (
              <div className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-gray-700">
                <div className="font-medium">
                  {activeCount} active of {roles.length} total
                </div>
              </div>
            )}
          </div>
        </div>

        {authLoading ? (
          <div className="rounded-xl bg-white p-6 text-sm text-gray-600 shadow-sm ring-1 ring-stone-200">
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

            <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
              <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Add Role
                </h2>

                <form onSubmit={handleAddRole} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="role-name"
                      className="mb-1 block text-sm font-medium text-gray-800"
                    >
                      Role Name
                    </label>

                    <input
                      id="role-name"
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="e.g. Sound, Vocals 1, Coffee 2"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Category
                    </label>

                    <select
                      value={newCategoryId}
                      onChange={(e) => setNewCategoryId(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Select category</option>

                      {activeCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Sort Order
                    </label>

                    <input
                      type="number"
                      value={newSortOrder}
                      onChange={(e) => setNewSortOrder(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Activity Lead
                    </label>

                    <select
                      value={newLeadVolunteerId}
                      onChange={(e) =>
                        setNewLeadVolunteerId(e.target.value)
                      }
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">No lead assigned</option>

                      {volunteers.map((volunteer) => (
                        <option key={volunteer.id} value={volunteer.id}>
                          {volunteer.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={newRoleActive}
                      onChange={(e) =>
                        setNewRoleActive(e.target.checked)
                      }
                    />
                    Active
                  </label>

                  <button
                    type="submit"
                    disabled={saving || activeCategories.length === 0}
                    className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Adding..." : "Add Role"}
                  </button>

                  {activeCategories.length === 0 && (
                    <p className="text-sm text-amber-700">
                      No active role categories are available.
                    </p>
                  )}
                </form>
              </section>

              <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Role List
                  </h2>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search roles, category, or lead"
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                    />

                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) =>
                          setShowInactive(e.target.checked)
                        }
                      />
                      Show inactive
                    </label>
                  </div>
                </div>

                {loading ? (
                  <div className="mt-6 text-sm text-gray-600">
                    Loading roles...
                  </div>
                ) : filteredRoles.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-600">
                    No roles found.
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {filteredRoles.map((role) => {
                      const categoryName = role.category_id
                        ? categoryNameById.get(role.category_id) ??
                          "Uncategorized"
                        : "Uncategorized";

                      const leadName = role.lead_volunteer_id
                        ? volunteerNameById.get(
                            role.lead_volunteer_id
                          ) ?? "Unknown lead"
                        : "No lead assigned";

                      return (
                        <div
                          key={role.id}
                          className="rounded-lg border border-stone-200 px-4 py-4"
                        >
                          {editingId === role.id ? (
                            <div className="space-y-4">
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-800">
                                  Role Name
                                </label>

                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) =>
                                    setEditName(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                                />
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-800">
                                    Category
                                  </label>

                                  <select
                                    value={editCategoryId}
                                    onChange={(e) =>
                                      setEditCategoryId(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                                  >
                                    <option value="">
                                      Select category
                                    </option>

                                    {categories.map((category) => (
                                      <option
                                        key={category.id}
                                        value={category.id}
                                      >
                                        {category.name}
                                        {!category.active
                                          ? " (inactive)"
                                          : ""}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-800">
                                    Sort Order
                                  </label>

                                  <input
                                    type="number"
                                    value={editSortOrder}
                                    onChange={(e) =>
                                      setEditSortOrder(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-800">
                                  Activity Lead
                                </label>

                                <select
                                  value={editLeadVolunteerId}
                                  onChange={(e) =>
                                    setEditLeadVolunteerId(
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-gray-900"
                                >
                                  <option value="">
                                    No lead assigned
                                  </option>

                                  {volunteers.map((volunteer) => (
                                    <option
                                      key={volunteer.id}
                                      value={volunteer.id}
                                    >
                                      {volunteer.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <label className="flex items-center gap-2 text-sm text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={editActive}
                                  onChange={(e) =>
                                    setEditActive(e.target.checked)
                                  }
                                />
                                Active
                              </label>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveEdit(role.id)
                                  }
                                  disabled={saving}
                                  className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {saving ? "Saving..." : "Save"}
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded bg-stone-200 px-3 py-2 text-sm text-gray-800 hover:bg-stone-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <p className="font-semibold text-gray-900">
                                    {role.name}
                                  </p>

                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                      role.active
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-stone-200 text-stone-700"
                                    }`}
                                  >
                                    {role.active
                                      ? "Active"
                                      : "Inactive"}
                                  </span>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                                  <span className="rounded-full bg-stone-100 px-3 py-1">
                                    {categoryName}
                                  </span>

                                  <span className="rounded-full bg-stone-100 px-3 py-1">
                                    Sort {role.sort_order}
                                  </span>

                                  <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                                    Lead: {leadName}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(role)}
                                  className="rounded bg-stone-200 px-3 py-2 text-sm text-gray-800 hover:bg-stone-300"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleActive(role)
                                  }
                                  className="rounded bg-stone-200 px-3 py-2 text-sm text-gray-800 hover:bg-stone-300"
                                >
                                  {role.active
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteRole(role.id)
                                  }
                                  className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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

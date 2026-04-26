"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Volunteer = {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  user_id: string | null;
};

type Profile = {
  full_name: string | null;
  role: "volunteer" | "ministry_leader" | "admin" | null;
};

export default function VolunteersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loadingVolunteers, setLoadingVolunteers] = useState(true);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newActive, setNewActive] = useState(true);

  const [savingNew, setSavingNew] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pageMessage, setPageMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadPage() {
    setLoadingPage(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setLoadingPage(false);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    setProfile((profileData as Profile) ?? null);
    setLoadingPage(false);
  }

  async function loadVolunteers() {
    setLoadingVolunteers(true);

    const { data, error } = await supabase
      .from("volunteers")
      .select("id, name, email, active, user_id")
      .order("name", { ascending: true });

    if (error) {
      setSaveError(error.message);
      setVolunteers([]);
    } else {
      setVolunteers((data as Volunteer[]) ?? []);
    }

    setLoadingVolunteers(false);
  }

  useEffect(() => {
    loadPage();
    loadVolunteers();
  }, []);

  function resetCreateForm() {
    setNewName("");
    setNewEmail("");
    setNewActive(true);
  }

  function startEdit(volunteer: Volunteer) {
    setEditingId(volunteer.id);
    setEditName(volunteer.name ?? "");
    setEditEmail(volunteer.email ?? "");
    setEditActive(volunteer.active);
    setPageMessage("");
    setSaveError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmail("");
    setEditActive(true);
  }

  async function handleCreateVolunteer(e: FormEvent) {
    e.preventDefault();
    setSavingNew(true);
    setSaveError("");
    setPageMessage("");

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim();

    if (!trimmedName) {
      setSaveError("Volunteer name is required.");
      setSavingNew(false);
      return;
    }

    const payload = {
      name: trimmedName,
      email: trimmedEmail ? trimmedEmail : null,
      active: newActive,
    };

    const { error } = await supabase.from("volunteers").insert(payload);

    if (error) {
      setSaveError(error.message);
      setSavingNew(false);
      return;
    }

    resetCreateForm();
    setPageMessage("Volunteer added.");
    setSavingNew(false);
    await loadVolunteers();
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();

    if (!editingId) return;

    setSavingEdit(true);
    setSaveError("");
    setPageMessage("");

    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();

    if (!trimmedName) {
      setSaveError("Volunteer name is required.");
      setSavingEdit(false);
      return;
    }

    const { error } = await supabase
      .from("volunteers")
      .update({
        name: trimmedName,
        email: trimmedEmail ? trimmedEmail : null,
        active: editActive,
      })
      .eq("id", editingId);

    if (error) {
      setSaveError(error.message);
      setSavingEdit(false);
      return;
    }

    setPageMessage("Volunteer updated.");
    setSavingEdit(false);
    cancelEdit();
    await loadVolunteers();
  }

  async function handleToggleActive(volunteer: Volunteer) {
    setSaveError("");
    setPageMessage("");

    const { error } = await supabase
      .from("volunteers")
      .update({ active: !volunteer.active })
      .eq("id", volunteer.id);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setPageMessage(
      `${volunteer.name} marked as ${volunteer.active ? "inactive" : "active"}.`
    );
    await loadVolunteers();
  }

  if (loadingPage) {
    return (
      <main className="min-h-screen bg-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-stone-600">Loading volunteers...</p>
          </div>
        </div>
      </main>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <main className="min-h-screen bg-stone-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-wide text-amber-700">
              Access restricted
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">
              Volunteers
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              This page is available only to admins.
            </p>

            <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-600">Current role</p>
              <p className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                {profile?.role ?? "No role assigned"}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const activeCount = volunteers.filter((v) => v.active).length;
  const linkedCount = volunteers.filter((v) => !!v.user_id).length;

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                Admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-stone-900">
                Volunteers
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                Manage volunteer records, add email addresses, and see whether a
                volunteer has been linked to a login.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  Total
                </p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">
                  {volunteers.length}
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  Active
                </p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">
                  {activeCount}
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-stone-500">
                  Linked
                </p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">
                  {linkedCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {(saveError || pageMessage) && (
          <div className="mb-6 space-y-3">
            {saveError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {saveError}
              </div>
            )}
            {pageMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {pageMessage}
              </div>
            )}
          </div>
        )}

        <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">Add volunteer</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Add the volunteer here first. If their email matches the email they
            use to log in, the system can link them automatically.
          </p>

          <form onSubmit={handleCreateVolunteer} className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
                placeholder="Volunteer name"
              />
            </div>

            <div className="md:col-span-1">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
                placeholder="name@example.com"
              />
            </div>

            <div className="md:col-span-1">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Status
              </label>
              <select
                value={newActive ? "active" : "inactive"}
                onChange={(e) => setNewActive(e.target.value === "active")}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={savingNew}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingNew ? "Adding..." : "Add volunteer"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-stone-900">
              Volunteer records
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Linked means this volunteer record has been connected to a real
              login account. Not linked means the person can still be scheduled,
              but their personal schedule view will not work yet.
            </p>
          </div>

          {loadingVolunteers ? (
            <p className="text-sm text-stone-600">Loading volunteer records...</p>
          ) : volunteers.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
              <p className="text-base font-medium text-stone-900">
                No volunteers yet
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Add your first volunteer above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {volunteers.map((volunteer) => {
                const isEditing = editingId === volunteer.id;
                const isLinked = !!volunteer.user_id;

                return (
                  <div
                    key={volunteer.id}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-5"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={handleSaveEdit}
                        className="grid gap-4 md:grid-cols-3"
                      >
                        <div>
                          <label className="mb-2 block text-sm font-medium text-stone-700">
                            Name
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-stone-700">
                            Email
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
                            placeholder="name@example.com"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-stone-700">
                            Status
                          </label>
                          <select
                            value={editActive ? "active" : "inactive"}
                            onChange={(e) => setEditActive(e.target.value === "active")}
                            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>

                        <div className="md:col-span-3 flex flex-wrap gap-3">
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingEdit ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-stone-900">
                              {volunteer.name}
                            </h3>

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                volunteer.active
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border border-stone-300 bg-stone-100 text-stone-700"
                              }`}
                            >
                              {volunteer.active ? "Active" : "Inactive"}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                isLinked
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border border-amber-200 bg-amber-50 text-amber-800"
                              }`}
                            >
                              {isLinked ? "Linked" : "Not linked"}
                            </span>
                          </div>

                          <p className="mt-3 text-sm text-stone-600">
                            <span className="font-medium text-stone-700">Email:</span>{" "}
                            {volunteer.email || "No email entered"}
                          </p>

                          <p className="mt-1 text-sm text-stone-600">
                            <span className="font-medium text-stone-700">
                              Login link status:
                            </span>{" "}
                            {isLinked
                              ? "This volunteer has been linked to a user account."
                              : "This volunteer is not linked to a user account yet."}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(volunteer)}
                            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(volunteer)}
                            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white"
                          >
                            Mark {volunteer.active ? "inactive" : "active"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AppRole = "volunteer" | "ministry_leader" | "admin";

type ServiceTemplate = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

type Role = {
  id: string;
  name: string;
  active: boolean;
};

type TemplateRole = {
  id: string;
  template_id: string;
  role_id: string;
  sort_order: number;
};

type TemplateRoleRow = {
  id: string;
  templateId: string;
  roleId: string;
  roleName: string;
  sortOrder: number;
};

export default function ServiceTemplatesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [templateRoles, setTemplateRoles] = useState<TemplateRoleRow[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const [error, setError] = useState("");

  const canManage =
    userRole === "admin" || userRole === "ministry_leader";

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError) {
          throw new Error(`Could not check user: ${userError.message}`);
        }

        if (!user) {
          setUserRole(null);
          setLoading(false);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (profileError) {
          throw new Error(`Could not load profile: ${profileError.message}`);
        }

        const role = (profileData?.role as AppRole | null) ?? "volunteer";
        setUserRole(role);

        const { data: templatesData, error: templatesError } = await supabase
          .from("service_templates")
          .select("id, name, active, created_at")
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (templatesError) {
          throw new Error(
            `Could not load service templates: ${templatesError.message}`
          );
        }

        const { data: rolesData, error: rolesError } = await supabase
          .from("roles")
          .select("id, name, active")
          .eq("active", true)
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (rolesError) {
          throw new Error(`Could not load roles: ${rolesError.message}`);
        }

        const { data: templateRolesData, error: templateRolesError } =
          await supabase
            .from("service_template_roles")
            .select("id, template_id, role_id, sort_order")
            .order("sort_order", { ascending: true });

        if (!isMounted) return;

        if (templateRolesError) {
          throw new Error(
            `Could not load template roles: ${templateRolesError.message}`
          );
        }

        const loadedTemplates = (templatesData ?? []) as ServiceTemplate[];
        const loadedRoles = (rolesData ?? []) as Role[];
        const loadedTemplateRoles =
          (templateRolesData ?? []) as TemplateRole[];

        const roleMap = new Map(
          loadedRoles.map((roleItem) => [roleItem.id, roleItem.name])
        );

        const rows: TemplateRoleRow[] = loadedTemplateRoles.map((item) => ({
          id: item.id,
          templateId: item.template_id,
          roleId: item.role_id,
          roleName: roleMap.get(item.role_id) ?? "Unknown role",
          sortOrder: item.sort_order,
        }));

        setTemplates(loadedTemplates);
        setRoles(loadedRoles);
        setTemplateRoles(rows);

        if (!selectedTemplateId && loadedTemplates.length > 0) {
          setSelectedTemplateId(loadedTemplates[0].id);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Service templates load error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unknown service template load error."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [supabase, selectedTemplateId]);

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  const selectedTemplateRoles = templateRoles
    .filter((item) => item.templateId === selectedTemplateId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.roleName.localeCompare(b.roleName));

  const availableRoles = roles.filter(
    (role) =>
      !selectedTemplateRoles.some(
        (templateRole) => templateRole.roleId === role.id
      )
  );

  async function createTemplate() {
    const trimmedName = newTemplateName.trim();

    if (!trimmedName) {
      setError("Please enter a template name.");
      return;
    }

    setSaving(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("service_templates")
      .insert({
        name: trimmedName,
        active: true,
      })
      .select("id, name, active, created_at")
      .single();

    if (insertError) {
      setError(`Could not create template: ${insertError.message}`);
      setSaving(false);
      return;
    }

    const newTemplate = data as ServiceTemplate;

    setTemplates((current) =>
      [...current, newTemplate].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSelectedTemplateId(newTemplate.id);
    setNewTemplateName("");
    setSaving(false);
  }

  async function addRoleToTemplate() {
    if (!selectedTemplateId) {
      setError("Please select a template first.");
      return;
    }

    if (!selectedRoleId) {
      setError("Please select a role to add.");
      return;
    }

    const nextSortOrder =
      selectedTemplateRoles.length === 0
        ? 1
        : Math.max(...selectedTemplateRoles.map((item) => item.sortOrder)) + 1;

    setSaving(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("service_template_roles")
      .insert({
        template_id: selectedTemplateId,
        role_id: selectedRoleId,
        sort_order: nextSortOrder,
      })
      .select("id, template_id, role_id, sort_order")
      .single();

    if (insertError) {
      setError(`Could not add role to template: ${insertError.message}`);
      setSaving(false);
      return;
    }

    const roleName =
      roles.find((role) => role.id === selectedRoleId)?.name ?? "Unknown role";

    const newTemplateRole = data as TemplateRole;

    setTemplateRoles((current) => [
      ...current,
      {
        id: newTemplateRole.id,
        templateId: newTemplateRole.template_id,
        roleId: newTemplateRole.role_id,
        roleName,
        sortOrder: newTemplateRole.sort_order,
      },
    ]);

    setSelectedRoleId("");
    setSaving(false);
  }

  async function removeRoleFromTemplate(templateRoleId: string) {
    setSaving(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("service_template_roles")
      .delete()
      .eq("id", templateRoleId);

    if (deleteError) {
      setError(`Could not remove role from template: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    setTemplateRoles((current) =>
      current.filter((item) => item.id !== templateRoleId)
    );

    setSaving(false);
  }

  async function toggleTemplateActive(template: ServiceTemplate) {
    setSaving(true);
    setError("");

    const { error: updateError } = await supabase
      .from("service_templates")
      .update({
        active: !template.active,
      })
      .eq("id", template.id);

    if (updateError) {
      setError(`Could not update template: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setTemplates((current) =>
      current.map((item) =>
        item.id === template.id ? { ...item, active: !item.active } : item
      )
    );

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Service Templates
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Loading service templates...
          </p>
        </section>
      </main>
    );
  }

  if (!canManage) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Service Templates
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You need ministry leader or admin access to manage service
            templates.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
            Calvary Call Sheet
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
            Service Templates
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Create reusable service patterns such as Normal Sunday, Communion
            Sunday, or Christmas Eve. These templates will later be used to
            populate the planner automatically.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Create Template
              </h2>

              <div className="mt-4 space-y-3">
                <input
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                  placeholder="Normal Sunday"
                  className="w-full rounded-xl border border-stone-300 px-4 py-2 text-sm outline-none focus:border-gray-900"
                />

                <button
                  type="button"
                  onClick={createTemplate}
                  disabled={saving}
                  className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create Template"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Templates
              </h2>

              {templates.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">
                  No templates have been created yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {templates.map((template) => {
                    const isSelected = template.id === selectedTemplateId;

                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${
                          isSelected
                            ? "border-gray-900 bg-stone-100"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-900">
                            {template.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              template.active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {template.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            {!selectedTemplate ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Template Details
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Select or create a template to add roles.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedTemplate.name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {selectedTemplateRoles.length} role
                      {selectedTemplateRoles.length === 1 ? "" : "s"} in this
                      template.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleTemplateActive(selectedTemplate)}
                    disabled={saving}
                    className="inline-flex w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedTemplate.active
                      ? "Mark Inactive"
                      : "Mark Active"}
                  </button>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                  <h3 className="text-base font-semibold text-gray-900">
                    Add Role
                  </h3>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <select
                      value={selectedRoleId}
                      onChange={(event) => setSelectedRoleId(event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm outline-none focus:border-gray-900"
                    >
                      <option value="">Select a role</option>
                      {availableRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={addRoleToTemplate}
                      disabled={saving || !selectedRoleId}
                      className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Add Role
                    </button>
                  </div>

                  {availableRoles.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">
                      All active roles have already been added to this template.
                    </p>
                  ) : null}
                </div>

                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    Template Roles
                  </h3>

                  {selectedTemplateRoles.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">
                      No roles have been added to this template yet.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {selectedTemplateRoles.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-700">
                              {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">
                              {item.roleName}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeRoleFromTemplate(item.id)}
                            disabled={saving}
                            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
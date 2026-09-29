"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LeadRequest = {
  id: string;
  volunteer_id: string | null;
  requested_at: string;
  requester_name: string | null;
  requester_email: string | null;
  requested_role: string | null;
  note: string | null;
  status: "pending" | "approved" | "declined";
};

type RoleRequest = {
  id: string;
  volunteer_id: string;
  role_id: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  volunteer_name: string;
  volunteer_email: string | null;
  role_name: string;
};

export default function AdminLeadRequestsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [leadRequests, setLeadRequests] = useState<LeadRequest[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError("");

    try {
      /*
       * Load ministry lead requests.
       */
      const { data: leadData, error: leadError } = await supabase
        .from("lead_requests")
        .select(
          "id, volunteer_id, requested_at, requester_name, requester_email, requested_role, note, status"
        )
        .order("requested_at", { ascending: false });

      if (leadError) {
        throw new Error(
          `Could not load ministry lead requests: ${leadError.message}`
        );
      }

      setLeadRequests((leadData as LeadRequest[]) ?? []);

      /*
       * Load role requests.
       */
      const { data: roleRequestData, error: roleRequestError } =
        await supabase
          .from("volunteer_role_requests")
          .select("id, volunteer_id, role_id, status, created_at")
          .order("created_at", { ascending: false });

      if (roleRequestError) {
        throw new Error(
          `Could not load role requests: ${roleRequestError.message}`
        );
      }

      const rawRoleRequests = roleRequestData ?? [];

      /*
       * Load volunteer and role names separately.
       * This avoids depending on relationship names in Supabase.
       */
      const volunteerIds = [
        ...new Set(
          rawRoleRequests.map((request) => request.volunteer_id as string)
        ),
      ];

      const roleIds = [
        ...new Set(
          rawRoleRequests.map((request) => request.role_id as string)
        ),
      ];

      let volunteerMap = new Map<
        string,
        { name: string; email: string | null }
      >();

      let roleMap = new Map<string, string>();

      if (volunteerIds.length > 0) {
        const { data: volunteersData, error: volunteersError } =
          await supabase
            .from("volunteers")
            .select("id, name, email")
            .in("id", volunteerIds);

        if (volunteersError) {
          throw new Error(
            `Could not load volunteers for role requests: ${volunteersError.message}`
          );
        }

        volunteerMap = new Map(
          (volunteersData ?? []).map((volunteer) => [
            volunteer.id as string,
            {
              name: volunteer.name as string,
              email: (volunteer.email as string | null) ?? null,
            },
          ])
        );
      }

      if (roleIds.length > 0) {
        const { data: rolesData, error: rolesError } = await supabase
          .from("roles")
          .select("id, name")
          .in("id", roleIds);

        if (rolesError) {
          throw new Error(
            `Could not load roles for role requests: ${rolesError.message}`
          );
        }

        roleMap = new Map(
          (rolesData ?? []).map((role) => [
            role.id as string,
            role.name as string,
          ])
        );
      }

      const enrichedRoleRequests: RoleRequest[] = rawRoleRequests.map(
        (request) => {
          const volunteer = volunteerMap.get(
            request.volunteer_id as string
          );

          return {
            id: request.id as string,
            volunteer_id: request.volunteer_id as string,
            role_id: request.role_id as string,
            status: request.status as
              | "pending"
              | "approved"
              | "declined",
            created_at: request.created_at as string,
            volunteer_name: volunteer?.name ?? "Unknown volunteer",
            volunteer_email: volunteer?.email ?? null,
            role_name:
              roleMap.get(request.role_id as string) ?? "Unknown role",
          };
        }
      );

      setRoleRequests(enrichedRoleRequests);
    } catch (err) {
      console.error("Requests load error:", err);
      setError(
        err instanceof Error ? err.message : "Could not load requests."
      );
      setLeadRequests([]);
      setRoleRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function approveRoleRequest(request: RoleRequest) {
    setSavingId(request.id);
    setError("");
    setSuccess("");

    try {
      /*
       * Check whether the volunteer already has this role.
       */
      const { data: existingRole, error: existingRoleError } =
        await supabase
          .from("volunteer_roles")
          .select("volunteer_id, role_id")
          .eq("volunteer_id", request.volunteer_id)
          .eq("role_id", request.role_id)
          .maybeSingle();

      if (existingRoleError) {
        throw new Error(existingRoleError.message);
      }

      /*
       * Add the approved role if it is not already present.
       */
      if (!existingRole) {
        const { error: insertError } = await supabase
          .from("volunteer_roles")
          .insert({
            volunteer_id: request.volunteer_id,
            role_id: request.role_id,
          });

        if (insertError) {
          throw new Error(
            `Could not add role to volunteer: ${insertError.message}`
          );
        }
      }

      /*
       * Mark the request approved.
       */
      const { error: requestError } = await supabase
        .from("volunteer_role_requests")
        .update({
          status: "approved",
        })
        .eq("id", request.id);

      if (requestError) {
        throw new Error(
          `Role was added, but the request could not be marked approved: ${requestError.message}`
        );
      }

      setSuccess(
        `${request.volunteer_name} is now approved for ${request.role_name}.`
      );

      await loadRequests();
    } catch (err) {
      console.error("Approve role request error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not approve role request."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function declineRoleRequest(request: RoleRequest) {
    setSavingId(request.id);
    setError("");
    setSuccess("");

    try {
      const { error: requestError } = await supabase
        .from("volunteer_role_requests")
        .update({
          status: "declined",
        })
        .eq("id", request.id);

      if (requestError) {
        throw new Error(requestError.message);
      }

      setSuccess(
        `${request.volunteer_name}'s request for ${request.role_name} was declined.`
      );

      await loadRequests();
    } catch (err) {
      console.error("Decline role request error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not decline role request."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function approveLeadRequest(request: LeadRequest) {
    if (!request.volunteer_id) {
      setError("This request is not linked to a volunteer record.");
      return;
    }

    setSavingId(request.id);
    setError("");
    setSuccess("");

    const { data: volunteer, error: volunteerError } = await supabase
      .from("volunteers")
      .select("user_id")
      .eq("id", request.volunteer_id)
      .maybeSingle();

    if (volunteerError) {
      setError(volunteerError.message);
      setSavingId(null);
      return;
    }

    if (!volunteer?.user_id) {
      setError("Could not find the user account linked to this volunteer.");
      setSavingId(null);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ role: "ministry_leader" })
      .eq("id", volunteer.user_id);

    if (profileError) {
      setError(profileError.message);
      setSavingId(null);
      return;
    }

    const { error: requestError } = await supabase
      .from("lead_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (requestError) {
      setError(requestError.message);
      setSavingId(null);
      return;
    }

    setSuccess("Ministry lead request approved.");
    await loadRequests();
    setSavingId(null);
  }

  async function declineLeadRequest(requestId: string) {
    setSavingId(requestId);
    setError("");
    setSuccess("");

    const { error } = await supabase
      .from("lead_requests")
      .update({
        status: "declined",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      setError(error.message);
      setSavingId(null);
      return;
    }

    setSuccess("Ministry lead request declined.");
    await loadRequests();
    setSavingId(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Requests
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Review volunteer role requests and ministry lead access
            requests.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Role Requests
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Approving a request adds the role to the volunteer's
              approved roles.
            </p>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-gray-600">
              Loading requests...
            </p>
          ) : roleRequests.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No role requests yet.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {roleRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border px-4 py-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {request.volunteer_name}
                      </div>

                      {request.volunteer_email ? (
                        <div className="text-sm text-gray-600">
                          {request.volunteer_email}
                        </div>
                      ) : null}

                      <div className="mt-2 text-sm text-gray-800">
                        Wants to serve as:{" "}
                        <span className="font-medium">
                          {request.role_name}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium capitalize text-stone-700">
                        {request.status}
                      </span>

                      {request.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={savingId === request.id}
                            onClick={() => approveRoleRequest(request)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
                          >
                            {savingId === request.id
                              ? "Saving..."
                              : "Approve"}
                          </button>

                          <button
                            type="button"
                            disabled={savingId === request.id}
                            onClick={() => declineRoleRequest(request)}
                            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
                          >
                            Decline
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Ministry Lead Requests
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Approving a request grants ministry leader access.
            </p>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-gray-600">
              Loading requests...
            </p>
          ) : leadRequests.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No ministry lead requests yet.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {leadRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border px-4 py-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {request.requester_name || "Unnamed requester"}
                      </div>

                      <div className="text-sm text-gray-600">
                        {request.requester_email || "No email"}
                      </div>

                      <div className="mt-2 text-sm text-gray-800">
                        Wants to lead:{" "}
                        <span className="font-medium">
                          {request.requested_role || "Not specified"}
                        </span>
                      </div>

                      {request.note ? (
                        <div className="mt-2 text-sm text-gray-600">
                          {request.note}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium capitalize text-stone-700">
                        {request.status}
                      </span>

                      {request.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={savingId === request.id}
                            onClick={() => approveLeadRequest(request)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
                          >
                            {savingId === request.id
                              ? "Saving..."
                              : "Approve"}
                          </button>

                          <button
                            type="button"
                            disabled={savingId === request.id}
                            onClick={() =>
                              declineLeadRequest(request.id)
                            }
                            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
                          >
                            Decline
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

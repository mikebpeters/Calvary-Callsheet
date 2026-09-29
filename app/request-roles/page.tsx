"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Volunteer = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  active: boolean;
};

type Role = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number | null;
};

type RoleRequest = {
  id: string;
  role_id: string;
  status: string;
  created_at: string;
};

export default function RequestRolesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [currentVolunteer, setCurrentVolunteer] =
    useState<Volunteer | null>(null);

  const [roles, setRoles] = useState<Role[]>([]);
  const [existingRoleIds, setExistingRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [requests, setRequests] = useState<RoleRequest[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError) {
          throw new Error(
            `Could not check signed-in user: ${userError.message}`
          );
        }

        if (!user) {
          throw new Error("Please sign in to request roles.");
        }

        /*
         * First try the permanent user_id link.
         */
        const {
          data: linkedVolunteer,
          error: linkedVolunteerError,
        } = await supabase
          .from("volunteers")
          .select("id, user_id, name, email, active")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();

        if (!isMounted) return;

        if (linkedVolunteerError) {
          throw new Error(
            `Could not load volunteer profile: ${linkedVolunteerError.message}`
          );
        }

        let volunteerData: Volunteer | null =
          (linkedVolunteer as Volunteer | null) ?? null;

        /*
         * If not linked yet, match the signed-in email to an
         * existing active volunteer and permanently link it.
         */
        if (!volunteerData && user.email) {
          const normalizedEmail = user.email.trim().toLowerCase();

          const {
            data: emailVolunteer,
            error: emailVolunteerError,
          } = await supabase
            .from("volunteers")
            .select("id, user_id, name, email, active")
            .ilike("email", normalizedEmail)
            .eq("active", true)
            .maybeSingle();

          if (!isMounted) return;

          if (emailVolunteerError) {
            throw new Error(
              `Could not match volunteer by email: ${emailVolunteerError.message}`
            );
          }

          if (emailVolunteer) {
            if (
              emailVolunteer.user_id &&
              emailVolunteer.user_id !== user.id
            ) {
              throw new Error(
                "A volunteer record with this email is already linked to another account. Please contact an administrator."
              );
            }

            if (!emailVolunteer.user_id) {
              const {
                data: linkedRecord,
                error: linkError,
              } = await supabase
                .from("volunteers")
                .update({ user_id: user.id })
                .eq("id", emailVolunteer.id)
                .is("user_id", null)
                .select("id, user_id, name, email, active")
                .maybeSingle();

              if (!isMounted) return;

              if (linkError) {
                throw new Error(
                  `We found your volunteer profile, but could not link your account: ${linkError.message}`
                );
              }

              if (!linkedRecord) {
                const {
                  data: refreshedVolunteer,
                  error: refreshError,
                } = await supabase
                  .from("volunteers")
                  .select("id, user_id, name, email, active")
                  .eq("id", emailVolunteer.id)
                  .maybeSingle();

                if (refreshError) {
                  throw new Error(
                    `Could not verify volunteer link: ${refreshError.message}`
                  );
                }

                if (
                  refreshedVolunteer?.user_id &&
                  refreshedVolunteer.user_id !== user.id
                ) {
                  throw new Error(
                    "This volunteer profile was linked to another account. Please contact an administrator."
                  );
                }

                volunteerData =
                  (refreshedVolunteer as Volunteer | null) ?? null;
              } else {
                volunteerData = linkedRecord as Volunteer;
              }
            } else {
              volunteerData = emailVolunteer as Volunteer;
            }
          }
        }

        if (!volunteerData) {
          throw new Error(
            "We could not find an active volunteer profile matching your sign-in email. Please contact an administrator."
          );
        }

        setCurrentVolunteer(volunteerData);

        /*
         * Load active roles.
         */
        const { data: rolesData, error: rolesError } = await supabase
          .from("roles")
          .select("id, name, description, active, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (rolesError) {
          throw new Error(`Could not load roles: ${rolesError.message}`);
        }

        setRoles((rolesData as Role[]) ?? []);

        /*
         * Load roles already approved for this volunteer.
         */
        const {
          data: volunteerRolesData,
          error: volunteerRolesError,
        } = await supabase
          .from("volunteer_roles")
          .select("role_id")
          .eq("volunteer_id", volunteerData.id);

        if (!isMounted) return;

        if (volunteerRolesError) {
          throw new Error(
            `Could not load your current roles: ${volunteerRolesError.message}`
          );
        }

        setExistingRoleIds(
          new Set(
            (volunteerRolesData ?? []).map((row) => row.role_id as string)
          )
        );

        /*
         * Load this volunteer's role requests.
         */
        const { data: requestData, error: requestError } = await supabase
          .from("volunteer_role_requests")
          .select("id, role_id, status, created_at")
          .eq("volunteer_id", volunteerData.id)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (requestError) {
          throw new Error(
            `Could not load your role requests: ${requestError.message}`
          );
        }

        setRequests((requestData as RoleRequest[]) ?? []);
      } catch (err) {
        if (!isMounted) return;

        console.error("Request Roles load error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Could not load role requests."
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
  }, [supabase]);

  async function requestRole(role: Role) {
    if (!currentVolunteer) return;

    setSavingRoleId(role.id);
    setError("");
    setSuccess("");

    try {
      const existingRequest = requests.find(
        (request) =>
          request.role_id === role.id && request.status === "pending"
      );

      if (existingRequest) {
        throw new Error("You have already requested this role.");
      }

      const { data, error: insertError } = await supabase
        .from("volunteer_role_requests")
        .insert({
          volunteer_id: currentVolunteer.id,
          role_id: role.id,
          status: "pending",
        })
        .select("id, role_id, status, created_at")
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      setRequests((current) => [data as RoleRequest, ...current]);
      setSuccess(
        `Your request for ${role.name} has been submitted for approval.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit request."
      );
    } finally {
      setSavingRoleId(null);
    }
  }

  function getRequestForRole(roleId: string) {
    return requests.find((request) => request.role_id === roleId);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Request Roles
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Let us know which areas you would be willing to serve in.
            Once approved, those roles can appear as options for you in
            Call Sheet.
          </p>

          {currentVolunteer ? (
            <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
              Signed in as{" "}
              <span className="font-medium">
                {currentVolunteer.name}
              </span>
            </div>
          ) : null}

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
          <h2 className="text-lg font-semibold text-gray-900">
            Available Roles
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Choose any roles you are comfortable helping with. A request
            does not schedule you for a particular date.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-gray-600">Loading roles...</p>
          ) : !currentVolunteer ? (
            <p className="mt-6 text-sm text-gray-500">
              A volunteer profile is required before roles can be requested.
            </p>
          ) : roles.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No active roles are available.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {roles.map((role) => {
                const alreadyApproved = existingRoleIds.has(role.id);
                const request = getRequestForRole(role.id);
                const pending = request?.status === "pending";
                const approved = request?.status === "approved";
                const declined = request?.status === "declined";
                const saving = savingRoleId === role.id;

                return (
                  <div
                    key={role.id}
                    className="flex flex-col gap-4 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {role.name}
                      </div>

                      {role.description ? (
                        <div className="mt-1 text-sm text-gray-600">
                          {role.description}
                        </div>
                      ) : null}

                      {alreadyApproved ? (
                        <div className="mt-2 text-xs font-medium text-emerald-700">
                          Already one of your approved roles
                        </div>
                      ) : pending ? (
                        <div className="mt-2 text-xs font-medium text-amber-700">
                          Request pending
                        </div>
                      ) : approved ? (
                        <div className="mt-2 text-xs font-medium text-emerald-700">
                          Request approved
                        </div>
                      ) : declined ? (
                        <div className="mt-2 text-xs font-medium text-red-700">
                          Previous request declined
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => requestRole(role)}
                      disabled={
                        saving ||
                        alreadyApproved ||
                        pending ||
                        approved
                      }
                      className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {saving
                        ? "Submitting..."
                        : alreadyApproved
                        ? "Approved"
                        : pending
                        ? "Pending"
                        : approved
                        ? "Approved"
                        : declined
                        ? "Request again"
                        : "Request role"}
                    </button>
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

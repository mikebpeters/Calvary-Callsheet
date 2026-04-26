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

export default function AdminLeadRequestsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<LeadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("lead_requests")
      .select(
        "id, volunteer_id, requested_at, requester_name, requester_email, requested_role, note, status"
      )
      .order("requested_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRequests([]);
    } else {
      setRequests((data as LeadRequest[]) ?? []);
    }

    setLoading(false);
  }

  async function approveRequest(request: LeadRequest) {
    if (!request.volunteer_id) {
      setError("This request is not linked to a volunteer record.");
      return;
    }

    setSavingId(request.id);
    setError("");

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

    await loadRequests();
    setSavingId(null);
  }

  async function declineRequest(requestId: string) {
    setSavingId(requestId);
    setError("");

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

    await loadRequests();
    setSavingId(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Lead Requests
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Approving a request grants ministry leader access.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-gray-600">Loading requests...</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-500">No lead requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="rounded-xl border px-4 py-4">
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
                            onClick={() => approveRequest(request)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
                          >
                            {savingId === request.id ? "Saving..." : "Approve"}
                          </button>

                          <button
                            type="button"
                            disabled={savingId === request.id}
                            onClick={() => declineRequest(request.id)}
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
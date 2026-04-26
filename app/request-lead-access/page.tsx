"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LeadRequest = {
  id: string;
  requested_at: string;
  status: "pending" | "approved" | "declined";
  requester_name: string | null;
  requester_email: string | null;
  requested_role: string | null;
  note: string | null;
};

export default function RequestLeadAccessPage() {
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<LeadRequest[]>([]);
  const [volunteerId, setVolunteerId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [requestedRole, setRequestedRole] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw new Error(userError.message);
      if (!user) throw new Error("Not signed in.");

      setEmail(user.email ?? "");

      const { data: volunteer, error: volunteerError } = await supabase
        .from("volunteers")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (volunteerError) throw new Error(volunteerError.message);

      const currentVolunteerId = volunteer?.id ?? null;
      setVolunteerId(currentVolunteerId);

      if (volunteer?.name) {
        setName(volunteer.name);
      }

      const { data, error } = await supabase
        .from("lead_requests")
        .select(
          "id, requested_at, status, requester_name, requester_email, requested_role, note"
        )
        .eq("volunteer_id", currentVolunteerId)
        .order("requested_at", { ascending: false });

      if (error) throw new Error(error.message);

      setRequests((data as LeadRequest[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load error");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    setSaving(true);
    setError("");

    if (!volunteerId) {
      setError("Could not find your volunteer record.");
      setSaving(false);
      return;
    }

    if (!name.trim() || !email.trim() || !requestedRole.trim()) {
      setError("Name, email, and requested role are required.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("lead_requests").insert({
      volunteer_id: volunteerId,
      requester_name: name.trim(),
      requester_email: email.trim(),
      requested_role: requestedRole.trim(),
      note: note.trim() || null,
      status: "pending",
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setRequestedRole("");
    setNote("");

    await loadData();
    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            Request Lead Access
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Submit a request to become a ministry lead.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-gray-600">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">
                What would you like to lead?
              </label>
              <input
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value)}
                placeholder="e.g. Sound, Worship, Kids Ministry"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Why optional</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={submitRequest}
            disabled={saving || loading || !volunteerId}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? "Submitting..." : "Submit request"}
          </button>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            My Recent Requests
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-gray-600">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No requests yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border px-4 py-3">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {r.requester_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {r.requester_email}
                      </div>

                      <div className="mt-1 text-sm text-gray-800">
                        Wants to lead:{" "}
                        <span className="font-medium">
                          {r.requested_role}
                        </span>
                      </div>

                      {r.note ? (
                        <div className="mt-1 text-sm text-gray-600">
                          {r.note}
                        </div>
                      ) : null}
                    </div>

                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium capitalize text-stone-700">
                      {r.status}
                    </span>
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
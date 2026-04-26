"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Blackout = {
  id: string;
  date: string;
  note: string | null;
  is_hard: boolean;
};

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toYmd(date);
}

function getDatesInRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

export default function MyBlackoutsPage() {
  const supabase = useMemo(() => createClient(), []);
  const today = toYmd(new Date());

  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [note, setNote] = useState("");
  const [isHard, setIsHard] = useState(false);

  const [currentVolunteerId, setCurrentVolunteerId] = useState<string | null>(
    null
  );

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
      if (!user) throw new Error("Not signed in");

      const { data: volunteer, error: volError } = await supabase
        .from("volunteers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (volError) throw new Error(volError.message);

      const volunteerId = volunteer?.id ?? null;
      setCurrentVolunteerId(volunteerId);

      if (!volunteerId) {
        setBlackouts([]);
        return;
      }

      const { data, error: blackoutError } = await supabase
        .from("volunteer_blackouts")
        .select("id, date, note, is_hard")
        .eq("volunteer_id", volunteerId)
        .gte("date", today)
        .order("date", { ascending: true });

      if (blackoutError) throw new Error(blackoutError.message);

      const safeBlackouts: Blackout[] = (data ?? []).map((blackout) => ({
        id: blackout.id,
        date: blackout.date,
        note: blackout.note,
        is_hard: blackout.is_hard ?? false,
      }));

      setBlackouts(safeBlackouts);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Load error");
      setBlackouts([]);
    } finally {
      setLoading(false);
    }
  }

  async function addBlackoutRange() {
    if (!currentVolunteerId) return;

    setError("");

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    const dates = getDatesInRange(startDate, endDate);

    if (dates.length > 90) {
      setError("Please add blackout ranges of 90 days or fewer.");
      return;
    }

    setSaving(true);

    const rowsToInsert = dates.map((date) => ({
      volunteer_id: currentVolunteerId,
      date,
      note: note.trim() || null,
      is_hard: isHard,
    }));

    const { error } = await supabase
      .from("volunteer_blackouts")
      .upsert(rowsToInsert, {
        onConflict: "volunteer_id,date",
        ignoreDuplicates: false,
      });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setNote("");
    setIsHard(false);
    setEndDate(startDate);
    await loadData();
    setSaving(false);
  }

  async function removeBlackout(id: string) {
    setError("");

    const { error } = await supabase
      .from("volunteer_blackouts")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            My Availability
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Mark single dates or date ranges when you are unavailable to serve.
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-gray-600">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600">Note optional</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Vacation, out of town..."
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-start gap-3 rounded-xl border bg-stone-50 px-4 py-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={isHard}
                  onChange={(e) => setIsHard(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">
                    Hard blackout: do not schedule me
                  </span>
                  <span className="block text-xs text-gray-500">
                    If checked, leaders will be blocked from assigning you on
                    this date unless the blackout is removed.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <button
            onClick={addBlackoutRange}
            disabled={saving || !currentVolunteerId}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? "Adding..." : "Add unavailable date(s)"}
          </button>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Upcoming Unavailable Dates
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-gray-600">Loading...</p>
          ) : blackouts.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No blackout dates set.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {blackouts.map((blackout) => (
                <div
                  key={blackout.id}
                  className="flex items-center justify-between rounded-xl border px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {prettyDate(blackout.date)}
                    </div>

                    <div
                      className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        blackout.is_hard
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {blackout.is_hard
                        ? "Hard blackout"
                        : "Soft unavailable"}
                    </div>

                    {blackout.note ? (
                      <div className="mt-1 text-xs text-gray-500">
                        {blackout.note}
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={() => removeBlackout(blackout.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
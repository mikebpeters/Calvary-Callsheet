"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Volunteer = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  active: boolean;
};

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
    year: "numeric",
  });
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);

  date.setDate(date.getDate() + days);

  return toYmd(date);
}

function getDatesInRange(
  startDate: string,
  endDate: string
) {
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

  const today = useMemo(
    () => toYmd(new Date()),
    []
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSignedIn, setIsSignedIn] =
    useState(false);

  const [error, setError] = useState("");

  const [
    currentVolunteer,
    setCurrentVolunteer,
  ] = useState<Volunteer | null>(null);

  const [blackouts, setBlackouts] = useState<
    Blackout[]
  >([]);

  const [startDate, setStartDate] =
    useState(today);

  const [endDate, setEndDate] =
    useState(today);

  const [note, setNote] = useState("");
  const [isHard, setIsHard] = useState(false);

  /*
   * ---------------------------------------------------------
   * LOAD PAGE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError("");

        /*
         * -----------------------------------------------------
         * 1. GET SIGNED-IN USER
         * -----------------------------------------------------
         */

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
          setIsSignedIn(false);
          setCurrentVolunteer(null);
          setBlackouts([]);
          return;
        }

        setIsSignedIn(true);

        /*
         * -----------------------------------------------------
         * 2. FIRST LOOK FOR AN EXISTING USER_ID LINK
         * -----------------------------------------------------
         */

        const {
          data: linkedVolunteer,
          error: linkedVolunteerError,
        } = await supabase
          .from("volunteers")
          .select(
            "id, user_id, name, email, active"
          )
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
          (linkedVolunteer as Volunteer | null) ??
          null;

        /*
         * -----------------------------------------------------
         * 3. IF NOT LINKED, FIND VOLUNTEER BY EMAIL
         * -----------------------------------------------------
         */

        if (!volunteerData && user.email) {
          const normalizedEmail = user.email
            .trim()
            .toLowerCase();

          const {
            data: emailVolunteer,
            error: emailVolunteerError,
          } = await supabase
            .from("volunteers")
            .select(
              "id, user_id, name, email, active"
            )
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
            /*
             * Do not overwrite a volunteer profile
             * already linked to another account.
             */

            if (
              emailVolunteer.user_id &&
              emailVolunteer.user_id !== user.id
            ) {
              throw new Error(
                "A volunteer record with this email is already linked to another account. Please contact an administrator."
              );
            }

            /*
             * Link the volunteer record to this
             * authenticated user if needed.
             */

            if (!emailVolunteer.user_id) {
              const {
                data: linkedRecord,
                error: linkError,
              } = await supabase
                .from("volunteers")
                .update({
                  user_id: user.id,
                })
                .eq("id", emailVolunteer.id)
                .is("user_id", null)
                .select(
                  "id, user_id, name, email, active"
                )
                .maybeSingle();

              if (!isMounted) return;

              if (linkError) {
                throw new Error(
                  `We found your volunteer profile, but could not link your account: ${linkError.message}`
                );
              }

              /*
               * If another request linked the record
               * between lookup and update, retrieve it
               * again and verify ownership.
               */

              if (!linkedRecord) {
                const {
                  data: refreshedVolunteer,
                  error: refreshError,
                } = await supabase
                  .from("volunteers")
                  .select(
                    "id, user_id, name, email, active"
                  )
                  .eq("id", emailVolunteer.id)
                  .maybeSingle();

                if (!isMounted) return;

                if (refreshError) {
                  throw new Error(
                    `Could not verify volunteer link: ${refreshError.message}`
                  );
                }

                if (
                  refreshedVolunteer?.user_id &&
                  refreshedVolunteer.user_id !==
                    user.id
                ) {
                  throw new Error(
                    "This volunteer profile was linked to another account. Please contact an administrator."
                  );
                }

                volunteerData =
                  (refreshedVolunteer as Volunteer | null) ??
                  null;
              } else {
                volunteerData =
                  linkedRecord as Volunteer;
              }
            } else {
              volunteerData =
                emailVolunteer as Volunteer;
            }
          }
        }

        /*
         * -----------------------------------------------------
         * 4. NO VOLUNTEER PROFILE FOUND
         * -----------------------------------------------------
         */

        if (!volunteerData) {
          setCurrentVolunteer(null);
          setBlackouts([]);
          return;
        }

        setCurrentVolunteer(volunteerData);

        /*
         * -----------------------------------------------------
         * 5. LOAD UPCOMING BLACKOUTS
         * -----------------------------------------------------
         */

        const {
          data: blackoutData,
          error: blackoutError,
        } = await supabase
          .from("volunteer_blackouts")
          .select(
            "id, date, note, is_hard"
          )
          .eq(
            "volunteer_id",
            volunteerData.id
          )
          .gte("date", today)
          .order("date", {
            ascending: true,
          });

        if (!isMounted) return;

        if (blackoutError) {
          throw new Error(
            `Could not load unavailable dates: ${blackoutError.message}`
          );
        }

        const safeBlackouts: Blackout[] = (
          blackoutData ?? []
        ).map((blackout) => ({
          id: blackout.id,
          date: blackout.date,
          note: blackout.note,
          is_hard:
            blackout.is_hard ?? false,
        }));

        setBlackouts(safeBlackouts);
      } catch (err) {
        if (!isMounted) return;

        console.error(
          "My Availability load error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Could not load availability."
        );

        setCurrentVolunteer(null);
        setBlackouts([]);
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
  }, [supabase, today]);

  /*
   * ---------------------------------------------------------
   * RELOAD BLACKOUT LIST
   * ---------------------------------------------------------
   */

  async function reloadBlackouts(
    volunteerId: string
  ) {
    const {
      data,
      error: blackoutError,
    } = await supabase
      .from("volunteer_blackouts")
      .select(
        "id, date, note, is_hard"
      )
      .eq("volunteer_id", volunteerId)
      .gte("date", today)
      .order("date", {
        ascending: true,
      });

    if (blackoutError) {
      throw new Error(
        blackoutError.message
      );
    }

    const safeBlackouts: Blackout[] = (
      data ?? []
    ).map((blackout) => ({
      id: blackout.id,
      date: blackout.date,
      note: blackout.note,
      is_hard:
        blackout.is_hard ?? false,
    }));

    setBlackouts(safeBlackouts);
  }

  /*
   * ---------------------------------------------------------
   * ADD BLACKOUT DATE OR RANGE
   * ---------------------------------------------------------
   */

  async function addBlackoutRange() {
    if (!currentVolunteer) {
      setError(
        "We could not connect your login to a volunteer profile. Please contact an administrator."
      );
      return;
    }

    setError("");

    if (!startDate || !endDate) {
      setError(
        "Please choose a start date and end date."
      );
      return;
    }

    if (endDate < startDate) {
      setError(
        "End date cannot be before start date."
      );
      return;
    }

    const dates = getDatesInRange(
      startDate,
      endDate
    );

    if (dates.length > 90) {
      setError(
        "Please add unavailable ranges of 90 days or fewer."
      );
      return;
    }

    setSaving(true);

    try {
      const rowsToInsert = dates.map(
        (date) => ({
          volunteer_id:
            currentVolunteer.id,
          date,
          note:
            note.trim() || null,
          is_hard: isHard,
        })
      );

      const { error: saveError } =
        await supabase
          .from(
            "volunteer_blackouts"
          )
          .upsert(rowsToInsert, {
            onConflict:
              "volunteer_id,date",
            ignoreDuplicates: false,
          });

      if (saveError) {
        throw new Error(
          `Could not save unavailable dates: ${saveError.message}`
        );
      }

      /*
       * Reset the optional fields but keep
       * the selected start date for convenience.
       */

      setNote("");
      setIsHard(false);
      setEndDate(startDate);

      await reloadBlackouts(
        currentVolunteer.id
      );
    } catch (err) {
      console.error(
        "Add availability error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not save unavailable dates."
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * REMOVE BLACKOUT
   * ---------------------------------------------------------
   */

  async function removeBlackout(
    id: string
  ) {
    if (!currentVolunteer) return;

    setError("");

    try {
      const {
        error: deleteError,
      } = await supabase
        .from("volunteer_blackouts")
        .delete()
        .eq("id", id)
        .eq(
          "volunteer_id",
          currentVolunteer.id
        );

      if (deleteError) {
        throw new Error(
          `Could not remove unavailable date: ${deleteError.message}`
        );
      }

      await reloadBlackouts(
        currentVolunteer.id
      );
    } catch (err) {
      console.error(
        "Remove availability error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not remove unavailable date."
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            My Availability
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Loading your availability...
          </p>
        </section>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * NOT SIGNED IN
   * ---------------------------------------------------------
   */

  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            My Availability
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            You need to sign in to
            manage your availability.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm"
            >
              Go to login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * MAIN PAGE
   * ---------------------------------------------------------
   */

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">
            My Availability
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            Mark single dates or date
            ranges when you are unavailable
            to serve.
          </p>

          {currentVolunteer && (
            <div className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
              Signed in as{" "}
              <span className="font-medium">
                {currentVolunteer.name}
              </span>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!currentVolunteer ? (
            /*
             * Do not show a dead form.
             * Explain what is wrong instead.
             */

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <h2 className="font-medium text-amber-900">
                No volunteer profile found
              </h2>

              <p className="mt-1 text-sm text-amber-800">
                We could not find an active
                volunteer profile matching
                the email address you used
                to sign in. Please contact
                an administrator.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="start-date"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Start date
                  </label>

                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    min={today}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setStartDate(value);

                      if (
                        endDate < value
                      ) {
                        setEndDate(value);
                      }
                    }}
                    disabled={saving}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="end-date"
                    className="block text-sm font-medium text-gray-700"
                  >
                    End date
                  </label>

                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    min={
                      startDate || today
                    }
                    onChange={(e) =>
                      setEndDate(
                        e.target.value
                      )
                    }
                    disabled={saving}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="availability-note"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Note{" "}
                    <span className="font-normal text-gray-500">
                      optional
                    </span>
                  </label>

                  <input
                    id="availability-note"
                    type="text"
                    value={note}
                    onChange={(e) =>
                      setNote(
                        e.target.value
                      )
                    }
                    placeholder="Vacation, out of town..."
                    disabled={saving}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 shadow-sm placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-stone-50 px-4 py-4 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={isHard}
                      onChange={(e) =>
                        setIsHard(
                          e.target.checked
                        )
                      }
                      disabled={saving}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block font-medium">
                        Hard blackout: do not
                        schedule me
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-gray-500">
                        If checked, leaders will
                        be blocked from assigning
                        you on this date unless
                        the blackout is removed.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  addBlackoutRange
                }
                disabled={saving}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving
                  ? "Adding..."
                  : "Add unavailable date(s)"}
              </button>
            </>
          )}
        </section>

        {currentVolunteer && (
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Unavailable Dates
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              These dates will be visible
              to people preparing the
              schedule.
            </p>

            {blackouts.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                No unavailable dates set.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {blackouts.map(
                  (blackout) => (
                    <div
                      key={blackout.id}
                      className="flex flex-col gap-3 rounded-xl border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {prettyDate(
                            blackout.date
                          )}
                        </div>

                        <div
                          className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${
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
                          <div className="mt-2 text-xs text-gray-500">
                            {
                              blackout.note
                            }
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeBlackout(
                            blackout.id
                          )
                        }
                        disabled={saving}
                        className="self-start text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

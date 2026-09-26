  async function unclaimAssignment(entryId: string) {
    if (!currentVolunteer) return;

    const assignment = assignments.find(
      (item) => item.entryId === entryId
    );

    if (!assignment) {
      setError(
        "This assignment could not be found. Please refresh the page."
      );
      return;
    }

    const confirmed = window.confirm(
      `Unclaim ${assignment.roleName} on ${prettyDate(
        assignment.date
      )}?`
    );

    if (!confirmed) return;

    setSavingEntryId(entryId);
    setError("");

    try {
      /*
       * First verify that this schedule entry still exists
       * and still belongs to the signed-in volunteer.
       */

      const {
        data: currentEntry,
        error: checkError,
      } = await supabase
        .from("schedule_entries")
        .select("id, volunteer_id, published")
        .eq("id", entryId)
        .maybeSingle();

      if (checkError) {
        throw new Error(
          `Could not verify assignment: ${checkError.message}`
        );
      }

      if (!currentEntry) {
        throw new Error(
          "This assignment no longer exists. Please refresh the page."
        );
      }

      if (
        currentEntry.volunteer_id !== currentVolunteer.id
      ) {
        throw new Error(
          "This assignment has already changed. Please refresh the page."
        );
      }

      /*
       * Clear the volunteer assignment but KEEP the schedule
       * entry itself.
       *
       * Because published remains unchanged, the position
       * immediately becomes an open published position that
       * another volunteer can claim.
       */

      const { error: updateError } = await supabase
        .from("schedule_entries")
        .update({
          volunteer_id: null,
          status: null,
        })
        .eq("id", entryId);

      if (updateError) {
        throw new Error(
          `Could not unclaim assignment: ${updateError.message}`
        );
      }

      /*
       * Database update succeeded.
       * Remove the assignment from My Schedule.
       */

      setAssignments((current) =>
        current.filter(
          (item) => item.entryId !== entryId
        )
      );
    } catch (err) {
      console.error("Unclaim error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not unclaim assignment."
      );
    } finally {
      setSavingEntryId(null);
    }
  }

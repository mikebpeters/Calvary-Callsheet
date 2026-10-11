
  async function updateServingPreference(
    value: number | null
  ) {
    if (!currentVolunteer) return;

    setSaving(true);
    setError("");
    setPreferenceMessage("");

    try {
      const { data, error: updateError } =
        await supabase.rpc(
          "set_my_serving_preference",
          {
            p_preference: value,
          }
        );

      if (updateError) {
        throw new Error(
          `Could not update serving preference: ${updateError.message}`
        );
      }

      if (!data) {
        throw new Error(
          "The server did not return your updated preference."
        );
      }

      setCurrentVolunteer(data as Volunteer);

      if (value === null) {
        setPreferenceMessage(
          "Your serving preference has been set to no preference."
        );
      } else {
        setPreferenceMessage(
          `Your preference has been saved as about ${value} ${
            value === 1 ? "service" : "services"
          } per month.`
        );
      }
    } catch (err) {
      console.error(
        "Serving preference update error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not update your serving preference."
      );
    } finally {
      setSaving(false);
    }
  }

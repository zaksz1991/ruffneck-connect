"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

type EventMode = "online" | "in_person" | "hybrid";
type EventStatus = "scheduled" | "cancelled" | "completed";

type CommunityEvent = {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  event_mode: EventMode;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  created_at: string;
};

type EventAttendee = {
  event_id: string;
  user_id: string;
  created_at: string;
  name: string;
};

type Props = {
  communityId: string;
  canManage: boolean;
  canRsvp: boolean;
};

type EventFormValues = {
  title: string;
  description: string;
  location: string;
  meetingUrl: string | null;
  eventMode: EventMode;
  startsAt: Date;
  endsAt: Date | null;
};

function formatEventDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (number: number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function eventModeLabel(mode: EventMode) {
  if (mode === "in_person") return "In person";
  if (mode === "hybrid") return "Hybrid";
  return "Online";
}

function validateEventForm(formData: FormData): {
  values?: EventFormValues;
  error?: string;
} {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const meetingUrlInput = String(formData.get("meeting_url") ?? "").trim();
  const eventMode = String(formData.get("event_mode") ?? "online");
  const startsAtInput = String(formData.get("starts_at") ?? "");
  const endsAtInput = String(formData.get("ends_at") ?? "");

  if (title.length < 3 || title.length > 120) {
    return {
      error: "Event title must contain between 3 and 120 characters.",
    };
  }

  if (description.length > 2000) {
    return { error: "The description cannot exceed 2,000 characters." };
  }

  if (location.length > 240) {
    return { error: "The location cannot exceed 240 characters." };
  }

  if (!["online", "in_person", "hybrid"].includes(eventMode)) {
    return { error: "Choose a valid event format." };
  }

  const startsAt = new Date(startsAtInput);

  if (!startsAtInput || Number.isNaN(startsAt.getTime())) {
    return { error: "Choose a valid event start date and time." };
  }

  if (startsAt.getTime() <= Date.now()) {
    return { error: "Choose a future start date and time." };
  }

  let endsAt: Date | null = null;

  if (endsAtInput) {
    endsAt = new Date(endsAtInput);

    if (
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return {
        error: "The event end time must be after its start time.",
      };
    }
  }

  let meetingUrl: string | null = null;

  if (meetingUrlInput) {
    try {
      const parsedUrl = new URL(meetingUrlInput);

      if (!["https:", "http:"].includes(parsedUrl.protocol)) {
        return {
          error: "The meeting link must begin with https:// or http://.",
        };
      }

      meetingUrl = parsedUrl.toString();
    } catch {
      return {
        error:
          "Enter a valid meeting link beginning with https:// or http://.",
      };
    }
  }

  return {
    values: {
      title,
      description,
      location,
      meetingUrl,
      eventMode: eventMode as EventMode,
      startsAt,
      endsAt,
    },
  };
}

function safeCsvValue(value: string) {
  const protectedValue = /^[\t\r ]*[=+\-@]/.test(value)
    ? `'${value}`
    : value;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function downloadAttendeeCsv(
  eventItem: CommunityEvent,
  attendees: EventAttendee[]
) {
  const rows = [
    ["Event title", "Event starts at", "Attendee", "RSVP recorded at"],
    ...attendees.map((attendee) => [
      eventItem.title,
      new Date(eventItem.starts_at).toISOString(),
      attendee.name,
      new Date(attendee.created_at).toISOString(),
    ]),
  ];

  const csv = rows
    .map((row) => row.map(safeCsvValue).join(","))
    .join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8",
  });

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeTitle =
    eventItem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) ||
    "community-event";

  anchor.href = objectUrl;
  anchor.download = `ruffneck-${safeTitle}-attendees.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function formatIcsUtc(value: string | Date) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadCalendarInvite(eventItem: CommunityEvent) {
  const eventPageUrl = new URL(window.location.href);
  eventPageUrl.hash = `community-event-${eventItem.id}`;

  const start = new Date(eventItem.starts_at);
  const end = eventItem.ends_at
    ? new Date(eventItem.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const description = [
    eventItem.description?.trim() || "",
    eventItem.meeting_url ? `Meeting link: ${eventItem.meeting_url}` : "",
    `Community event on RuffNeck Connect: ${eventPageUrl.toString()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RuffNeck Connect//Community Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventItem.id}@ruffneck-connect`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(eventItem.starts_at)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(eventItem.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(eventItem.location || "")}`,
    `URL:${eventItem.meeting_url || eventPageUrl.toString()}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeTitle =
    eventItem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) ||
    "community-event";

  anchor.href = objectUrl;
  anchor.download = `ruffneck-${safeTitle}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function CommunityEvents({
  communityId,
  canManage,
  canRsvp,
}: Props) {
  const supabase = useMemo(
    () => createClient() as unknown as SupabaseClient,
    []
  );

  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, boolean>>({});
  const [attendees, setAttendees] = useState<
    Record<string, EventAttendee[]>
  >({});
  const [attendeeError, setAttendeeError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setUserId(null);
        setEvents([]);
        setRsvps({});
        setAttendees({});
        setAttendeeError("");
        setError("Sign in again to view community events.");
        return;
      }

      setUserId(user.id);

      const { data, error: eventsError } = await supabase
        .from("community_events")
        .select(
          "id, community_id, created_by, title, description, location, meeting_url, event_mode, starts_at, ends_at, status, created_at"
        )
        .eq("community_id", communityId)
        .order("starts_at", { ascending: true })
        .limit(100);

      if (eventsError) {
        console.error("Load community events failed:", eventsError.message);
        setEvents([]);
        setRsvps({});
        setAttendees({});
        setAttendeeError("");
        setError(
          `Events could not be loaded: ${eventsError.message}`
        );
        return;
      }

      const rows = (data ?? []) as unknown as CommunityEvent[];

      // Render the primary event data before loading optional RSVP details.
      setEvents(rows);

      if (rows.length === 0) {
        setRsvps({});
        setAttendees({});
        setAttendeeError("");
        return;
      }

      const eventIds = rows.map((event) => event.id);

      const { data: myRsvps, error: rsvpError } = await supabase
        .from("community_event_rsvps")
        .select("event_id")
        .eq("user_id", user.id)
        .in("event_id", eventIds);

      if (rsvpError) {
        console.error("Load event RSVPs failed:", rsvpError.message);
        setRsvps({});
      } else {
        setRsvps(
          Object.fromEntries(
            (myRsvps ?? []).map((rsvp: { event_id: string }) => [
              rsvp.event_id,
              true,
            ])
          )
        );
      }

      if (!canManage) {
        setAttendees({});
        setAttendeeError("");
        return;
      }

      const { data: allRsvps, error: allRsvpsError } = await supabase
        .from("community_event_rsvps")
        .select("event_id, user_id, created_at")
        .in("event_id", eventIds)
        .order("created_at", { ascending: true });

      if (allRsvpsError) {
        console.error("Load attendee lists failed:", allRsvpsError.message);
        setAttendees({});
        setAttendeeError("Attendee lists could not be loaded.");
        return;
      }

      const attendeeRows = (allRsvps ?? []) as Array<{
        event_id: string;
        user_id: string;
        created_at: string;
      }>;

      const profileIds = Array.from(
        new Set(attendeeRows.map((item) => item.user_id))
      );

      const nameById: Record<string, string> = {};

      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds);

        if (!profilesError && profiles) {
          for (const profile of profiles as Array<{
            id: string;
            full_name: string | null;
          }>) {
            nameById[profile.id] =
              profile.full_name?.trim() || "Community member";
          }
        }
      }

      const grouped: Record<string, EventAttendee[]> = {};

      for (const item of attendeeRows) {
        if (!grouped[item.event_id]) grouped[item.event_id] = [];

        grouped[item.event_id].push({
          ...item,
          name: nameById[item.user_id] || "Community member",
        });
      }

      setAttendees(grouped);
      setAttendeeError("");
    } catch (loadError) {
      console.error("Load community events failed:", loadError);
      setError("A connection problem prevented events from loading.");
    } finally {
      setLoading(false);
    }
  }, [communityId, canManage, supabase]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function createEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (!canManage || creating) return;

    const form = formEvent.currentTarget;
    const validation = validateEventForm(new FormData(form));

    if (!validation.values) {
      setError(validation.error || "Check the event details.");
      setMessage("");
      return;
    }

    if (!userId) {
      setError("Your session has expired. Sign in again to create an event.");
      return;
    }

    const values = validation.values;

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const { data: createdEvent, error: insertError } = await supabase
        .from("community_events")
        .insert({
          community_id: communityId,
          created_by: userId,
          title: values.title,
          description: values.description || null,
          location: values.location || null,
          meeting_url: values.meetingUrl,
          event_mode: values.eventMode,
          starts_at: values.startsAt.toISOString(),
          ends_at: values.endsAt?.toISOString() ?? null,
        })
        .select(
          "id, community_id, created_by, title, description, location, meeting_url, event_mode, starts_at, ends_at, status, created_at"
        )
        .single();

      if (insertError || !createdEvent) {
        console.error(
          "Create community event failed:",
          insertError?.message ?? "No event record was returned"
        );
        setError(
          insertError
            ? `The event could not be created: ${insertError.message}`
            : "The event could not be created. No event record was returned."
        );
        return;
      }

      // Show the newly created event immediately, even if a later refresh fails.
      setEvents((current) => {
        const withoutDuplicate = current.filter(
          (eventItem) => eventItem.id !== createdEvent.id
        );

        return [...withoutDuplicate, createdEvent as CommunityEvent].sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime()
        );
      });

      setRsvps((current) => ({ ...current, [createdEvent.id]: false }));
      setAttendees((current) => ({ ...current, [createdEvent.id]: [] }));

      form.reset();
      setMessage("Community event created.");
      setError("");

      // Refresh secondary information without losing the newly created event.
      await loadEvents();
    } catch (createError) {
      console.error("Create community event failed:", createError);
      setError("A connection problem prevented the event from being created.");
    } finally {
      setCreating(false);
    }
  }

  async function saveEventChanges(
    formEvent: FormEvent<HTMLFormElement>,
    eventItem: CommunityEvent
  ) {
    formEvent.preventDefault();

    if (!canManage || savingEdit) return;

    if (
      eventItem.status !== "scheduled" ||
      new Date(eventItem.starts_at).getTime() <= Date.now()
    ) {
      setError("Only scheduled future events can be edited.");
      setEditingEventId(null);
      return;
    }

    const validation = validateEventForm(
      new FormData(formEvent.currentTarget)
    );

    if (!validation.values) {
      setError(validation.error || "Check the event details.");
      setMessage("");
      return;
    }

    const values = validation.values;

    setSavingEdit(true);
    setError("");
    setMessage("");

    try {
      const { data, error: updateError } = await supabase
        .from("community_events")
        .update({
          title: values.title,
          description: values.description || null,
          location: values.location || null,
          meeting_url: values.meetingUrl,
          event_mode: values.eventMode,
          starts_at: values.startsAt.toISOString(),
          ends_at: values.endsAt?.toISOString() ?? null,
        })
        .eq("id", eventItem.id)
        .eq("community_id", communityId)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();

      if (updateError || !data) {
        console.error(
          "Update community event failed:",
          updateError?.message ?? "No event row was updated"
        );
        setError(
          "The event could not be updated. It may have started or your permissions may have changed."
        );
        return;
      }

      setEditingEventId(null);
      setMessage("Event updated successfully.");
      await loadEvents();
    } catch (updateError) {
      console.error("Update community event failed:", updateError);
      setError("A connection problem prevented the event from being updated.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleRsvp(eventItem: CommunityEvent) {
    if (!canRsvp || !userId || busyEventId) return;

    if (
      eventItem.status !== "scheduled" ||
      new Date(eventItem.starts_at).getTime() <= Date.now()
    ) {
      setError("RSVP is only available for scheduled future events.");
      return;
    }

    setBusyEventId(eventItem.id);
    setError("");
    setMessage("");

    const alreadyGoing = Boolean(rsvps[eventItem.id]);

    try {
      const result = alreadyGoing
        ? await supabase
            .from("community_event_rsvps")
            .delete()
            .eq("event_id", eventItem.id)
            .eq("user_id", userId)
            .select("event_id")
        : await supabase
            .from("community_event_rsvps")
            .insert({
              event_id: eventItem.id,
              user_id: userId,
            })
            .select("event_id");

      if (result.error || !result.data?.length) {
        console.error(
          "Update event RSVP failed:",
          result.error?.message ?? "No RSVP row was changed"
        );
        setError(
          "Your RSVP could not be updated. Confirm that you are an active community member."
        );
        return;
      }

      setMessage(
        alreadyGoing
          ? "Your RSVP was cancelled."
          : "You are on the attendee list."
      );

      await loadEvents();
    } catch (rsvpError) {
      console.error("Update event RSVP failed:", rsvpError);
      setError("A connection problem prevented your RSVP from being updated.");
    } finally {
      setBusyEventId(null);
    }
  }

  async function cancelEvent(eventItem: CommunityEvent) {
    if (!canManage || busyEventId) return;

    if (
      eventItem.status !== "scheduled" ||
      new Date(eventItem.starts_at).getTime() <= Date.now()
    ) {
      setError("Only scheduled future events can be cancelled.");
      return;
    }

    if (
      !window.confirm(
        `Cancel "${eventItem.title}"? Members will see it as cancelled.`
      )
    ) {
      return;
    }

    setBusyEventId(eventItem.id);
    setError("");
    setMessage("");

    try {
      const { data, error: updateError } = await supabase
        .from("community_events")
        .update({ status: "cancelled" })
        .eq("id", eventItem.id)
        .eq("community_id", communityId)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();

      if (updateError || !data) {
        console.error(
          "Cancel community event failed:",
          updateError?.message ?? "No event row was updated"
        );
        setError(
          "The event could not be cancelled. It may have started or your permissions may have changed."
        );
        return;
      }

      setEditingEventId(null);
      setMessage("Event cancelled.");
      await loadEvents();
    } catch (cancelError) {
      console.error("Cancel community event failed:", cancelError);
      setError("A connection problem prevented the event from being cancelled.");
    } finally {
      setBusyEventId(null);
    }
  }

  const now = Date.now();

  const visibleEvents = events.filter((eventItem) => {
    if (showAll) return true;

    return (
      eventItem.status === "scheduled" &&
      new Date(eventItem.starts_at).getTime() >= now
    );
  });

  return (
    <section
      className="section rn-community-events"
      aria-labelledby="rn-community-events-heading"
    >
      <div className="section-heading rn-community-events-heading">
        <div>
          <span className="eyebrow">MEET · CONNECT · BUILD</span>
          <h2 id="rn-community-events-heading">Community events</h2>
          <p className="muted">
            Create meetups, share meeting details, and manage your RSVP.
          </p>
        </div>

        <div className="rn-community-events-heading-actions">
          <span className="status-badge status-active">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {canManage && (
        <details className="feature-card rn-community-event-create">
          <summary>Create an event</summary>

          <form className="rn-community-event-form" onSubmit={createEvent}>
            <label>
              Event title
              <input
                name="title"
                type="text"
                minLength={3}
                maxLength={120}
                required
                placeholder="e.g. Community networking session"
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                maxLength={2000}
                rows={3}
                placeholder="What will happen at this event?"
              />
            </label>

            <div className="rn-community-event-form-grid">
              <label>
                Event format
                <select name="event_mode" defaultValue="online">
                  <option value="online">Online</option>
                  <option value="in_person">In person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>

              <label>
                Location (optional)
                <input
                  name="location"
                  type="text"
                  maxLength={240}
                  placeholder="Venue or meeting location"
                />
              </label>

              <label>
                Starts at
                <input name="starts_at" type="datetime-local" required />
              </label>

              <label>
                Ends at (optional)
                <input name="ends_at" type="datetime-local" />
              </label>
            </div>

            <label>
              Meeting link (optional)
              <input
                name="meeting_url"
                type="url"
                maxLength={1000}
                placeholder="https://…"
              />
            </label>

            <div className="rn-community-event-form-footer">
              <p className="muted">
                Only community owners and active moderators can manage events.
              </p>

              <button
                className="button button-primary"
                type="submit"
                disabled={creating}
              >
                {creating ? "Creating…" : "Publish event"}
              </button>
            </div>
          </form>
        </details>
      )}

      <div
        className="rn-community-event-toolbar"
        aria-label="Filter community events"
      >
        <button
          type="button"
          className={`button ${
            showAll ? "button-secondary" : "button-primary"
          }`}
          onClick={() => setShowAll(false)}
          aria-pressed={!showAll}
        >
          Upcoming
        </button>

        <button
          type="button"
          className={`button ${
            showAll ? "button-primary" : "button-secondary"
          }`}
          onClick={() => setShowAll(true)}
          aria-pressed={showAll}
        >
          All events
        </button>
      </div>

      {error && (
        <p
          className="rn-community-event-message rn-community-event-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          className="rn-community-event-message rn-community-event-success"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}

      {loading && events.length === 0 ? (
        <div className="empty-state">
          <p>Loading community events…</p>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="empty-state">
          <h3>
            {showAll
              ? "No events have been published"
              : "No upcoming events"}
          </h3>
          <p>
            {canManage
              ? "Create an event to bring community members together."
              : "Check back later for community meetups and sessions."}
          </p>
        </div>
      ) : (
        <div className="rn-community-event-grid">
          {visibleEvents.map((eventItem) => {
            const isPast =
              new Date(eventItem.starts_at).getTime() < Date.now();
            const cancelled = eventItem.status === "cancelled";
            const completed = eventItem.status === "completed";
            const eventAttendees = attendees[eventItem.id] ?? [];
            const isBusy = busyEventId === eventItem.id;

            return (
              <article
                className="feature-card rn-community-event-card"
                key={eventItem.id}
                id={`community-event-${eventItem.id}`}
              >
                <div className="rn-community-event-card-top">
                  <span className="eyebrow">
                    {eventModeLabel(eventItem.event_mode)}
                  </span>

                  <span
                    className={`status-badge ${
                      cancelled ? "status-pending" : "status-active"
                    }`}
                  >
                    {cancelled
                      ? "Cancelled"
                      : completed || isPast
                        ? "Past event"
                        : "Scheduled"}
                  </span>
                </div>

                <h3>{eventItem.title}</h3>

                <p className="rn-community-event-date">
                  {formatEventDate(eventItem.starts_at)}
                </p>

                {eventItem.ends_at && (
                  <p className="muted">
                    Ends {formatEventDate(eventItem.ends_at)}
                  </p>
                )}

                {eventItem.description && (
                  <p className="rn-community-event-description">
                    {eventItem.description}
                  </p>
                )}

                {eventItem.location && (
                  <p className="muted">
                    <strong>Location:</strong> {eventItem.location}
                  </p>
                )}

                {eventItem.meeting_url && !cancelled && (
                  <p>
                    <a
                      href={eventItem.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open meeting link
                    </a>
                  </p>
                )}

                {canManage &&
                  editingEventId === eventItem.id &&
                  !cancelled &&
                  !completed &&
                  !isPast && (
                    <form
                      key={`edit-${eventItem.id}`}
                      className="rn-community-event-form rn-community-event-edit-form"
                      onSubmit={(formEvent) =>
                        void saveEventChanges(formEvent, eventItem)
                      }
                    >
                      <h4>Edit event</h4>

                      <label>
                        Event title
                        <input
                          name="title"
                          type="text"
                          minLength={3}
                          maxLength={120}
                          required
                          defaultValue={eventItem.title}
                        />
                      </label>

                      <label>
                        Description
                        <textarea
                          name="description"
                          maxLength={2000}
                          rows={3}
                          defaultValue={eventItem.description ?? ""}
                        />
                      </label>

                      <div className="rn-community-event-form-grid">
                        <label>
                          Event format
                          <select
                            name="event_mode"
                            defaultValue={eventItem.event_mode}
                          >
                            <option value="online">Online</option>
                            <option value="in_person">In person</option>
                            <option value="hybrid">Hybrid</option>
                          </select>
                        </label>

                        <label>
                          Location
                          <input
                            name="location"
                            type="text"
                            maxLength={240}
                            defaultValue={eventItem.location ?? ""}
                          />
                        </label>

                        <label>
                          Starts at
                          <input
                            name="starts_at"
                            type="datetime-local"
                            required
                            defaultValue={toLocalDateTimeInput(
                              eventItem.starts_at
                            )}
                          />
                        </label>

                        <label>
                          Ends at
                          <input
                            name="ends_at"
                            type="datetime-local"
                            defaultValue={toLocalDateTimeInput(
                              eventItem.ends_at
                            )}
                          />
                        </label>
                      </div>

                      <label>
                        Meeting link
                        <input
                          name="meeting_url"
                          type="url"
                          maxLength={1000}
                          placeholder="https://…"
                          defaultValue={eventItem.meeting_url ?? ""}
                        />
                      </label>

                      <div className="rn-community-event-form-footer">
                        <p className="muted">
                          Changes will be visible to community members.
                        </p>

                        <div className="rn-community-event-card-actions">
                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={savingEdit}
                          >
                            {savingEdit ? "Saving…" : "Save changes"}
                          </button>

                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => setEditingEventId(null)}
                            disabled={savingEdit}
                          >
                            Discard changes
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                {canManage && (
                  <div className="rn-community-event-attendance">
                    {attendeeError ? (
                      <p className="muted" role="status">
                        Attendee list unavailable.
                      </p>
                    ) : (
                      <>
                        <span className="status-badge status-active">
                          {eventAttendees.length} attending
                        </span>

                        <details className="rn-community-event-attendee-details">
                          <summary>View attendee list</summary>

                          {eventAttendees.length === 0 ? (
                            <p className="muted">No one has RSVP&apos;d yet.</p>
                          ) : (
                            <>
                              <ul className="rn-community-event-attendee-list">
                                {eventAttendees.map((attendee) => (
                                  <li
                                    key={`${attendee.event_id}-${attendee.user_id}`}
                                  >
                                    <span>{attendee.name}</span>
                                    <time dateTime={attendee.created_at}>
                                      {formatEventDate(attendee.created_at)}
                                    </time>
                                  </li>
                                ))}
                              </ul>

                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => {
                                  try {
                                    downloadAttendeeCsv(
                                      eventItem,
                                      eventAttendees
                                    );
                                    setError("");
                                    setMessage("Attendee CSV downloaded.");
                                  } catch (exportError) {
                                    console.error(
                                      "Download attendee CSV failed:",
                                      exportError
                                    );
                                    setError(
                                      "The attendee list could not be exported."
                                    );
                                  }
                                }}
                              >
                                Export attendees CSV
                              </button>
                            </>
                          )}
                        </details>
                      </>
                    )}
                  </div>
                )}

                <div className="rn-community-event-card-actions">
                  {canRsvp && !cancelled && !completed && !isPast && (
                    <button
                      className={`button ${
                        rsvps[eventItem.id]
                          ? "button-secondary"
                          : "button-primary"
                      }`}
                      type="button"
                      onClick={() => void toggleRsvp(eventItem)}
                      disabled={isBusy}
                    >
                      {isBusy
                        ? "Saving…"
                        : rsvps[eventItem.id]
                          ? "Cancel my RSVP"
                          : "I'm going"}
                    </button>
                  )}

                  {rsvps[eventItem.id] && (
                    <span className="status-badge status-active">
                      RSVP confirmed
                    </span>
                  )}

                  {!cancelled && !completed && !isPast && (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        try {
                          downloadCalendarInvite(eventItem);
                          setError("");
                          setMessage(
                            eventItem.ends_at
                              ? "Calendar invitation downloaded."
                              : "Calendar invitation downloaded with a one-hour duration."
                          );
                        } catch (calendarError) {
                          console.error(
                            "Download calendar invite failed:",
                            calendarError
                          );
                          setError(
                            "The calendar invitation could not be downloaded."
                          );
                        }
                      }}
                    >
                      Add to calendar
                    </button>
                  )}

                  {canManage &&
                    !cancelled &&
                    !completed &&
                    !isPast && (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          setError("");
                          setMessage("");
                          setEditingEventId((current) =>
                            current === eventItem.id ? null : eventItem.id
                          );
                        }}
                        disabled={savingEdit || isBusy}
                      >
                        {editingEventId === eventItem.id
                          ? "Close editor"
                          : "Edit event"}
                      </button>
                    )}

                  {canManage && !cancelled && !completed && !isPast && (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => void cancelEvent(eventItem)}
                      disabled={isBusy || savingEdit}
                    >
                      {isBusy ? "Processing…" : "Cancel event"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        .rn-community-events {
          margin-top: 1.5rem;
        }

        .rn-community-events-heading {
          align-items: flex-start;
          gap: 1rem;
        }

        .rn-community-events-heading-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.6rem;
        }

        .rn-community-event-create {
          margin-bottom: 1rem;
        }

        .rn-community-event-create summary {
          cursor: pointer;
          font-weight: 800;
        }

        .rn-community-event-form {
          display: grid;
          gap: 1rem;
          margin-top: 1rem;
        }

        .rn-community-event-form label {
          display: grid;
          gap: 0.4rem;
          font-weight: 650;
        }

        .rn-community-event-form input,
        .rn-community-event-form textarea,
        .rn-community-event-form select {
          width: 100%;
          min-width: 0;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 0.75rem 0.85rem;
          color: #10243b;
          background: #fff;
          font: inherit;
        }

        .rn-community-event-form input:focus,
        .rn-community-event-form textarea:focus,
        .rn-community-event-form select:focus {
          outline: 2px solid #00b4d8;
          outline-offset: 2px;
        }

        .rn-community-event-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .rn-community-event-form-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .rn-community-event-form-footer p {
          margin: 0;
        }

        .rn-community-event-edit-form {
          width: 100%;
          margin: 1rem 0;
          padding: 1rem;
          border: 1px solid #dbe4ee;
          border-radius: 12px;
          background: #f8fafc;
        }

        .rn-community-event-edit-form h4 {
          margin: 0;
          font-size: 1.05rem;
        }

        .rn-community-event-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin: 1rem 0;
        }

        .rn-community-event-message {
          margin: 0.75rem 0;
          padding: 0.8rem 1rem;
          border-radius: 10px;
          overflow-wrap: anywhere;
        }

        .rn-community-event-error {
          color: #9f1239;
          background: #fff1f2;
          border: 1px solid #fecdd3;
        }

        .rn-community-event-success {
          color: #166534;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .rn-community-event-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .rn-community-event-card {
          min-width: 0;
        }

        .rn-community-event-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .rn-community-event-card h3 {
          margin: 0.65rem 0 0.4rem;
          overflow-wrap: anywhere;
        }

        .rn-community-event-date {
          font-weight: 750;
          color: #087a98;
        }

        .rn-community-event-description {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          line-height: 1.6;
        }

        .rn-community-event-attendance {
          display: flex;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 0.65rem;
          margin-top: 0.85rem;
        }

        .rn-community-event-attendee-details {
          flex: 1 1 100%;
          min-width: 0;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.7rem;
          margin-top: 0.2rem;
        }

        .rn-community-event-attendee-details summary {
          cursor: pointer;
          font-weight: 750;
        }

        .rn-community-event-attendee-list {
          list-style: none;
          padding: 0;
          margin: 0.65rem 0;
          display: grid;
          gap: 0.45rem;
        }

        .rn-community-event-attendee-list li {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: flex-start;
          padding: 0.55rem 0.65rem;
          background: #f8fafc;
          border-radius: 8px;
        }

        .rn-community-event-attendee-list time {
          color: #64748b;
          font-size: 0.82rem;
        }

        .rn-community-event-card-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.6rem;
          margin-top: 1rem;
        }

        .rn-community-event-card a {
          overflow-wrap: anywhere;
        }

        .rn-community-event-card button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        @media (max-width: 700px) {
          .rn-community-event-form-grid,
          .rn-community-event-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-community-event-form-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-community-events-heading-actions {
            width: 100%;
          }

          .rn-community-event-attendee-list li {
            flex-direction: column;
            gap: 0.25rem;
          }
        }
      `}</style>
    </section>
  );
}
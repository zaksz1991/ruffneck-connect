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

async function shareEvent(eventItem: CommunityEvent): Promise<"shared" | "copied"> {
  const eventUrl = new URL(window.location.href);
  eventUrl.hash = `community-event-${eventItem.id}`;

  const shareData = {
    title: eventItem.title,
    text: [
      `Join this ${eventModeLabel(eventItem.event_mode).toLowerCase()} community event.`,
      `Date: ${formatEventDate(eventItem.starts_at)}`,
      eventItem.location ? `Location: ${eventItem.location}` : "",
      eventItem.meeting_url ? `Meeting link: ${eventItem.meeting_url}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    url: eventUrl.toString(),
  };

  if (
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare(shareData))
  ) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
    }
  }

  try {
    await navigator.clipboard.writeText(
      `${shareData.title}\n${shareData.text}\n${shareData.url}`
    );
    return "copied";
  } catch {
    const input = document.createElement("textarea");
    input.value = eventUrl.toString();
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();

    const copied = document.execCommand("copy");
    input.remove();

    if (!copied) {
      throw new Error("Copy to clipboard failed.");
    }

    return "copied";
  }
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
  const [sharingEventId, setSharingEventId] = useState<string | null>(null);
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
        setError(`Events could not be loaded: ${eventsError.message}`);
        return;
      }

      const rows = (data ?? []) as unknown as CommunityEvent[];
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

  async function handleShareEvent(eventItem: CommunityEvent) {
    if (sharingEventId) return;

    setSharingEventId(eventItem.id);
    setError("");
    setMessage("");

    try {
      const result = await shareEvent(eventItem);

      setMessage(
        result === "shared"
          ? "Event sharing opened."
          : "Event details and link copied. You can now share them."
      );
    } catch (shareError) {
      if (
        shareError instanceof Error &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      console.error("Share community event failed:", shareError);
      setError(
        "The event could not be shared automatically. Copy the page address from your browser to share it."
      );
    } finally {
      setSharingEventId(null);
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

  const upcomingCount = events.filter(
    (eventItem) =>
      eventItem.status === "scheduled" &&
      new Date(eventItem.starts_at).getTime() >= now
  ).length;

  return (
    <section
      className="section rn-community-events"
      aria-labelledby="rn-community-events-heading"
    >
      <div className="rn-events-intro">
        <div className="rn-events-intro-copy">
          <span className="rn-events-eyebrow">MEET · CONNECT · BUILD</span>
          <h2 id="rn-community-events-heading">Community events</h2>
          <p>
            Bring your community together through meetups, conversations, and
            shared opportunities.
          </p>
        </div>

        <div className="rn-events-summary">
          <div className="rn-events-stat">
            <span className="rn-events-stat-number">{events.length}</span>
            <span>Total events</span>
          </div>
          <div className="rn-events-stat">
            <span className="rn-events-stat-number">{upcomingCount}</span>
            <span>Upcoming</span>
          </div>
          <button
            className="rn-events-refresh"
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {canManage && (
        <details className="rn-event-create">
          <summary>
            <span className="rn-event-create-icon" aria-hidden="true">
              +
            </span>
            <span>
              <strong>Create an event</strong>
              <small>Publish a meetup for your community</small>
            </span>
            <span className="rn-event-create-chevron" aria-hidden="true">
              +
            </span>
          </summary>

          <form className="rn-event-form" onSubmit={createEvent}>
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

            <div className="rn-event-form-grid">
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

            <div className="rn-event-form-footer">
              <p>Only community owners and active moderators can manage events.</p>
              <button
                className="rn-event-button rn-event-button-primary"
                type="submit"
                disabled={creating}
              >
                {creating ? "Publishing…" : "Publish event"}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="rn-events-toolbar">
        <div className="rn-events-tabs" aria-label="Filter community events">
          <button
            type="button"
            className={!showAll ? "active" : ""}
            onClick={() => setShowAll(false)}
            aria-pressed={!showAll}
          >
            Upcoming
            <span>{upcomingCount}</span>
          </button>
          <button
            type="button"
            className={showAll ? "active" : ""}
            onClick={() => setShowAll(true)}
            aria-pressed={showAll}
          >
            All events
            <span>{events.length}</span>
          </button>
        </div>

        <span className="rn-events-timezone">
          Times shown in your local timezone
        </span>
      </div>

      {error && (
        <p className="rn-event-alert rn-event-alert-error" role="alert">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}

      {message && (
        <p
          className="rn-event-alert rn-event-alert-success"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">✓</span>
          {message}
        </p>
      )}

      {loading && events.length === 0 ? (
        <div className="rn-events-empty">
          <span className="rn-events-empty-icon" aria-hidden="true">
            ◷
          </span>
          <h3>Loading your events</h3>
          <p>Community events will appear here shortly.</p>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="rn-events-empty">
          <span className="rn-events-empty-icon" aria-hidden="true">
            ◷
          </span>
          <h3>{showAll ? "No events published yet" : "Nothing coming up"}</h3>
          <p>
            {canManage
              ? "Create your first event to bring community members together."
              : "Check back later for community meetups and sessions."}
          </p>
          {canManage && (
            <button
              className="rn-event-button rn-event-button-primary"
              type="button"
              onClick={() => {
                const details = document.querySelector<HTMLDetailsElement>(
                  ".rn-event-create"
                );
                if (details) {
                  details.open = true;
                  details.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }
              }}
            >
              + Create an event
            </button>
          )}
        </div>
      ) : (
        <div className="rn-events-list">
          {visibleEvents.map((eventItem) => {
            const isPast =
              new Date(eventItem.starts_at).getTime() < Date.now();
            const cancelled = eventItem.status === "cancelled";
            const completed = eventItem.status === "completed";
            const eventAttendees = attendees[eventItem.id] ?? [];
            const isBusy = busyEventId === eventItem.id;
            const isEditable =
              canManage &&
              !cancelled &&
              !completed &&
              !isPast &&
              eventItem.status === "scheduled";
            const statusLabel = cancelled
              ? "Cancelled"
              : completed
                ? "Completed"
                : isPast
                  ? "Past event"
                  : "Scheduled";

            return (
              <article
                className={`rn-event-card ${
                  cancelled
                    ? "rn-event-card-cancelled"
                    : completed || isPast
                      ? "rn-event-card-past"
                      : ""
                }`}
                key={eventItem.id}
                id={`community-event-${eventItem.id}`}
              >
                <div className="rn-event-card-accent" />

                <div className="rn-event-card-content">
                  <div className="rn-event-card-header">
                    <div className="rn-event-mode">
                      <span
                        className="rn-event-mode-dot"
                        aria-hidden="true"
                      />
                      {eventModeLabel(eventItem.event_mode)}
                    </div>

                    <span
                      className={`rn-event-status ${
                        cancelled
                          ? "is-cancelled"
                          : completed || isPast
                            ? "is-past"
                            : "is-scheduled"
                      }`}
                    >
                      <span aria-hidden="true">
                        {cancelled ? "×" : completed || isPast ? "✓" : "●"}
                      </span>
                      {statusLabel}
                    </span>
                  </div>

                  <h3 className="rn-event-title">{eventItem.title}</h3>

                  <div className="rn-event-details">
                    <div className="rn-event-detail">
                      <span className="rn-event-detail-icon" aria-hidden="true">
                        ◷
                      </span>
                      <div>
                        <strong>{formatEventDate(eventItem.starts_at)}</strong>
                        {eventItem.ends_at && (
                          <span>Ends {formatEventDate(eventItem.ends_at)}</span>
                        )}
                      </div>
                    </div>

                    {eventItem.location && (
                      <div className="rn-event-detail">
                        <span
                          className="rn-event-detail-icon"
                          aria-hidden="true"
                        >
                          ⌖
                        </span>
                        <span>{eventItem.location}</span>
                      </div>
                    )}
                  </div>

                  {eventItem.description && (
                    <p className="rn-event-description">
                      {eventItem.description}
                    </p>
                  )}

                  {eventItem.meeting_url && !cancelled && (
                    <a
                      className="rn-event-meeting-link"
                      href={eventItem.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span aria-hidden="true">↗</span>
                      Open meeting link
                    </a>
                  )}

                  {canManage &&
                    editingEventId === eventItem.id &&
                    isEditable && (
                      <form
                        key={`edit-${eventItem.id}`}
                        className="rn-event-form rn-event-edit-form"
                        onSubmit={(formEvent) =>
                          void saveEventChanges(formEvent, eventItem)
                        }
                      >
                        <h4>Edit event details</h4>

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

                        <div className="rn-event-form-grid">
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

                        <div className="rn-event-form-footer">
                          <p>Changes will be visible to community members.</p>
                          <div className="rn-event-actions">
                            <button
                              className="rn-event-button rn-event-button-primary"
                              type="submit"
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving…" : "Save changes"}
                            </button>
                            <button
                              className="rn-event-button rn-event-button-light"
                              type="button"
                              onClick={() => setEditingEventId(null)}
                              disabled={savingEdit}
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      </form>
                    )}

                  {canManage && (
                    <div className="rn-event-attendance">
                      {attendeeError ? (
                        <p className="rn-event-muted" role="status">
                          Attendee list unavailable.
                        </p>
                      ) : (
                        <>
                          <span className="rn-event-attendance-count">
                            <span aria-hidden="true">♙</span>
                            {eventAttendees.length} attending
                          </span>

                          <details className="rn-event-attendee-details">
                            <summary>View attendee list</summary>

                            {eventAttendees.length === 0 ? (
                              <p className="rn-event-muted">
                                No one has RSVP&apos;d yet.
                              </p>
                            ) : (
                              <>
                                <ul className="rn-event-attendee-list">
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
                                  className="rn-event-button rn-event-button-light"
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
                                  ↓ Export attendees CSV
                                </button>
                              </>
                            )}
                          </details>
                        </>
                      )}
                    </div>
                  )}

                  <div className="rn-event-card-footer">
                    <div className="rn-event-actions">
                      {canRsvp && !cancelled && !completed && !isPast && (
                        <button
                          className={`rn-event-button ${
                            rsvps[eventItem.id]
                              ? "rn-event-button-going"
                              : "rn-event-button-primary"
                          }`}
                          type="button"
                          onClick={() => void toggleRsvp(eventItem)}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? "Saving…"
                            : rsvps[eventItem.id]
                              ? "✓ Cancel my RSVP"
                              : "♙ I'm going"}
                        </button>
                      )}

                      {rsvps[eventItem.id] && (
                        <span className="rn-event-rsvp-confirmed">
                          ✓ RSVP confirmed
                        </span>
                      )}

                      {!cancelled && !completed && !isPast && (
                        <button
                          className="rn-event-button rn-event-button-light"
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
                          ▦ Add to calendar
                        </button>
                      )}

                      <button
                        className="rn-event-button rn-event-button-light"
                        type="button"
                        onClick={() => void handleShareEvent(eventItem)}
                        disabled={sharingEventId === eventItem.id}
                      >
                        {sharingEventId === eventItem.id
                          ? "Sharing…"
                          : "↗ Share event"}
                      </button>

                      {isEditable && (
                        <button
                          className="rn-event-button rn-event-button-light"
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
                            : "✎ Edit event"}
                        </button>
                      )}

                      {isEditable && (
                        <button
                          className="rn-event-button rn-event-button-danger"
                          type="button"
                          onClick={() => void cancelEvent(eventItem)}
                          disabled={isBusy || savingEdit}
                        >
                          {isBusy ? "Processing…" : "Cancel event"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        .rn-community-events {
          --rn-event-navy: #10243b;
          --rn-event-blue: #145df1;
          --rn-event-cyan: #00a7c7;
          --rn-event-muted: #64748b;
          --rn-event-border: #e2eaf4;
          --rn-event-surface: #ffffff;
          margin-top: 1.5rem;
          color: var(--rn-event-navy);
        }

        .rn-community-events *,
        .rn-community-events *::before,
        .rn-community-events *::after {
          box-sizing: border-box;
        }

        .rn-events-intro {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.5rem;
          flex-wrap: wrap;
          padding: clamp(1.2rem, 3vw, 2rem);
          margin-bottom: 1.25rem;
          border: 1px solid var(--rn-event-border);
          border-radius: 18px;
          background:
            radial-gradient(
              circle at 100% 0%,
              rgba(0, 180, 216, 0.11),
              transparent 42%
            ),
            linear-gradient(135deg, #ffffff 0%, #f7faff 100%);
          box-shadow: 0 8px 28px rgba(16, 36, 59, 0.045);
        }

        .rn-events-intro-copy {
          min-width: 0;
          flex: 1 1 300px;
        }

        .rn-events-eyebrow {
          display: inline-block;
          margin-bottom: 0.6rem;
          color: #087d9b;
          font-size: 0.72rem;
          font-weight: 850;
          letter-spacing: 0.14em;
        }

        .rn-events-intro h2 {
          margin: 0;
          color: var(--rn-event-navy);
          font-size: clamp(1.55rem, 3vw, 2rem);
          font-weight: 850;
          letter-spacing: -0.045em;
          line-height: 1.15;
        }

        .rn-events-intro-copy p {
          max-width: 560px;
          margin: 0.7rem 0 0;
          color: var(--rn-event-muted);
          line-height: 1.7;
        }

        .rn-events-summary {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .rn-events-stat {
          display: grid;
          gap: 0.15rem;
          min-width: 76px;
          color: var(--rn-event-muted);
          font-size: 0.76rem;
        }

        .rn-events-stat-number {
          color: var(--rn-event-navy);
          font-size: 1.55rem;
          font-weight: 850;
          line-height: 1.1;
        }

        .rn-events-refresh {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 42px;
          padding: 0.65rem 0.9rem;
          border: 1px solid #d6e2f1;
          border-radius: 10px;
          background: #fff;
          color: #164db6;
          font: inherit;
          font-size: 0.85rem;
          font-weight: 750;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease,
            transform 160ms ease;
        }

        .rn-events-refresh:hover:not(:disabled) {
          border-color: #a8c5ff;
          background: #f2f7ff;
          transform: translateY(-1px);
        }

        .rn-events-refresh:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .rn-events-refresh span {
          font-size: 1.2rem;
          line-height: 1;
        }

        .rn-event-create {
          margin-bottom: 1.25rem;
          overflow: hidden;
          border: 1px solid var(--rn-event-border);
          border-radius: 15px;
          background: var(--rn-event-surface);
          box-shadow: 0 4px 18px rgba(16, 36, 59, 0.035);
        }

        .rn-event-create > summary {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          min-height: 78px;
          padding: 1rem 1.2rem;
          list-style: none;
          cursor: pointer;
          transition: background 160ms ease;
        }

        .rn-event-create > summary::-webkit-details-marker {
          display: none;
        }

        .rn-event-create > summary:hover {
          background: #f8fbff;
        }

        .rn-event-create-icon {
          display: grid;
          place-items: center;
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #eaf2ff;
          color: var(--rn-event-blue);
          font-size: 1.7rem;
          font-weight: 500;
        }

        .rn-event-create > summary > span:nth-child(2) {
          display: grid;
          flex: 1;
          gap: 0.25rem;
        }

        .rn-event-create > summary strong {
          font-size: 0.98rem;
          font-weight: 800;
        }

        .rn-event-create > summary small {
          color: var(--rn-event-muted);
          font-size: 0.82rem;
        }

        .rn-event-create-chevron {
          color: #64748b;
          font-size: 1.4rem;
          transition: transform 160ms ease;
        }

        .rn-event-create[open] .rn-event-create-chevron {
          transform: rotate(45deg);
        }

        .rn-event-form {
          display: grid;
          gap: 1rem;
          min-width: 0;
          padding: 1.25rem;
          border-top: 1px solid var(--rn-event-border);
        }

        .rn-event-form label {
          display: grid;
          gap: 0.45rem;
          min-width: 0;
          color: var(--rn-event-navy);
          font-size: 0.86rem;
          font-weight: 750;
        }

        .rn-event-form input,
        .rn-event-form textarea,
        .rn-event-form select {
          display: block;
          width: 100%;
          min-width: 0;
          min-height: 44px;
          padding: 0.72rem 0.85rem;
          border: 1px solid #cbd8e8;
          border-radius: 10px;
          background: #fff;
          color: var(--rn-event-navy);
          font: inherit;
          font-size: 0.9rem;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .rn-event-form textarea {
          resize: vertical;
          line-height: 1.6;
        }

        .rn-event-form input::placeholder,
        .rn-event-form textarea::placeholder {
          color: #94a3b8;
        }

        .rn-event-form input:focus,
        .rn-event-form textarea:focus,
        .rn-event-form select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
        }

        .rn-event-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .rn-event-form-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-top: 0.25rem;
        }

        .rn-event-form-footer p {
          margin: 0;
          color: var(--rn-event-muted);
          font-size: 0.8rem;
          line-height: 1.5;
        }

        .rn-event-edit-form {
          margin: 1rem 0;
          padding: 1.15rem;
          border: 1px solid #dce7f6;
          border-radius: 13px;
          background: #f7faff;
        }

        .rn-event-edit-form h4 {
          margin: 0;
          color: var(--rn-event-navy);
          font-size: 1.05rem;
          font-weight: 850;
        }

        .rn-events-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.9rem;
          margin: 1.1rem 0;
        }

        .rn-events-tabs {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          max-width: 100%;
          padding: 0.3rem;
          border: 1px solid #e2eaf4;
          border-radius: 12px;
          background: #f2f6fb;
        }

        .rn-events-tabs button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 38px;
          padding: 0.55rem 0.85rem;
          border: 1px solid transparent;
          border-radius: 9px;
          background: transparent;
          color: #64748b;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 750;
          cursor: pointer;
          transition:
            color 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease;
        }

        .rn-events-tabs button span {
          display: inline-grid;
          place-items: center;
          min-width: 21px;
          height: 21px;
          padding: 0 0.3rem;
          border-radius: 6px;
          background: rgba(148, 163, 184, 0.16);
          font-size: 0.73rem;
        }

        .rn-events-tabs button.active {
          border-color: #d7e4ff;
          background: #fff;
          color: #145df1;
          box-shadow: 0 2px 6px rgba(16, 36, 59, 0.055);
        }

        .rn-events-tabs button.active span {
          background: #eaf1ff;
          color: #145df1;
        }

        .rn-events-timezone {
          color: var(--rn-event-muted);
          font-size: 0.78rem;
        }

        .rn-event-alert {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          margin: 0.9rem 0;
          padding: 0.85rem 1rem;
          border: 1px solid;
          border-radius: 11px;
          overflow-wrap: anywhere;
          font-size: 0.87rem;
          line-height: 1.6;
        }

        .rn-event-alert > span {
          display: grid;
          place-items: center;
          flex: 0 0 21px;
          width: 21px;
          height: 21px;
          border-radius: 50%;
          font-weight: 900;
        }

        .rn-event-alert-error {
          border-color: #fecdd3;
          background: #fff5f6;
          color: #9f1239;
        }

        .rn-event-alert-success {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }

        .rn-events-list {
          display: grid;
          gap: 1rem;
        }

        .rn-event-card {
          position: relative;
          display: grid;
          grid-template-columns: 5px minmax(0, 1fr);
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--rn-event-border);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 5px 22px rgba(16, 36, 59, 0.045);
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
          scroll-margin-top: 100px;
        }

        .rn-event-card:hover {
          border-color: #c7d8f1;
          box-shadow: 0 10px 30px rgba(16, 36, 59, 0.075);
          transform: translateY(-1px);
        }

        .rn-event-card-accent {
          background: linear-gradient(
            180deg,
            #145df1 0%,
            #00b4d8 100%
          );
        }

        .rn-event-card-cancelled .rn-event-card-accent {
          background: #e11d48;
        }

        .rn-event-card-past .rn-event-card-accent {
          background: #94a3b8;
        }

        .rn-event-card-content {
          min-width: 0;
          padding: clamp(1rem, 2.5vw, 1.4rem);
        }

        .rn-event-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.7rem;
        }

        .rn-event-mode {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: #526782;
          font-size: 0.8rem;
          font-weight: 800;
        }

        .rn-event-mode-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #0ea66b;
          box-shadow: 0 0 0 3px rgba(14, 166, 107, 0.11);
        }

        .rn-event-status {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.65rem;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 0.73rem;
          font-weight: 850;
          line-height: 1.3;
        }

        .rn-event-status.is-scheduled {
          border-color: #b7efd0;
          background: #eafbf2;
          color: #087443;
        }

        .rn-event-status.is-cancelled {
          border-color: #fecdd3;
          background: #fff1f2;
          color: #be123c;
        }

        .rn-event-status.is-past {
          border-color: #e2e8f0;
          background: #f1f5f9;
          color: #64748b;
        }

        .rn-event-title {
          margin: 0.8rem 0 1rem;
          color: var(--rn-event-navy);
          font-size: clamp(1.2rem, 2.4vw, 1.55rem);
          font-weight: 850;
          letter-spacing: -0.035em;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .rn-event-details {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem 1.5rem;
          margin: 0 0 0.85rem;
        }

        .rn-event-detail {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          min-width: 0;
          color: #415873;
          font-size: 0.85rem;
          line-height: 1.55;
        }

        .rn-event-detail > span:last-child,
        .rn-event-detail > div {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .rn-event-detail > div {
          display: grid;
          gap: 0.2rem;
        }

        .rn-event-detail strong {
          color: #233c5a;
          font-weight: 800;
        }

        .rn-event-detail > div > span {
          color: var(--rn-event-muted);
          font-size: 0.8rem;
        }

        .rn-event-detail-icon {
          display: inline-grid;
          place-items: center;
          flex: 0 0 30px;
          width: 30px;
          height: 30px;
          border: 1px solid #e2ebfa;
          border-radius: 9px;
          background: #f4f8ff;
          color: #2563eb;
          font-size: 1.1rem;
          font-weight: 800;
        }

        .rn-event-description {
          margin: 0.8rem 0;
          color: #526782;
          font-size: 0.9rem;
          line-height: 1.75;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .rn-event-meeting-link {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.3rem;
          color: #145df1;
          font-size: 0.85rem;
          font-weight: 800;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        .rn-event-meeting-link:hover {
          color: #0b45bf;
          text-decoration: underline;
        }

        .rn-event-attendance {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.7rem;
          margin-top: 1.1rem;
          padding-top: 1rem;
          border-top: 1px solid #edf1f7;
        }

        .rn-event-attendance-count {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: #415873;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .rn-event-attendance-count > span {
          color: #145df1;
          font-size: 1.05rem;
        }

        .rn-event-attendee-details {
          flex: 1 1 100%;
          min-width: 0;
          margin-top: 0.25rem;
          padding-top: 0.8rem;
          border-top: 1px dashed #dce5f0;
        }

        .rn-event-attendee-details summary {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: #145df1;
          font-size: 0.83rem;
          font-weight: 800;
          cursor: pointer;
        }

        .rn-event-attendee-details summary:hover {
          color: #0b45bf;
        }

        .rn-event-attendee-list {
          display: grid;
          gap: 0.45rem;
          padding: 0;
          margin: 0.75rem 0;
          list-style: none;
        }

        .rn-event-attendee-list li {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.7rem 0.8rem;
          border: 1px solid #e7edf5;
          border-radius: 9px;
          background: #f8faff;
          font-size: 0.83rem;
        }

        .rn-event-attendee-list li span {
          overflow-wrap: anywhere;
          font-weight: 700;
        }

        .rn-event-attendee-list time {
          flex-shrink: 0;
          color: var(--rn-event-muted);
          font-size: 0.75rem;
        }

        .rn-event-muted {
          color: var(--rn-event-muted);
          font-size: 0.83rem;
          line-height: 1.6;
        }

        .rn-event-card-footer {
          margin-top: 1.1rem;
          padding-top: 1rem;
          border-top: 1px solid #e9eff7;
        }

        .rn-event-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .rn-event-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 41px;
          max-width: 100%;
          padding: 0.65rem 0.9rem;
          border: 1px solid transparent;
          border-radius: 10px;
          font: inherit;
          font-size: 0.81rem;
          font-weight: 800;
          line-height: 1.35;
          text-align: center;
          text-decoration: none;
          overflow-wrap: anywhere;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease,
            color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .rn-event-button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .rn-event-button-primary {
          border-color: #145df1;
          background: linear-gradient(135deg, #1768ff, #1450d8);
          color: #fff;
          box-shadow: 0 3px 9px rgba(20, 93, 241, 0.16);
        }

        .rn-event-button-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #0e58e8, #103eb9);
          box-shadow: 0 5px 14px rgba(20, 93, 241, 0.23);
        }

        .rn-event-button-light {
          border-color: #d8e3f1;
          background: #fff;
          color: #334e70;
        }

        .rn-event-button-light:hover:not(:disabled) {
          border-color: #aac5f8;
          background: #f5f8ff;
          color: #145df1;
        }

        .rn-event-button-going {
          border-color: #a7e9c4;
          background: #edfcf3;
          color: #087443;
        }

        .rn-event-button-going:hover:not(:disabled) {
          border-color: #6fd7a0;
          background: #d8f8e6;
        }

        .rn-event-button-danger {
          border-color: #fecaca;
          background: #fff;
          color: #be123c;
        }

        .rn-event-button-danger:hover:not(:disabled) {
          border-color: #fda4af;
          background: #fff1f2;
        }

        .rn-event-button:focus-visible,
        .rn-events-refresh:focus-visible,
        .rn-events-tabs button:focus-visible,
        .rn-event-create > summary:focus-visible {
          outline: 3px solid rgba(20, 93, 241, 0.35);
          outline-offset: 3px;
        }

        .rn-event-button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
          transform: none;
          box-shadow: none;
        }

        .rn-event-rsvp-confirmed {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: #087443;
          font-size: 0.79rem;
          font-weight: 800;
        }

        .rn-events-empty {
          display: grid;
          justify-items: center;
          padding: clamp(2rem, 6vw, 3.5rem) 1.25rem;
          border: 1px dashed #cbd8e8;
          border-radius: 16px;
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(20, 93, 241, 0.06),
              transparent 65%
            ),
            #fbfdff;
          text-align: center;
        }

        .rn-events-empty-icon {
          display: grid;
          place-items: center;
          width: 58px;
          height: 58px;
          margin-bottom: 1rem;
          border: 1px solid #dbe7ff;
          border-radius: 17px;
          background: #edf4ff;
          color: #145df1;
          font-size: 2rem;
        }

        .rn-events-empty h3 {
          margin: 0;
          color: var(--rn-event-navy);
          font-size: 1.12rem;
          font-weight: 850;
        }

        .rn-events-empty p {
          max-width: 420px;
          margin: 0.55rem 0 1rem;
          color: var(--rn-event-muted);
          font-size: 0.87rem;
          line-height: 1.7;
        }

        @media (min-width: 1000px) {
          .rn-event-actions {
            gap: 0.65rem;
          }
        }

        @media (max-width: 700px) {
          .rn-events-intro {
            padding: 1.1rem;
            border-radius: 14px;
          }

          .rn-events-summary {
            width: 100%;
            gap: 0.85rem;
          }

          .rn-events-stat {
            flex: 1;
            min-width: 0;
          }

          .rn-events-refresh {
            margin-left: auto;
          }

          .rn-event-form-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-events-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-events-tabs {
            width: 100%;
          }

          .rn-events-tabs button {
            flex: 1;
            padding-inline: 0.5rem;
          }

          .rn-events-timezone {
            padding-left: 0.15rem;
          }

          .rn-event-card {
            grid-template-columns: 4px minmax(0, 1fr);
            border-radius: 13px;
          }

          .rn-event-card-content {
            padding: 1rem;
          }

          .rn-event-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .rn-event-actions > * {
            min-width: 0;
          }

          .rn-event-button {
            width: 100%;
            padding: 0.65rem 0.5rem;
            font-size: 0.77rem;
          }

          .rn-event-rsvp-confirmed {
            grid-column: 1 / -1;
            padding: 0.3rem 0;
          }

          .rn-event-form-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-event-form-footer > .rn-event-button,
          .rn-event-form-footer .rn-event-actions {
            width: 100%;
          }

          .rn-event-attendee-list li {
            flex-direction: column;
            gap: 0.3rem;
          }
        }

        @media (max-width: 390px) {
          .rn-events-summary {
            gap: 0.55rem;
          }

          .rn-events-stat-number {
            font-size: 1.3rem;
          }

          .rn-events-refresh {
            padding-inline: 0.6rem;
            font-size: 0.77rem;
          }

          .rn-event-card-header {
            align-items: flex-start;
          }

          .rn-event-actions {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-event-rsvp-confirmed {
            grid-column: auto;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-community-events *,
          .rn-community-events *::before,
          .rn-community-events *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </section>
  );
}
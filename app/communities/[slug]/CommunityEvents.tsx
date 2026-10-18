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

type Props = {
  communityId: string;
  canManage: boolean;
  canRsvp: boolean;
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function eventModeLabel(mode: EventMode) {
  if (mode === "in_person") return "In person";
  if (mode === "hybrid") return "Hybrid";
  return "Online";
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
  const safeTitle = eventItem.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "community-event";

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
  // Cast to the untyped client interface so newly created Supabase tables work
  // even when the project's generated Database type has not been regenerated.
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
        setError("Events could not be loaded. Check the community-events SQL setup.");
        return;
      }

      const rows = (data ?? []) as unknown as CommunityEvent[];
      setEvents(rows);

      if (rows.length === 0) {
        setRsvps({});
        return;
      }

      const { data: myRsvps, error: rsvpError } = await supabase
        .from("community_event_rsvps")
        .select("event_id")
        .eq("user_id", user.id)
        .in(
          "event_id",
          rows.map((event) => event.id)
        );

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
    } catch (loadError) {
      console.error("Load community events failed:", loadError);
      setError("A connection problem prevented events from loading.");
    } finally {
      setLoading(false);
    }
  }, [communityId, supabase]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function createEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!canManage || creating) return;

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const meetingUrlInput = String(formData.get("meeting_url") ?? "").trim();
    const eventMode = String(formData.get("event_mode") ?? "online") as EventMode;
    const startsAtInput = String(formData.get("starts_at") ?? "");
    const endsAtInput = String(formData.get("ends_at") ?? "");

    if (title.length < 3 || title.length > 120) {
      setError("Event title must contain between 3 and 120 characters.");
      return;
    }

    const startsAt = new Date(startsAtInput);
    if (!startsAtInput || Number.isNaN(startsAt.getTime())) {
      setError("Choose a valid event start date and time.");
      return;
    }
    if (startsAt.getTime() <= Date.now()) {
      setError("Choose a future start date and time.");
      return;
    }

    let endsAt: Date | null = null;
    if (endsAtInput) {
      endsAt = new Date(endsAtInput);
      if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() < startsAt.getTime()) {
        setError("The event end time must be after its start time.");
        return;
      }
    }

    if (description.length > 2000 || location.length > 240) {
      setError("Description or location exceeds the allowed length.");
      return;
    }

    let meetingUrl: string | null = null;
    if (meetingUrlInput) {
      try {
        const parsedUrl = new URL(meetingUrlInput);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Unsupported URL protocol");
        }
        meetingUrl = parsedUrl.toString();
      } catch {
        setError("Enter a valid meeting link beginning with https:// or http://.");
        return;
      }
    }

    if (!["online", "in_person", "hybrid"].includes(eventMode)) {
      setError("Choose a valid event format.");
      return;
    }

    if (!userId) {
      setError("Your session has expired. Sign in again to create an event.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    const { error: insertError } = await supabase
      .from("community_events")
      .insert({
        community_id: communityId,
        created_by: userId,
        title,
        description: description || null,
        location: location || null,
        meeting_url: meetingUrl,
        event_mode: eventMode,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
      });

    setCreating(false);

    if (insertError) {
      console.error("Create community event failed:", insertError.message);
      setError("The event could not be created. Check your permissions and try again.");
      return;
    }

    form.reset();
    setMessage("Community event created.");
    await loadEvents();
  }

  async function toggleRsvp(eventItem: CommunityEvent) {
    if (!canRsvp || !userId || busyEventId) return;
    if (eventItem.status !== "scheduled" || new Date(eventItem.starts_at) <= new Date()) {
      return;
    }

    setBusyEventId(eventItem.id);
    setError("");
    setMessage("");

    const alreadyGoing = Boolean(rsvps[eventItem.id]);
    const result = alreadyGoing
      ? await supabase
          .from("community_event_rsvps")
          .delete()
          .eq("event_id", eventItem.id)
          .eq("user_id", userId)
      : await supabase.from("community_event_rsvps").insert({
          event_id: eventItem.id,
          user_id: userId,
        });

    setBusyEventId(null);

    if (result.error) {
      console.error("Update event RSVP failed:", result.error.message);
      setError("Your RSVP could not be updated. Confirm that you are an active community member.");
      return;
    }

    setMessage(alreadyGoing ? "Your RSVP was cancelled." : "You are on the attendee list.");
    await loadEvents();
  }

  async function cancelEvent(eventItem: CommunityEvent) {
    if (!canManage || busyEventId) return;
    if (!window.confirm(`Cancel “${eventItem.title}”? Members will see it as cancelled.`)) {
      return;
    }

    setBusyEventId(eventItem.id);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("community_events")
      .update({ status: "cancelled" })
      .eq("id", eventItem.id)
      .eq("community_id", communityId)
      .eq("status", "scheduled");

    setBusyEventId(null);

    if (updateError) {
      console.error("Cancel community event failed:", updateError.message);
      setError("The event could not be cancelled. Check your permissions and try again.");
      return;
    }

    setMessage("Event cancelled.");
    await loadEvents();
  }

  const now = Date.now();
  const visibleEvents = events.filter((eventItem) => {
    if (showAll) return true;
    return eventItem.status === "scheduled" && new Date(eventItem.starts_at).getTime() >= now;
  });

  return (
    <section className="section rn-community-events" aria-labelledby="rn-community-events-heading">
      <div className="section-heading rn-community-events-heading">
        <div>
          <span className="eyebrow">MEET · CONNECT · BUILD</span>
          <h2 id="rn-community-events-heading">Community events</h2>
          <p className="muted">Create meetups, share meeting details, and manage your RSVP.</p>
        </div>
        <div className="rn-community-events-heading-actions">
          <span className="status-badge status-active">{events.length} events</span>
          <button className="button button-secondary" type="button" onClick={() => void loadEvents()} disabled={loading}>
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
              <input name="title" type="text" minLength={3} maxLength={120} required placeholder="e.g. Community networking session" />
            </label>
            <label>
              Description
              <textarea name="description" maxLength={2000} rows={3} placeholder="What will happen at this event?" />
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
                <input name="location" type="text" maxLength={240} placeholder="Venue or meeting location" />
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
              <input name="meeting_url" type="url" maxLength={1000} placeholder="https://…" />
            </label>
            <div className="rn-community-event-form-footer">
              <p className="muted">Only community owners and active moderators can create or cancel events.</p>
              <button className="button button-primary" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Publish event"}
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="rn-community-event-toolbar" aria-label="Filter community events">
        <button type="button" className={`button ${showAll ? "button-secondary" : "button-primary"}`} onClick={() => setShowAll(false)} aria-pressed={!showAll}>
          Upcoming
        </button>
        <button type="button" className={`button ${showAll ? "button-primary" : "button-secondary"}`} onClick={() => setShowAll(true)} aria-pressed={showAll}>
          All events
        </button>
      </div>

      {error && <p className="rn-community-event-message rn-community-event-error" role="alert">{error}</p>}
      {message && <p className="rn-community-event-message rn-community-event-success" role="status" aria-live="polite">{message}</p>}

      {loading ? (
        <div className="empty-state"><p>Loading community events…</p></div>
      ) : visibleEvents.length === 0 ? (
        <div className="empty-state">
          <h3>{showAll ? "No events have been published" : "No upcoming events"}</h3>
          <p>{canManage ? "Create an event to bring community members together." : "Check back later for community meetups and sessions."}</p>
        </div>
      ) : (
        <div className="rn-community-event-grid">
          {visibleEvents.map((eventItem) => {
            const isPast = new Date(eventItem.starts_at).getTime() < Date.now();
            const cancelled = eventItem.status === "cancelled";
            return (
              <article
                className="feature-card rn-community-event-card"
                key={eventItem.id}
                id={`community-event-${eventItem.id}`}
              >
                <div className="rn-community-event-card-top">
                  <span className="eyebrow">{eventModeLabel(eventItem.event_mode)}</span>
                  <span className={`status-badge ${cancelled ? "status-pending" : "status-active"}`}>
                    {cancelled ? "Cancelled" : eventItem.status === "completed" || isPast ? "Past event" : "Scheduled"}
                  </span>
                </div>
                <h3>{eventItem.title}</h3>
                <p className="rn-community-event-date">{formatEventDate(eventItem.starts_at)}</p>
                {eventItem.ends_at && <p className="muted">Ends {formatEventDate(eventItem.ends_at)}</p>}
                {eventItem.description && <p className="rn-community-event-description">{eventItem.description}</p>}
                {eventItem.location && <p className="muted"><strong>Location:</strong> {eventItem.location}</p>}
                {eventItem.meeting_url && !cancelled && (
                  <p><a href={eventItem.meeting_url} target="_blank" rel="noopener noreferrer">Open meeting link</a></p>
                )}
                <div className="rn-community-event-card-actions">
                  {canRsvp && !cancelled && !isPast && eventItem.status === "scheduled" && (
                    <button
                      className={`button ${rsvps[eventItem.id] ? "button-secondary" : "button-primary"}`}
                      type="button"
                      onClick={() => void toggleRsvp(eventItem)}
                      disabled={busyEventId === eventItem.id}
                    >
                      {busyEventId === eventItem.id ? "Saving…" : rsvps[eventItem.id] ? "Cancel my RSVP" : "I'm going"}
                    </button>
                  )}
                  {rsvps[eventItem.id] && <span className="status-badge status-active">RSVP confirmed</span>}
                  {!cancelled && !isPast && eventItem.status === "scheduled" && (
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
                          console.error("Download event calendar invite failed:", calendarError);
                          setError("The calendar invitation could not be downloaded. Please try again.");
                        }
                      }}
                    >
                      Add to calendar
                    </button>
                  )}
                  {canManage && !cancelled && eventItem.status === "scheduled" && (
                    <button className="button button-secondary" type="button" onClick={() => void cancelEvent(eventItem)} disabled={busyEventId === eventItem.id}>
                      Cancel event
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx global>{`
        .rn-community-events { margin-top: 1.5rem; }
        .rn-community-events-heading { align-items: flex-start; gap: 1rem; }
        .rn-community-events-heading-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; }
        .rn-community-event-create { margin-bottom: 1rem; }
        .rn-community-event-create summary { cursor: pointer; font-weight: 800; }
        .rn-community-event-form { display: grid; gap: 1rem; margin-top: 1rem; }
        .rn-community-event-form label { display: grid; gap: .4rem; font-weight: 650; }
        .rn-community-event-form input, .rn-community-event-form textarea, .rn-community-event-form select { width: 100%; min-width: 0; border: 1px solid #cbd5e1; border-radius: 10px; padding: .75rem .85rem; color: #10243b; background: #fff; font: inherit; }
        .rn-community-event-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .rn-community-event-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .rn-community-event-form-footer p { margin: 0; }
        .rn-community-event-toolbar { display: flex; flex-wrap: wrap; gap: .6rem; margin: 1rem 0; }
        .rn-community-event-message { margin: .75rem 0; padding: .8rem 1rem; border-radius: 10px; }
        .rn-community-event-error { color: #9f1239; background: #fff1f2; border: 1px solid #fecdd3; }
        .rn-community-event-success { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
        .rn-community-event-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .rn-community-event-card { min-width: 0; }
        .rn-community-event-card-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
        .rn-community-event-card h3 { margin: .65rem 0 .4rem; overflow-wrap: anywhere; }
        .rn-community-event-date { font-weight: 750; color: #087a98; }
        .rn-community-event-description { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
        .rn-community-event-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; margin-top: 1rem; }
        .rn-community-event-card a { overflow-wrap: anywhere; }
        @media (max-width: 700px) {
          .rn-community-event-form-grid, .rn-community-event-grid { grid-template-columns: minmax(0, 1fr); }
          .rn-community-event-form-footer { align-items: stretch; flex-direction: column; }
          .rn-community-events-heading-actions { width: 100%; }
        }
      `}</style>
    </section>
  );
}

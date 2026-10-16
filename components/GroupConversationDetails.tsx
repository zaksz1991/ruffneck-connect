"use client";

import { useCallback, useEffect, useState } from "react";

type Participant = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type GroupDetails = {
  id: string;
  title: string | null;
  createdBy: string;
  createdAt: string;
  isCreator: boolean;
};

type Props = {
  conversationId: string;
  onClose?: () => void;
};

export default function GroupConversationDetails({ conversationId, onClose }: Props) {
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/groups/${encodeURIComponent(conversationId)}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load group details.");
      setGroup(payload.group as GroupDetails);
      setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load group details.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void loadDetails(); }, [loadDetails]);

  return (
    <section className="rn-group-details" aria-labelledby="rn-group-details-title">
      <header className="rn-group-details__header">
        <div>
          <p className="rn-group-details__eyebrow">GROUP CONVERSATION</p>
          <h2 id="rn-group-details-title">{group?.title || "Group details"}</h2>
          <p className="rn-group-details__count">
            {loading ? "Loading members…" : `${participants.length} active ${participants.length === 1 ? "member" : "members"}`}
          </p>
        </div>
        <div className="rn-group-details__actions">
          <button type="button" onClick={() => void loadDetails()} disabled={loading} className="rn-group-details__button">
            Refresh
          </button>
          {onClose && <button type="button" onClick={onClose} className="rn-group-details__button rn-group-details__button--quiet">Close</button>}
        </div>
      </header>

      {error && <p className="rn-group-details__error" role="alert">{error}</p>}
      {loading && <p className="rn-group-details__muted">Loading group information…</p>}
      {!loading && !error && (
        <>
          <div className="rn-group-details__meta">
            <span>Created {group?.createdAt ? new Date(group.createdAt).toLocaleDateString() : "—"}</span>
            {group?.isCreator && <span className="rn-group-details__badge">Group creator</span>}
          </div>
          <ul className="rn-group-details__list">
            {participants.map((participant) => {
              const name = participant.full_name?.trim() || "RuffNeck Connect member";
              return (
                <li key={participant.user_id} className="rn-group-details__member">
                  {participant.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="rn-group-details__avatar" src={participant.avatar_url} alt="" />
                  ) : (
                    <span className="rn-group-details__avatar rn-group-details__avatar--fallback" aria-hidden="true">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="rn-group-details__name">{name}</span>
                  {participant.user_id === group?.createdBy && <span className="rn-group-details__role">Creator</span>}
                </li>
              );
            })}
            {participants.length === 0 && <li className="rn-group-details__muted">No active members were returned.</li>}
          </ul>
        </>
      )}

      <style jsx>{`
        .rn-group-details{color:#e8f1ff;background:#0b1e3a;border:1px solid #25415f;border-radius:16px;padding:20px;max-width:560px;width:100%;box-sizing:border-box}
        .rn-group-details__header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
        .rn-group-details__eyebrow{font-size:11px;letter-spacing:.12em;color:#00b4d8;font-weight:700;margin:0 0 7px}
        h2{font-size:21px;line-height:1.25;margin:0;overflow-wrap:anywhere}
        .rn-group-details__count,.rn-group-details__muted{font-size:13px;color:#a9bbd0;margin:7px 0 0}
        .rn-group-details__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .rn-group-details__button{border:1px solid #355472;background:#102b4d;color:#e8f1ff;border-radius:9px;padding:8px 11px;font-size:12px;cursor:pointer}
        .rn-group-details__button:disabled{opacity:.55;cursor:wait}
        .rn-group-details__button--quiet{background:transparent}
        .rn-group-details__meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid #25415f;margin-top:17px;padding-top:13px;color:#a9bbd0;font-size:12px}
        .rn-group-details__badge{background:#173f52;color:#8cecff;border-radius:999px;padding:4px 8px}
        .rn-group-details__list{list-style:none;margin:12px 0 0;padding:0}
        .rn-group-details__member{display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid #1d3653;min-width:0}
        .rn-group-details__member:last-child{border-bottom:0}
        .rn-group-details__avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:0 0 36px}
        .rn-group-details__avatar--fallback{display:grid;place-items:center;background:#173f52;color:#8cecff;font-weight:700}
        .rn-group-details__name{font-size:14px;overflow-wrap:anywhere;flex:1}
        .rn-group-details__role{font-size:11px;color:#fbbf24;white-space:nowrap}
        .rn-group-details__error{background:#4a1f2b;color:#ffdce2;padding:10px;border-radius:8px;font-size:13px}
        @media(max-width:420px){.rn-group-details__header{flex-direction:column}.rn-group-details__actions{justify-content:flex-start}}
      `}</style>
    </section>
  );
}

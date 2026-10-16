"use client";

import { FormEvent, useState } from "react";

type Props = {
  onCreated: (conversationId: string) => void;
  onCancel?: () => void;
};

export default function GroupConversationCreator({ onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [participantIdsText, setParticipantIdsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const participantIds = participantIdsText
      .split(/[\n,;\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    setBusy(true);
    try {
      const response = await fetch("/api/conversations/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), participantIds }),
      });
      const result = (await response.json()) as { conversationId?: string; error?: string };
      if (!response.ok || !result.conversationId) throw new Error(result.error || "Could not create the group.");
      onCreated(result.conversationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rn-group-create" aria-labelledby="rn-group-create-title">
      <h2 id="rn-group-create-title">Create a group</h2>
      <label className="rn-group-create__field">
        <span>Group name</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required placeholder="e.g. Project Team" />
      </label>
      <label className="rn-group-create__field">
        <span>Participant user IDs</span>
        <textarea value={participantIdsText} onChange={(event) => setParticipantIdsText(event.target.value)} rows={4} placeholder="Paste user UUIDs separated by commas or new lines" />
        <small>Include at least two other users. Your account is added automatically.</small>
      </label>
      {error && <p className="rn-group-create__error" role="alert">{error}</p>}
      <div className="rn-group-create__actions">
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create group"}</button>
      </div>
      <style jsx>{`
        .rn-group-create{display:grid;gap:16px;width:100%;max-width:520px;padding:22px;border:1px solid #dbe4ee;border-radius:16px;background:#fff;color:#0b1e3a}
        h2{margin:0;font-size:1.2rem}.rn-group-create__field{display:grid;gap:7px;font-size:.92rem;font-weight:600}
        input,textarea{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit;font-weight:400;color:#0b1e3a;background:#fff}
        textarea{resize:vertical}.rn-group-create__field small{font-weight:400;color:#64748b;line-height:1.45}
        .rn-group-create__error{margin:0;color:#b91c1c;font-size:.9rem}.rn-group-create__actions{display:flex;justify-content:flex-end;gap:10px}
        button{padding:10px 14px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0b1e3a;font:inherit;font-weight:600;cursor:pointer}
        button[type=submit]{border-color:#0b1e3a;background:#0b1e3a;color:#fff}button:disabled{opacity:.55;cursor:not-allowed}
      `}</style>
    </form>
  );
}

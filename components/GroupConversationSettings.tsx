"use client";

import { FormEvent, useState } from "react";

type Props = {
  conversationId: string;
  currentTitle: string;
  isCreator: boolean;
  onRenamed?: (title: string) => void;
  onLeft?: () => void;
  onClose?: () => void;
};

export default function GroupConversationSettings({
  conversationId,
  currentTitle,
  isCreator,
  onRenamed,
  onLeft,
  onClose,
}: Props) {
  const [title, setTitle] = useState(currentTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 100) {
      setError("Group name must be between 1 and 100 characters.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/groups/${conversationId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not rename the group.");
      setTitle(cleanTitle);
      setNotice("Group name updated.");
      onRenamed?.(cleanTitle);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename the group.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveGroup() {
    if (!window.confirm("Leave this group? You will stop receiving its messages.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/conversations/groups/${conversationId}/leave`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not leave the group.");
      onLeft?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not leave the group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="group-settings-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="group-settings-title" className="text-lg font-semibold">Group settings</h2>
        {onClose && <button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Close</button>}
      </div>

      {isCreator ? (
        <form onSubmit={rename} className="space-y-3">
          <label htmlFor="group-title" className="block text-sm font-medium">Group name</label>
          <input id="group-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" />
          <button disabled={busy || title.trim() === currentTitle.trim()} type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : "Save group name"}</button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">Only the group creator can change the group name.</p>
      )}

      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="font-medium">Leave group</h3>
        <p className="mt-1 text-sm text-slate-600">You will no longer be an active member of this conversation.</p>
        <button type="button" disabled={busy || isCreator} onClick={leaveGroup} className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{isCreator ? "Creator cannot leave yet" : busy ? "Please wait…" : "Leave group"}</button>
        {isCreator && <p className="mt-2 text-xs text-slate-500">Transfer group ownership first. Ownership transfer is not included in this upgrade.</p>}
      </div>
    </section>
  );
}

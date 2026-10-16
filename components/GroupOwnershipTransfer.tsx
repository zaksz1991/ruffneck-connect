"use client";

import { useState } from "react";

type Member = {
  user_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  members: Member[];
  isCreator: boolean;
  onTransferred?: (newOwnerId: string) => void;
};

export default function GroupOwnershipTransfer({
  conversationId,
  currentUserId,
  members,
  isCreator,
  onTransferred,
}: Props) {
  const [newOwnerId, setNewOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isCreator) return null;

  const eligibleMembers = members.filter((member) => member.user_id !== currentUserId);

  async function transfer() {
    if (!newOwnerId || busy) return;
    const selected = eligibleMembers.find((member) => member.user_id === newOwnerId);
    if (!selected) {
      setError("Select an active group member.");
      return;
    }
    if (!window.confirm(`Transfer group ownership to ${selected.full_name || "this member"}? You will no longer be the group creator.`)) return;

    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const response = await fetch(`/api/conversations/groups/${encodeURIComponent(conversationId)}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Ownership transfer failed.");
      setSuccess(true);
      onTransferred?.(newOwnerId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ownership transfer failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="group-ownership-heading" className="rounded-xl border p-4">
      <h3 id="group-ownership-heading" className="font-semibold">Transfer group ownership</h3>
      <p className="mt-1 text-sm text-gray-600">Choose an active member to become the new group creator. This cannot be undone here.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          className="min-w-0 flex-1 rounded-lg border px-3 py-2"
          value={newOwnerId}
          onChange={(event) => setNewOwnerId(event.target.value)}
          disabled={busy || eligibleMembers.length === 0}
          aria-label="New group owner"
        >
          <option value="">Select a member</option>
          {eligibleMembers.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name || member.user_id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={transfer}
          disabled={busy || !newOwnerId || eligibleMembers.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Transferring…" : "Transfer ownership"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="mt-2 text-sm text-green-700">Ownership transferred. Refresh group details to update permissions.</p>}
    </section>
  );
}

"use client";

import { useState } from "react";

type GroupAdminRoleControlProps = {
  conversationId: string;
  userId: string;
  displayName: string;
  isAdmin: boolean;
  canManage: boolean;
  onUpdated?: () => void;
};

export default function GroupAdminRoleControl({
  conversationId,
  userId,
  displayName,
  isAdmin,
  canManage,
  onUpdated,
}: GroupAdminRoleControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!canManage) return null;

  async function updateRole() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/conversations/groups/${conversationId}/admins`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, isAdmin: !isAdmin }),
        },
      );

      const result = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not update this member's role.");
      }

      onUpdated?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "An unexpected error occurred.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group-admin-role-control">
      <span>{displayName}</span>
      <button type="button" onClick={updateRole} disabled={busy}>
        {busy ? "Saving…" : isAdmin ? "Remove admin" : "Make admin"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

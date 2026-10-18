"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  otherUserId: string;
};

export default function StartDirectConversationButton({
  otherUserId,
}: Props) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function startConversation() {
    if (working) return;
    setWorking(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_or_create_direct_conversation",
        { p_other_user_id: otherUserId }
      );

      if (rpcError) {
        const message = rpcError.message.toLowerCase();
        if (message.includes("accept the connection") || message.includes("accepted connection")) {
          throw new Error(
            "You must connect with this member and have your request accepted before starting a private chat."
          );
        }
        if (message.includes("blocked") || message.includes("block")) {
          throw new Error(
            "A private chat cannot be opened because a block is active between these accounts."
          );
        }
        if (message.includes("function") && message.includes("not found")) {
          throw new Error(
            "Private chat setup is incomplete. Apply the RuffNeck Connect SQL migrations in the installation instructions."
          );
        }
        throw new Error("The conversation could not be opened. Please try again.");
      }

      if (typeof data !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data)) {
        throw new Error("The server did not return a valid conversation. Please try again.");
      }

      router.push(`/messages/${data}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The conversation could not be opened. Please try again."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
      <button
        className="button button-primary"
        type="button"
        onClick={() => void startConversation()}
        disabled={working}
      >
        {working ? "Opening chat…" : "Start private chat"}
      </button>
      {error && (
        <p className="muted" role="alert" style={{ maxWidth: 420, margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

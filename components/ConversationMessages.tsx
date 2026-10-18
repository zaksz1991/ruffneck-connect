"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageForwardButton from "@/components/MessageForwardButton";
import ConversationAttachment, {
  ATTACHMENT_PREFIX,
  parseChatAttachment,
} from "@/components/ConversationAttachment";

type ConversationParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ReplyPreview = {
  id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
  forwarded_from_message_id?: string | null;
  reply_to?: ReplyPreview | null;
};

type MessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀"] as const;
type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const ATTACHMENT_BUCKET = "rn-chat-attachments";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ATTACHMENT_NAME_LENGTH = 120;

const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
};

type SendResponse = {
  message?: Message;
  error?: string;
};

type EditResponse = {
  message?: Message;
  error?: string;
};

type DeleteResponse = {
  deleted?: boolean;
  error?: string;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  participants: ConversationParticipantProfile[];
};

function sortAndLimit(messages: Message[]) {
  const byId = new Map<string, Message>();

  for (const message of messages) {
    if (!message.deleted_at) {
      byId.set(message.id, message);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const timeDifference =
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime();

    return timeDifference || left.id.localeCompare(right.id);
  });
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of incoming) {
    if (message.deleted_at) {
      byId.delete(message.id);
    } else {
      byId.set(message.id, {
        ...byId.get(message.id),
        ...message,
      });
    }
  }

  return sortAndLimit([...byId.values()]);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getReactionRowKey(
  reaction: Pick<MessageReaction, "message_id" | "user_id" | "emoji">
) {
  return JSON.stringify([
    reaction.message_id,
    reaction.user_id,
    reaction.emoji,
  ]);
}

function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\/\\]/g, "_")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, MAX_ATTACHMENT_NAME_LENGTH);

  return cleaned || "attachment";
}

function validateAttachment(file: File): string | null {
  if (file.size <= 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return "Files must be 10 MB or smaller.";
  }

  const type = file.type.toLowerCase();
  const allowedExtensions = ALLOWED_ATTACHMENT_TYPES[type];

  if (!allowedExtensions) {
    return "This file type is not supported. Upload JPG, PNG, WebP, PDF, DOC, DOCX, or TXT files.";
  }

  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;

  if (!allowedExtensions.includes(extension)) {
    return "The file extension does not match its reported file type.";
  }

  return null;
}

function getMessagePreview(body: string) {
  const attachment = parseChatAttachment(body);

  if (attachment) {
    return `Attachment: ${attachment.name}`;
  }

  return body;
}

export default function ConversationMessages({
  conversationId,
  currentUserId,
  initialMessages,
  participants,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState<Message[]>(() =>
    sortAndLimit(initialMessages)
  );

  const [messageSearch, setMessageSearch] = useState("");

  const filteredMessages = useMemo(() => {
    const query = messageSearch.trim().toLocaleLowerCase();

    if (!query) return messages;

    return messages.filter((message) => {
      const searchableBody = getMessagePreview(message.body);

      return searchableBody.toLocaleLowerCase().includes(query);
    });
  }, [messages, messageSearch]);

  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const replyingToRef = useRef<Message | null>(null);

  replyingToRef.current = replyingTo;

  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(
    null
  );
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );
  const [reactionRows, setReactionRows] = useState<MessageReaction[]>([]);
  const [togglingReactionKey, setTogglingReactionKey] = useState<string | null>(
    null
  );
  const [error, setError] = useState("");

  const [realtimeStatus, setRealtimeStatus] = useState<
    "Connecting" | "Connected" | "Reconnecting"
  >("Connecting");

  const [presenceStatus, setPresenceStatus] = useState<
    "Connecting" | "Connected" | "Reconnecting"
  >("Connecting");

  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const [hasMoreMessages, setHasMoreMessages] = useState(
    initialMessages.length >= 200
  );

  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const pendingOlderScroll = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const shouldAutoScroll = useRef(true);

  const reactionOverrides = useRef(
    new Map<string, MessageReaction | null>()
  );

  const liveOverridesRef = useRef(new Map<string, Message | null>());

  const visibleMessageIds = useMemo(
    () => messages.map((message) => message.id),
    [messages]
  );

  const visibleMessageIdsKey = visibleMessageIds.join(",");

  const visibleMessageIdsRef = useRef<Set<string>>(
    new Set(visibleMessageIds)
  );

  visibleMessageIdsRef.current = new Set(visibleMessageIds);

  const presenceChannelRef = useRef<
    ReturnType<typeof supabase.channel> | null
  >(null);

  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const remoteTypingTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );

  const lastTypingBroadcastAtRef = useRef(0);
  const typingSignalActiveRef = useRef(false);

  const participantIdsKey = useMemo(
    () =>
      [...new Set(participants.map((participant) => participant.user_id))]
        .sort()
        .join(","),
    [participants]
  );

  const reactionSummaries = useMemo(() => {
    const summaries = new Map<
      string,
      { count: number; reactedByMe: boolean }
    >();

    for (const reaction of reactionRows) {
      const key = `${reaction.message_id}|${reaction.emoji}`;

      const existing = summaries.get(key) ?? {
        count: 0,
        reactedByMe: false,
      };

      existing.count += 1;

      if (reaction.user_id === currentUserId) {
        existing.reactedByMe = true;
      }

      summaries.set(key, existing);
    }

    return summaries;
  }, [reactionRows, currentUserId]);

  async function hydrateReplyPreview(message: Message): Promise<Message> {
    if (!message.reply_to_message_id || message.reply_to) {
      return message;
    }

    const { data, error: replyError } = await supabase
      .from("messages")
      .select("id, sender_id, body, deleted_at")
      .eq("id", message.reply_to_message_id)
      .maybeSingle();

    if (replyError || !data) {
      return message;
    }

    return {
      ...message,
      reply_to: data as ReplyPreview,
    };
  }

  async function hydrateReplyPreviews(
    incomingMessages: Message[]
  ): Promise<Message[]> {
    const targetIds = [
      ...new Set(
        incomingMessages
          .filter(
            (message) => message.reply_to_message_id && !message.reply_to
          )
          .map((message) => message.reply_to_message_id as string)
      ),
    ];

    if (targetIds.length === 0) {
      return incomingMessages;
    }

    const { data, error: replyError } = await supabase
      .from("messages")
      .select("id, sender_id, body, deleted_at")
      .in("id", targetIds);

    if (replyError || !data) {
      if (replyError) {
        console.error(
          "Unable to load reply previews:",
          replyError.message
        );
      }

      return incomingMessages;
    }

    const replyMap = new Map<string, ReplyPreview>();

    for (const row of data as ReplyPreview[]) {
      replyMap.set(row.id, row);
    }

    return incomingMessages.map((message) => {
      if (!message.reply_to_message_id || message.reply_to) {
        return message;
      }

      return {
        ...message,
        reply_to: replyMap.get(message.reply_to_message_id) ?? null,
      };
    });
  }

  function beginReply(message: Message) {
    if (message.deleted_at || deletingMessageId) return;

    setError("");
    setReplyingTo(message);

    window.setTimeout(() => {
      document.getElementById("message-body")?.focus();
    }, 0);
  }

  function handleFileSelection(file: File | null) {
    setError("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validationError = validateAttachment(file);

    if (validationError) {
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setError(validationError);
      return;
    }

    setSelectedFile(file);
  }

  function clearSelectedFile() {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function sendAttachment(file: File) {
    if (sending || uploadingFile) return;

    const validationError = validateAttachment(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setUploadingFile(true);
    setError("");

    let uploadedPath: string | null = null;

    try {
      const safeName = sanitizeFileName(file.name);
      const uniqueName = `${crypto.randomUUID()}-${safeName}`;
      const path = `${conversationId}/${currentUserId}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `File upload failed: ${uploadError.message}`
        );
      }

      uploadedPath = path;

      const attachmentBody =
        ATTACHMENT_PREFIX +
        JSON.stringify({
          path,
          name: safeName,
          type: file.type,
          size: file.size,
        });

      if (attachmentBody.length > MAX_MESSAGE_LENGTH) {
        throw new Error("The attachment information is too large.");
      }

      const response = await fetch(
        `/api/messages/${conversationId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: attachmentBody,
            replyToMessageId: replyingTo?.id ?? null,
          }),
        }
      );

      const result = (await response.json()) as SendResponse;

      if (!response.ok || !result.message) {
        throw new Error(
          result.error || "The file uploaded but its message could not be sent."
        );
      }

      const messageWithReply = await hydrateReplyPreview(
        result.message as Message
      );

      shouldAutoScroll.current = true;

      setMessages((current) =>
        mergeMessages(current, [messageWithReply])
      );

      stopTyping();
      setReplyingTo(null);
      clearSelectedFile();
      setError("");
    } catch (sendError) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.error(
            "Unable to clean up an unsent attachment:",
            cleanupError.message
          );
        }
      }

      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send the attachment. Please try again."
      );
    } finally {
      setUploadingFile(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const messageIds = visibleMessageIdsKey
      ? visibleMessageIdsKey.split(",")
      : [];

    if (messageIds.length === 0) {
      setReactionRows([]);

      return () => {
        cancelled = true;
      };
    }

    async function loadReactions() {
      const { data, error: reactionLoadError } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji, created_at")
        .in("message_id", messageIds);

      if (cancelled) return;

      if (reactionLoadError) {
        console.error(
          "Unable to load message reactions:",
          reactionLoadError.message
        );
        return;
      }

      const byKey = new Map<string, MessageReaction>();

      for (const row of (data ?? []) as MessageReaction[]) {
        byKey.set(getReactionRowKey(row), row);
      }

      const visibleIds = new Set(messageIds);

      for (const [key, override] of reactionOverrides.current.entries()) {
        if (override === null) {
          byKey.delete(key);
          continue;
        }

        if (override && visibleIds.has(override.message_id)) {
          byKey.set(key, override);
        }
      }

      setReactionRows([...byKey.values()]);
    }

    void loadReactions();

    return () => {
      cancelled = true;
    };
  }, [visibleMessageIdsKey, supabase]);

  useEffect(() => {
    let disposed = false;

    const liveOverrides = liveOverridesRef.current;
    liveOverrides.clear();

    async function refreshMessages() {
      const { data, error: loadError } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id, forwarded_from_message_id"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);

      if (disposed) return;

      if (loadError) {
        console.error(
          "Unable to refresh conversation messages:",
          loadError.message
        );
        return;
      }

      const latestRows = ((data ?? []) as Message[]).reverse();
      const hydratedRows = await hydrateReplyPreviews(latestRows);

      if (disposed) return;

      if (latestRows.length < 200) {
        setHasMoreMessages(false);
      }

      setMessages((current) => {
        const byId = new Map<string, Message>(
          current.map((message) => [message.id, message])
        );

        for (const message of hydratedRows) {
          byId.set(message.id, {
            ...byId.get(message.id),
            ...message,
          });
        }

        for (const [messageId, message] of liveOverrides.entries()) {
          if (message) {
            byId.set(messageId, message);
          } else {
            byId.delete(messageId);
          }
        }

        return sortAndLimit([...byId.values()]);
      });
    }

    async function markConversationRead() {
      if (disposed || document.visibilityState !== "visible") return;

      const { error: markReadError } = await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)
        .eq("status", "active");

      if (markReadError) {
        console.error(
          "Unable to update conversation read timestamp:",
          markReadError.message
        );
      }
    }

    void markConversationRead();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void markConversationRead();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    const channel = supabase
      .channel(`conversation-messages-${conversationId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as unknown as Message;

          if (!incoming.id || incoming.deleted_at) return;

          const list = listRef.current;

          const distanceFromBottom = list
            ? list.scrollHeight - list.scrollTop - list.clientHeight
            : 0;

          shouldAutoScroll.current =
            incoming.sender_id === currentUserId ||
            distanceFromBottom < 160;

          liveOverrides.set(incoming.id, incoming);

          setMessages((current) => mergeMessages(current, [incoming]));

          if (incoming.reply_to_message_id) {
            void hydrateReplyPreview(incoming).then((hydrated) => {
              if (disposed) return;

              liveOverrides.set(hydrated.id, hydrated);

              setMessages((current) =>
                mergeMessages(current, [hydrated])
              );
            });
          }

          if (incoming.sender_id !== currentUserId) {
            void markConversationRead();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as unknown as Message;

          if (!updated.id) return;

          if (updated.deleted_at) {
            liveOverrides.set(updated.id, null);

            if (replyingToRef.current?.id === updated.id) {
              setReplyingTo(null);
            }

            const deletedTarget: ReplyPreview = {
              id: updated.id,
              sender_id: updated.sender_id,
              body: updated.body,
              deleted_at: updated.deleted_at,
            };

            setMessages((current) =>
              current
                .filter((message) => message.id !== updated.id)
                .map((message) =>
                  message.reply_to_message_id === updated.id
                    ? { ...message, reply_to: deletedTarget }
                    : message
                )
            );

            setReactionRows((current) =>
              current.filter(
                (reaction) => reaction.message_id !== updated.id
              )
            );

            return;
          }

          liveOverrides.set(updated.id, updated);

          const updatedReplySource: ReplyPreview = {
            id: updated.id,
            sender_id: updated.sender_id,
            body: updated.body,
            deleted_at: updated.deleted_at ?? null,
          };

          setMessages((current) =>
            mergeMessages(
              current.map((message) =>
                message.reply_to_message_id === updated.id
                  ? { ...message, reply_to: updatedReplySource }
                  : message
              ),
              [updated]
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const incoming = payload.new as unknown as MessageReaction;

          if (
            !incoming.message_id ||
            !visibleMessageIdsRef.current.has(incoming.message_id)
          ) {
            return;
          }

          const key = getReactionRowKey(incoming);
          reactionOverrides.current.set(key, incoming);

          setReactionRows((current) =>
            current.some((row) => getReactionRowKey(row) === key)
              ? current
              : [...current, incoming]
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const removed = payload.old as unknown as MessageReaction;

          if (
            !removed.message_id ||
            !removed.user_id ||
            !removed.emoji
          ) {
            return;
          }

          if (!visibleMessageIdsRef.current.has(removed.message_id)) {
            return;
          }

          const key = getReactionRowKey(removed);
          reactionOverrides.current.set(key, null);

          setReactionRows((current) =>
            current.filter((row) => getReactionRowKey(row) !== key)
          );
        }
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === "SUBSCRIBED") {
          setRealtimeStatus("Connected");
          void refreshMessages();
          void markConversationRead();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("Reconnecting");
        } else {
          setRealtimeStatus("Connecting");
        }
      });

    return () => {
      disposed = true;

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  useEffect(() => {
    let disposed = false;

    const participantIds = new Set(
      participantIdsKey.split(",").filter(Boolean)
    );

    const remoteTypingTimers = remoteTypingTimersRef.current;

    const channel = supabase.channel(
      `conversation-presence:${conversationId}`,
      {
        config: {
          private: true,
          presence: { key: currentUserId },
        },
      }
    );

    presenceChannelRef.current = channel;

    const syncPresence = () => {
      if (disposed) return;

      const state = channel.presenceState<{
        user_id?: string;
        online_at?: string;
      }>();

      const onlineIds = Object.entries(state)
        .filter(
          ([userId, metas]) =>
            userId !== currentUserId &&
            participantIds.has(userId) &&
            Array.isArray(metas) &&
            metas.length > 0
        )
        .map(([userId]) => userId);

      setOnlineUserIds(onlineIds);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (
          disposed ||
          !payload ||
          typeof payload.user_id !== "string"
        ) {
          return;
        }

        const typingUserId = payload.user_id as string;

        if (
          typingUserId === currentUserId ||
          !participantIds.has(typingUserId)
        ) {
          return;
        }

        const existingTimer = remoteTypingTimers.get(typingUserId);

        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        if (payload.is_typing !== true) {
          remoteTypingTimers.delete(typingUserId);

          setTypingUserIds((current) =>
            current.filter((userId) => userId !== typingUserId)
          );

          return;
        }

        setTypingUserIds((current) =>
          current.includes(typingUserId)
            ? current
            : [...current, typingUserId]
        );

        remoteTypingTimers.set(
          typingUserId,
          setTimeout(() => {
            remoteTypingTimers.delete(typingUserId);

            setTypingUserIds((current) =>
              current.filter((userId) => userId !== typingUserId)
            );
          }, 2400)
        );
      })
      .subscribe((status) => {
        if (disposed) return;

        if (status === "SUBSCRIBED") {
          setPresenceStatus("Connected");

          void channel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });

          syncPresence();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setPresenceStatus("Reconnecting");
          setOnlineUserIds([]);
          setTypingUserIds([]);
        } else {
          setPresenceStatus("Connecting");
        }
      });

    return () => {
      disposed = true;

      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }

      for (const timer of remoteTypingTimers.values()) {
        clearTimeout(timer);
      }

      remoteTypingTimers.clear();
      typingSignalActiveRef.current = false;

      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }

      setOnlineUserIds([]);
      setTypingUserIds([]);

      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, participantIdsKey, supabase]);

  useEffect(() => {
    const list = listRef.current;
    const previousScroll = pendingOlderScroll.current;

    if (list && previousScroll) {
      pendingOlderScroll.current = null;

      list.scrollTop =
        previousScroll.scrollTop +
        (list.scrollHeight - previousScroll.scrollHeight);

      return;
    }

    if (shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });

      shouldAutoScroll.current = false;
    }
  }, [messages]);

  async function loadOlderMessages() {
    if (
      loadingOlderMessages ||
      !hasMoreMessages ||
      messages.length === 0
    ) {
      return;
    }

    const oldestMessage = messages[0];
    const list = listRef.current;

    if (!oldestMessage || !list) return;

    setLoadingOlderMessages(true);
    setError("");

    try {
      const { data, error: historyError } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id, forwarded_from_message_id"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .or(
          `created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);

      if (historyError) {
        throw new Error(historyError.message);
      }

      const olderMessages = ((data ?? []) as Message[]).reverse();

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const hydratedOlderMessages =
        await hydrateReplyPreviews(olderMessages);

      pendingOlderScroll.current = {
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
      };

      shouldAutoScroll.current = false;

      setMessages((current) =>
        mergeMessages(hydratedOlderMessages, current)
      );

      if (olderMessages.length < 50) {
        setHasMoreMessages(false);
      }
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? `Unable to load earlier messages: ${historyError.message}`
          : "Unable to load earlier messages. Please try again."
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  function beginEdit(message: Message) {
    if (parseChatAttachment(message.body)) {
      setError("File attachment messages cannot be edited.");
      return;
    }

    setError("");
    setEditingMessageId(message.id);
    setEditDraft(message.body);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const messageId = editingMessageId;
    const body = editDraft.trim();

    if (!messageId || savingEdit) return;

    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      setError(
        "Edited messages must contain between 1 and 5,000 characters."
      );
      return;
    }

    setSavingEdit(true);
    setError("");

    try {
      const response = await fetch(
        `/api/messages/${conversationId}/edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, body }),
        }
      );

      const result = (await response.json()) as EditResponse;

      if (!response.ok || !result.message) {
        throw new Error(result.error || "Unable to edit this message.");
      }

      const updatedMessage = result.message as Message;

      liveOverridesRef.current.set(updatedMessage.id, updatedMessage);

      const updatedReplySource: ReplyPreview = {
        id: updatedMessage.id,
        sender_id: updatedMessage.sender_id,
        body: updatedMessage.body,
        deleted_at: updatedMessage.deleted_at ?? null,
      };

      setMessages((current) =>
        mergeMessages(
          current.map((message) =>
            message.reply_to_message_id === updatedMessage.id
              ? { ...message, reply_to: updatedReplySource }
              : message
          ),
          [updatedMessage]
        )
      );

      setEditingMessageId(null);
      setEditDraft("");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Unable to edit this message. Please try again."
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (deletingMessageId) return;

    const confirmed = window.confirm(
      "Delete this message? It will be hidden from the conversation."
    );

    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setError("");

    try {
      const response = await fetch(
        `/api/messages/${conversationId}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        }
      );

      const result = (await response.json()) as DeleteResponse;

      if (!response.ok || !result.deleted) {
        throw new Error(result.error || "Unable to delete this message.");
      }

      liveOverridesRef.current.set(messageId, null);

      const deletedTarget = messages.find(
        (message) => message.id === messageId
      );

      if (replyingTo?.id === messageId) {
        setReplyingTo(null);
      }

      setMessages((current) =>
        current
          .filter((message) => message.id !== messageId)
          .map((message) =>
            message.reply_to_message_id === messageId && deletedTarget
              ? {
                  ...message,
                  reply_to: {
                    id: deletedTarget.id,
                    sender_id: deletedTarget.sender_id,
                    body: deletedTarget.body,
                    deleted_at: new Date().toISOString(),
                  },
                }
              : message
          )
      );

      if (editingMessageId === messageId) {
        cancelEdit();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this message. Please try again."
      );
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function toggleReaction(
    messageId: string,
    emoji: ReactionEmoji
  ) {
    const existing = reactionRows.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === currentUserId &&
        reaction.emoji === emoji
    );

    const toggleKey = `${messageId}|${emoji}`;

    if (togglingReactionKey) return;

    setTogglingReactionKey(toggleKey);
    setError("");

    try {
      if (existing) {
        const { error: deleteError } = await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("emoji", emoji);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        reactionOverrides.current.set(getReactionRowKey(existing), null);

        setReactionRows((current) =>
          current.filter(
            (row) => getReactionRowKey(row) !== getReactionRowKey(existing)
          )
        );
      } else {
        const { data, error: insertError } = await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            user_id: currentUserId,
            emoji,
          })
          .select("message_id, user_id, emoji, created_at")
          .single();

        if (insertError) {
          throw new Error(insertError.message);
        }

        if (!data) {
          throw new Error("The reaction was not saved. Please try again.");
        }

        const reaction = data as MessageReaction;
        const key = getReactionRowKey(reaction);

        reactionOverrides.current.set(key, reaction);

        setReactionRows((current) =>
          current.some((row) => getReactionRowKey(row) === key)
            ? current
            : [...current, reaction]
        );
      }
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? `Unable to update reaction: ${reactionError.message}`
          : "Unable to update this reaction. Please try again."
      );
    } finally {
      setTogglingReactionKey(null);
    }
  }

  function sendTypingSignal(isTyping: boolean) {
    const channel = presenceChannelRef.current;

    if (!channel) return;

    if (isTyping) {
      const now = Date.now();

      if (now - lastTypingBroadcastAtRef.current < 700) {
        return;
      }

      lastTypingBroadcastAtRef.current = now;
    }

    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: currentUserId,
        is_typing: isTyping,
      },
    });
  }

  function stopTyping() {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (typingSignalActiveRef.current) {
      sendTypingSignal(false);
    }

    typingSignalActiveRef.current = false;
  }

  function handleDraftChange(value: string) {
    setDraft(value);

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (!value.trim()) {
      stopTyping();
      return;
    }

    typingSignalActiveRef.current = true;
    sendTypingSignal(true);

    typingStopTimerRef.current = setTimeout(() => {
      if (typingSignalActiveRef.current) {
        sendTypingSignal(false);
      }

      typingSignalActiveRef.current = false;
      typingStopTimerRef.current = null;
    }, 1600);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sending || uploadingFile) return;

    if (selectedFile) {
      await sendAttachment(selectedFile);
      return;
    }

    const body = draft.trim();

    if (!body) return;

    if (body.length > MAX_MESSAGE_LENGTH) {
      setError("Messages cannot exceed 5,000 characters.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/messages/${conversationId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            replyToMessageId: replyingTo?.id ?? null,
          }),
        }
      );

      const result = (await response.json()) as SendResponse;

      if (!response.ok || !result.message) {
        throw new Error(result.error || "Unable to send your message.");
      }

      shouldAutoScroll.current = true;

      const messageWithReply = await hydrateReplyPreview(
        result.message as Message
      );

      setMessages((current) =>
        mergeMessages(current, [messageWithReply])
      );

      stopTyping();
      setDraft("");
      setReplyingTo(null);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  const otherParticipants = participants.filter(
    (participant) => participant.user_id !== currentUserId
  );

  const onlineParticipantNames = otherParticipants
    .filter((participant) => onlineUserIds.includes(participant.user_id))
    .map(
      (participant) =>
        participant.full_name?.trim() || "RuffNeck member"
    );

  const typingParticipantNames = otherParticipants
    .filter((participant) => typingUserIds.includes(participant.user_id))
    .map(
      (participant) =>
        participant.full_name?.trim() || "A participant"
    );

  return (
    <div className="message-panel">
      <p
        className="muted"
        aria-live="polite"
        style={{
          padding: "12px 24px 0",
          marginBottom: 0,
          fontSize: 12,
        }}
      >
        Live updates: {realtimeStatus} · Presence: {presenceStatus}
      </p>

      <div
        className="muted"
        aria-live="polite"
        style={{
          padding: "5px 24px 10px",
          fontSize: 12,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {otherParticipants.length > 0 && (
          <span>
            <span
              aria-hidden="true"
              style={{
                color: onlineParticipantNames.length ? "#16a34a" : "#9ca3af",
                marginRight: 5,
              }}
            >
              ●
            </span>
            {onlineParticipantNames.length > 0
              ? `${onlineParticipantNames.join(", ")} active here`
              : otherParticipants.length === 1
                ? "Other participant not active here"
                : "Other participants not active here"}
          </span>
        )}

        {typingParticipantNames.length > 0 && (
          <span>
            {typingParticipantNames.join(", ")}{" "}
            {typingParticipantNames.length === 1 ? "is" : "are"} typing…
          </span>
        )}
      </div>

      <div
        style={{
          padding: "8px 24px 10px",
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <label
          htmlFor="conversation-message-search"
          className="muted"
          style={{
            display: "block",
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          Search messages
        </label>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            id="conversation-message-search"
            type="search"
            value={messageSearch}
            onChange={(event) => setMessageSearch(event.target.value)}
            placeholder="Find words in this conversation…"
            maxLength={120}
            aria-describedby="conversation-message-search-status"
            style={{
              minWidth: 0,
              flex: 1,
              width: "100%",
              boxSizing: "border-box",
              padding: "9px 11px",
              border: "1px solid var(--border, #d1d5db)",
              borderRadius: 8,
              background: "var(--surface, #fff)",
              color: "inherit",
            }}
          />

          {messageSearch && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setMessageSearch("")}
              style={{
                padding: "7px 10px",
                whiteSpace: "nowrap",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <p
          id="conversation-message-search-status"
          className="muted"
          aria-live="polite"
          style={{
            fontSize: 12,
            margin: "6px 0 0",
          }}
        >
          {messageSearch.trim()
            ? `${filteredMessages.length} match${
                filteredMessages.length === 1 ? "" : "es"
              } in loaded messages`
            : `${messages.length} message${
                messages.length === 1 ? "" : "s"
              } loaded`}
          {hasMoreMessages
            ? " · Load earlier messages to search older history."
            : ""}
        </p>
      </div>

      <div
        ref={listRef}
        className="message-list"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {hasMoreMessages && messages.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0",
            }}
          >
            <button
              type="button"
              className="button-secondary"
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlderMessages}
            >
              {loadingOlderMessages
                ? "Loading earlier messages…"
                : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start the conversation</h2>
            <p className="muted">
              Send a message or share a file to begin discussing your shared
              interests or intention.
            </p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="empty-state">
            <h2>No matching messages</h2>
            <p className="muted">
              No loaded message contains “{messageSearch.trim()}”. Clear the
              search or load earlier messages to expand the search.
            </p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setMessageSearch("")}
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredMessages.map((message) => {
            const isOwnMessage = message.sender_id === currentUserId;

            const senderName = isOwnMessage
              ? "You"
              : participants.find(
                  (participant) => participant.user_id === message.sender_id
                )?.full_name?.trim() || "RuffNeck member";

            const attachment = parseChatAttachment(message.body);

            const replyTarget = message.reply_to_message_id
              ? messages.find((item) => item.id === message.reply_to_message_id) ??
                message.reply_to ??
                null
              : null;

            const replyTargetName = !replyTarget
              ? "Original message"
              : replyTarget.sender_id === currentUserId
                ? "You"
                : participants.find(
                    (participant) =>
                      participant.user_id === replyTarget.sender_id
                  )?.full_name?.trim() || "RuffNeck member";

            return (
              <article
                key={message.id}
                className={`message-bubble ${
                  isOwnMessage ? "message-own" : "message-other"
                }`}
              >
                <span className="message-sender">{senderName}</span>

                {message.reply_to_message_id && (
                  <div
                    style={{
                      marginTop: 8,
                      marginBottom: 8,
                      padding: "8px 10px",
                      borderLeft: "3px solid var(--cyan, #00b4d8)",
                      borderRadius: "0 8px 8px 0",
                      background: "rgba(0,180,216,0.08)",
                      maxWidth: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 3,
                      }}
                    >
                      Replying to {replyTargetName}
                    </div>

                    <div
                      className="muted"
                      style={{
                        fontSize: 12,
                        overflowWrap: "anywhere",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {replyTarget?.deleted_at
                        ? "Original message was deleted"
                        : replyTarget?.body
                          ? getMessagePreview(replyTarget.body).length > 180
                            ? `${getMessagePreview(replyTarget.body).slice(0, 177)}…`
                            : getMessagePreview(replyTarget.body)
                          : "Original message is unavailable"}
                    </div>
                  </div>
                )}

                {message.forwarded_from_message_id && (
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      marginTop: 6,
                      fontStyle: "italic",
                    }}
                  >
                    Forwarded message
                  </div>
                )}

                {editingMessageId === message.id ? (
                  <form onSubmit={saveEdit} style={{ marginTop: 8 }}>
                    <label
                      htmlFor={`edit-message-${message.id}`}
                      className="muted"
                      style={{
                        display: "block",
                        marginBottom: 6,
                        fontSize: 12,
                      }}
                    >
                      Edit message
                    </label>

                    <textarea
                      id={`edit-message-${message.id}`}
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      maxLength={MAX_MESSAGE_LENGTH}
                      rows={3}
                      required
                      disabled={savingEdit}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        className="button-primary"
                        disabled={savingEdit || !editDraft.trim()}
                      >
                        {savingEdit ? "Saving…" : "Save edit"}
                      </button>
                    </div>
                  </form>
                ) : attachment ? (
                  <div style={{ marginTop: 8, maxWidth: "100%" }}>
                    <ConversationAttachment
                      attachment={attachment}
                      conversationId={conversationId}
                      currentUserId={currentUserId}
                    />
                  </div>
                ) : (
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {message.body}
                  </p>
                )}

                <time dateTime={message.created_at}>
                  {formatDate(message.created_at)}
                  {message.edited_at ? " · edited" : ""}
                </time>

                <div
                  aria-label="Message reactions"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {REACTION_EMOJIS.map((emoji) => {
                    const summary = reactionSummaries.get(
                      `${message.id}|${emoji}`
                    );

                    const selected = Boolean(summary?.reactedByMe);
                    const toggleKey = `${message.id}|${emoji}`;

                    return (
                      <button
                        key={emoji}
                        type="button"
                        className="button-secondary"
                        aria-label={`${emoji} reaction, ${
                          summary?.count ?? 0
                        } total`}
                        aria-pressed={selected}
                        title={
                          selected
                            ? `Remove ${emoji} reaction`
                            : `React with ${emoji}`
                        }
                        disabled={
                          Boolean(togglingReactionKey) ||
                          Boolean(deletingMessageId)
                        }
                        onClick={() => void toggleReaction(message.id, emoji)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 999,
                          padding: "4px 8px",
                          fontSize: 13,
                          lineHeight: 1.2,
                          borderColor: selected
                            ? "var(--cyan, #00b4d8)"
                            : "var(--border, #d1d5db)",
                          background: selected
                            ? "rgba(0,180,216,0.12)"
                            : "transparent",
                          opacity:
                            togglingReactionKey === toggleKey ? 0.65 : 1,
                        }}
                      >
                        <span aria-hidden="true">{emoji}</span>
                        {(summary?.count ?? 0) > 0 && (
                          <span>{summary?.count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {editingMessageId !== message.id && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <MessageForwardButton
                      sourceConversationId={conversationId}
                      messageId={message.id}
                      currentUserId={currentUserId}
                      disabled={
                        Boolean(deletingMessageId) ||
                        Boolean(message.deleted_at)
                      }
                    />

                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => beginReply(message)}
                      disabled={
                        Boolean(deletingMessageId) ||
                        message.deleted_at != null
                      }
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                      }}
                    >
                      Reply
                    </button>

                    {isOwnMessage && !attachment && (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => beginEdit(message)}
                          disabled={Boolean(deletingMessageId) || savingEdit}
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void deleteMessage(message.id)}
                          disabled={Boolean(deletingMessageId) || savingEdit}
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                          }}
                        >
                          {deletingMessageId === message.id
                            ? "Deleting…"
                            : "Delete"}
                        </button>
                      </>
                    )}

                    {isOwnMessage && attachment && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void deleteMessage(message.id)}
                        disabled={Boolean(deletingMessageId) || savingEdit}
                        style={{
                          padding: "5px 10px",
                          fontSize: 12,
                        }}
                      >
                        {deletingMessageId === message.id
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {error && (
        <div
          className="alert alert-error"
          role="alert"
          style={{ margin: 16 }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="message-compose">
        {replyingTo && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
              padding: 10,
              border: "1px solid var(--border, #d1d5db)",
              borderLeft: "3px solid var(--cyan, #00b4d8)",
              borderRadius: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 12 }}>
                Replying to{" "}
                {replyingTo.sender_id === currentUserId
                  ? "your message"
                  : participants.find(
                      (participant) =>
                        participant.user_id === replyingTo.sender_id
                    )?.full_name?.trim() || "RuffNeck member"}
              </strong>

              <p
                className="muted"
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {getMessagePreview(replyingTo.body).length > 180
                  ? `${getMessagePreview(replyingTo.body).slice(0, 177)}…`
                  : getMessagePreview(replyingTo.body)}
              </p>
            </div>

            <button
              type="button"
              className="button-secondary"
              aria-label="Cancel reply"
              title="Cancel reply"
              onClick={() => setReplyingTo(null)}
              disabled={sending || uploadingFile}
              style={{
                padding: "2px 8px",
                lineHeight: 1.5,
              }}
            >
              ×
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aria-label="Choose a file to attach"
            disabled={sending || uploadingFile}
            onChange={(event) => {
              handleFileSelection(event.target.files?.[0] ?? null);
            }}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          />

          <button
            type="button"
            className="button-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingFile}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "8px 12px",
            }}
          >
            Attach file
          </button>

          <span className="muted" style={{ fontSize: 12 }}>
            JPG, PNG, WebP, PDF, DOC, DOCX or TXT · Maximum 10 MB
          </span>
        </div>

        {selectedFile && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              marginBottom: 12,
              border: "1px solid var(--border, #d1d5db)",
              borderRadius: 8,
              background: "var(--surface, #fff)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  overflowWrap: "anywhere",
                  fontSize: 13,
                }}
              >
                {selectedFile.name}
              </strong>
              <span className="muted" style={{ fontSize: 12 }}>
                {formatFileSize(selectedFile.size)}
              </span>
            </div>

            <button
              type="button"
              className="button-secondary"
              onClick={clearSelectedFile}
              disabled={sending || uploadingFile}
              style={{
                padding: "5px 10px",
                fontSize: 12,
              }}
            >
              Remove file
            </button>
          </div>
        )}

        <label htmlFor="message-body">
          Your message
        </label>

        <textarea
          id="message-body"
          name="body"
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          onBlur={stopTyping}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          placeholder={
            selectedFile
              ? "Send the file first, then send your message separately..."
              : "Write a message..."
          }
          disabled={sending || uploadingFile}
        />

        <div className="message-compose-footer">
          <span className="muted">
            {draft.trim().length.toLocaleString()}/
            {MAX_MESSAGE_LENGTH.toLocaleString()} characters
          </span>

          <button
            type="submit"
            className="button-primary"
            disabled={
              sending ||
              uploadingFile ||
              (!draft.trim() && !selectedFile)
            }
          >
            {uploadingFile
              ? "Uploading file…"
              : sending
                ? "Sending…"
                : selectedFile
                  ? "Send file"
                  : "Send message"}
          </button>
        </div>
      </form>
    </div>
  );
}
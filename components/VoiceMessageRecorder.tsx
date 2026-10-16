"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  conversationId: string;
  onSent?: () => void;
};

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export default function VoiceMessageRecorder({ conversationId, onSent }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 300) stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function startRecording() {
    setError("");
    setAudioBlob(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.start();
    } catch {
      setError("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
    setSeconds(Math.min(300, Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000))));
  }

  async function sendRecording() {
    if (!audioBlob) return;
    setBusy(true);
    setError("");
    try {
      const extension = audioBlob.type.includes("ogg") ? "ogg" : audioBlob.type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("audio", audioBlob, `voice-message.${extension}`);
      form.append("durationSeconds", String(Math.max(1, seconds)));
      const response = await fetch(`/api/messages/${conversationId}/voice`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send voice message.");
      setAudioBlob(null);
      setSeconds(0);
      onSent?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send voice message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Voice message recorder" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {recording ? (
        <button type="button" onClick={stopRecording}>Stop recording ({Math.min(seconds, 300)}s)</button>
      ) : (
        <button type="button" onClick={startRecording} disabled={busy}>Record voice message</button>
      )}
      {audioBlob && !recording && (
        <>
          <audio controls src={URL.createObjectURL(audioBlob)} />
          <button type="button" onClick={sendRecording} disabled={busy}>{busy ? "Sending…" : "Send voice message"}</button>
          <button type="button" onClick={() => setAudioBlob(null)} disabled={busy}>Discard</button>
        </>
      )}
      {error && <p role="alert" style={{ width: "100%", margin: 0 }}>{error}</p>}
    </section>
  );
}

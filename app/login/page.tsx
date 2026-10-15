"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const nextPath = searchParams.get("next");
  const destination =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/home";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (mode === "signup" && fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.session) {
          router.replace(destination);
          router.refresh();
          return;
        }

        setMessage(
          "Account created. Check your email for a confirmation link before signing in."
        );
        setMode("signin");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        background: "#f5f8fc",
      }}
    >
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "clamp(28px, 6vw, 76px)",
          background: "#0b1e3a",
          color: "#ffffff",
        }}
      >
        <Link
          href="/"
          className="brand"
          style={{ color: "#ffffff", alignSelf: "flex-start" }}
        >
          <span className="brand-mark">RN</span>
          <span>RuffNeck Connect</span>
        </Link>

        <div style={{ maxWidth: 560, marginTop: 72 }}>
          <p className="eyebrow">COMMUNITY · COLLABORATION · ACTION</p>

          <h1
            style={{
              color: "#ffffff",
              fontSize: "clamp(34px, 5vw, 54px)",
              letterSpacing: "-1.5px",
            }}
          >
            Your next meaningful connection starts here.
          </h1>

          <p style={{ color: "#d5e4f4", fontSize: 17 }}>
            Find communities, share what you need, offer what you can, and
            connect with people ready to build something useful.
          </p>
        </div>

        <p
          style={{
            marginTop: 64,
            color: "#9fb5cf",
            fontSize: 13,
          }}
        >
          RuffNeck Connect · A RuffNeck Entertainment initiative
        </p>
      </section>

      <section
        style={{
          display: "grid",
          placeItems: "center",
          padding: "32px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 440 }}>
          <Link href="/" className="text-link">
            ← Back to home
          </Link>

          <div className="card" style={{ marginTop: 24, padding: 30 }}>
            <p className="eyebrow">
              {mode === "signin" ? "WELCOME BACK" : "JOIN THE NETWORK"}
            </p>

            <h1 style={{ marginBottom: 8, fontSize: 30 }}>
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h1>

            <p className="muted" style={{ marginBottom: 24 }}>
              {mode === "signin"
                ? "Sign in to continue to RuffNeck Connect."
                : "Create an account to start making meaningful connections."}
            </p>

            {error && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: 18 }}>
                {error}
              </div>
            )}

            {message && (
              <div className="alert alert-success" role="status" style={{ marginBottom: 18 }}>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="stack">
              {mode === "signup" && (
                <div className="form-field">
                  <label htmlFor="fullName">Full name</label>
                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter your full name"
                    maxLength={120}
                    required
                  />
                </div>
              )}

              <div className="form-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: "100%", marginTop: 8 }}
              >
                {loading
                  ? "Please wait..."
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            <hr className="divider" />

            <p style={{ marginBottom: 0, textAlign: "center" }}>
              <span className="muted">
                {mode === "signin"
                  ? "New to RuffNeck Connect? "
                  : "Already have an account? "}
              </span>

              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError("");
                  setMessage("");
                }}
                style={{
                  minHeight: "auto",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  color: "#008eac",
                }}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>

          <p
            className="muted"
            style={{ marginTop: 18, fontSize: 12, textAlign: "center" }}
          >
            Your account is managed through RuffNeck Entertainment&apos;s
            existing Supabase project.
          </p>
        </div>
      </section>
    </main>
  );
}
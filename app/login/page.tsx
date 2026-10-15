"use client";

import Link from "next/link";
import {
  Suspense,
  type FormEvent,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const nextPath = searchParams.get("next");

  const destination =
    nextPath &&
    nextPath.startsWith("/") &&
    !nextPath.startsWith("//") &&
    !nextPath.includes("\\")
      ? nextPath
      : "/home";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

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
        const { data, error: signUpError } =
          await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
              },
              emailRedirectTo: `${
                window.location.origin
              }/auth/callback?next=${encodeURIComponent(destination)}`,
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
          "Your account has been created. Check your email for a confirmation link before signing in."
        );

        setMode("signin");
        setPassword("");
        return;
      }

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
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

  function switchMode() {
    setMode((current) =>
      current === "signin" ? "signup" : "signin"
    );

    setError("");
    setMessage("");
    setPassword("");
    setShowPassword(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <Link href="/" className="auth-brand">
          <span className="auth-brand-mark">RN</span>

          <span className="auth-brand-name">
            RuffNeck <strong>Connect</strong>
          </span>
        </Link>

        <div className="auth-showcase-content">
          <span className="auth-label">
            COMMUNITY · COLLABORATION · ACTION
          </span>

          <h1>
            Good things happen when the right people connect.
          </h1>

          <p className="auth-showcase-description">
            Discover communities, share what you need, offer
            what you can, and collaborate with people ready
            to build something useful.
          </p>

          <div className="auth-benefits">
            <div className="auth-benefit">
              <span className="auth-benefit-icon">01</span>

              <div>
                <strong>Find your community</strong>
                <p>
                  Connect with people who share your interests
                  and goals.
                </p>
              </div>
            </div>

            <div className="auth-benefit">
              <span className="auth-benefit-icon">02</span>

              <div>
                <strong>Exchange meaningful support</strong>
                <p>
                  Ask for help, share resources, and offer
                  your skills.
                </p>
              </div>
            </div>

            <div className="auth-benefit">
              <span className="auth-benefit-icon">03</span>

              <div>
                <strong>Turn ideas into action</strong>
                <p>
                  Build relationships that lead to practical
                  outcomes.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="auth-showcase-footer">
          <span>RuffNeck Connect</span>
          <span>A RuffNeck Entertainment initiative</span>
        </footer>
      </section>

      <section className="auth-main">
        <div className="auth-mobile-brand">
          <Link href="/" className="auth-brand">
            <span className="auth-brand-mark">RN</span>

            <span className="auth-brand-name">
              RuffNeck <strong>Connect</strong>
            </span>
          </Link>
        </div>

        <div className="auth-form-container">
          <Link href="/" className="auth-back-link">
            <span aria-hidden="true">←</span>
            Back to home
          </Link>

          <div className="auth-card">
            <div className="auth-card-heading">
              <span className="auth-card-kicker">
                {mode === "signin"
                  ? "WELCOME BACK"
                  : "JOIN THE NETWORK"}
              </span>

              <h2>
                {mode === "signin"
                  ? "Sign in to your account"
                  : "Create your account"}
              </h2>

              <p>
                {mode === "signin"
                  ? "Pick up where you left off and reconnect with your community."
                  : "Create your account and start making meaningful connections."}
              </p>
            </div>

            <div className="auth-mode-switch" role="group" aria-label="Account access mode">
              <button
                type="button"
                className={
                  mode === "signin"
                    ? "auth-mode-option active"
                    : "auth-mode-option"
                }
                onClick={() => {
                  if (mode !== "signin") switchMode();
                }}
                aria-pressed={mode === "signin"}
                disabled={loading}
              >
                Sign in
              </button>

              <button
                type="button"
                className={
                  mode === "signup"
                    ? "auth-mode-option active"
                    : "auth-mode-option"
                }
                onClick={() => {
                  if (mode !== "signup") switchMode();
                }}
                aria-pressed={mode === "signup"}
                disabled={loading}
              >
                Create account
              </button>
            </div>

            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
                <span aria-hidden="true">!</span>
                <p>{error}</p>
              </div>
            )}

            {message && (
              <div
                className="auth-alert auth-alert-success"
                role="status"
              >
                <span aria-hidden="true">✓</span>
                <p>{message}</p>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="auth-form"
            >
              {mode === "signup" && (
                <div className="auth-field">
                  <label htmlFor="fullName">Full name</label>

                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(event.target.value)
                    }
                    placeholder="Enter your full name"
                    maxLength={120}
                    required
                    disabled={loading}
                  />
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="email">Email address</label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <div className="auth-password-label">
                  <label htmlFor="password">Password</label>

                  <button
                    type="button"
                    className="auth-show-password"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    disabled={loading}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "signin"
                      ? "current-password"
                      : "new-password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={loading}
                />

                {mode === "signup" && (
                  <span className="auth-field-hint">
                    Use at least 8 characters.
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="auth-spinner" aria-hidden="true" />
                    {mode === "signin"
                      ? "Signing you in..."
                      : "Creating your account..."}
                  </>
                ) : (
                  <>
                    {mode === "signin"
                      ? "Sign in"
                      : "Create account"}
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </form>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <p className="auth-switch-copy">
              {mode === "signin"
                ? "New to RuffNeck Connect?"
                : "Already have an account?"}

              <button
                type="button"
                className="auth-inline-link"
                onClick={switchMode}
                disabled={loading}
              >
                {mode === "signin"
                  ? "Create an account"
                  : "Sign in instead"}
              </button>
            </p>
          </div>

          <p className="auth-security-note">
            Your account is managed securely through RuffNeck
            Entertainment&apos;s Supabase authentication.
          </p>

          <p className="auth-legal">
            By using RuffNeck Connect, you agree to use the
            platform responsibly and respectfully.
          </p>
        </div>
      </section>

      <style jsx>{`
        .auth-page {
          --auth-navy: #0b1e3a;
          --auth-cyan: #00b4d8;
          --auth-gold: #fbbf24;
          --auth-text: #172b45;
          --auth-muted: #718096;
          --auth-border: #e2e8f0;

          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
          background: #f6f8fc;
          color: var(--auth-text);
        }

        .auth-showcase {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(28px, 4vw, 64px);
          background:
            radial-gradient(
              ellipse at 15% 20%,
              rgba(0, 180, 216, 0.16),
              transparent 45%
            ),
            linear-gradient(145deg, #0b1e3a 0%, #102b4d 100%);
          color: white;
          position: relative;
          overflow: hidden;
        }

        .auth-showcase::after {
          content: "";
          position: absolute;
          width: 300px;
          height: 300px;
          right: -150px;
          bottom: 12%;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 50%;
          box-shadow:
            0 0 0 40px rgba(255, 255, 255, 0.025),
            0 0 0 80px rgba(255, 255, 255, 0.02);
          pointer-events: none;
        }

        .auth-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          width: fit-content;
          text-decoration: none;
          color: inherit;
        }

        .auth-brand-mark {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border-radius: 13px;
          background: var(--auth-cyan);
          color: #062039;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -1px;
          box-shadow: 0 8px 24px rgba(0, 180, 216, 0.2);
        }

        .auth-brand-name {
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.5px;
        }

        .auth-brand-name strong {
          font-weight: 800;
        }

        .auth-showcase-content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 540px;
          margin: 60px auto;
        }

        .auth-label,
        .auth-card-kicker {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .auth-label {
          color: var(--auth-cyan);
        }

        .auth-showcase-content h1 {
          margin: 24px 0 20px;
          max-width: 520px;
          color: #fff;
          font-size: clamp(36px, 4.1vw, 57px);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -2px;
        }

        .auth-showcase-description {
          max-width: 470px;
          margin: 0;
          color: #c5d4e6;
          font-size: 16px;
          line-height: 1.85;
        }

        .auth-benefits {
          display: grid;
          gap: 25px;
          margin-top: 42px;
        }

        .auth-benefit {
          display: flex;
          align-items: flex-start;
          gap: 15px;
        }

        .auth-benefit-icon {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 37px;
          height: 37px;
          border: 1px solid rgba(0, 180, 216, 0.38);
          border-radius: 10px;
          color: var(--auth-cyan);
          font-size: 11px;
          font-weight: 800;
        }

        .auth-benefit strong {
          display: block;
          margin: 0 0 5px;
          color: #fff;
          font-size: 14px;
        }

        .auth-benefit p {
          margin: 0;
          color: #aebfd3;
          font-size: 12px;
          line-height: 1.7;
        }

        .auth-showcase-footer {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px 20px;
          color: #a5b8cf;
          font-size: 11px;
        }

        .auth-main {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 42px clamp(20px, 5vw, 72px);
        }

        .auth-mobile-brand {
          display: none;
        }

        .auth-form-container {
          width: 100%;
          max-width: 450px;
        }

        .auth-back-link {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #65758b;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .auth-back-link:hover {
          color: #008eac;
        }

        .auth-back-link span {
          font-size: 18px;
        }

        .auth-card {
          margin-top: 25px;
          padding: clamp(23px, 3vw, 36px);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 23px;
          background: #fff;
          box-shadow:
            0 24px 65px rgba(11, 30, 58, 0.055),
            0 2px 8px rgba(11, 30, 58, 0.025);
        }

        .auth-card-kicker {
          color: #008eac;
        }

        .auth-card-heading h2 {
          margin: 13px 0 9px;
          color: var(--auth-navy);
          font-size: clamp(24px, 3vw, 31px);
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: -1px;
        }

        .auth-card-heading p {
          margin: 0;
          color: var(--auth-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .auth-mode-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
          margin: 25px 0;
          padding: 5px;
          border-radius: 12px;
          background: #f1f5f9;
        }

        .auth-mode-option {
          min-height: 41px;
          padding: 10px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #64748b;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .auth-mode-option.active {
          background: #fff;
          color: var(--auth-navy);
          box-shadow: 0 2px 7px rgba(11, 30, 58, 0.08);
        }

        .auth-mode-option:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .auth-form {
          display: grid;
          gap: 19px;
        }

        .auth-field {
          display: grid;
          gap: 9px;
        }

        .auth-field label,
        .auth-password-label label {
          color: #263b53;
          font-size: 12px;
          font-weight: 750;
        }

        .auth-field input {
          width: 100%;
          min-width: 0;
          min-height: 49px;
          padding: 0 14px;
          border: 1px solid #dce4ed;
          border-radius: 11px;
          outline: none;
          background: #fff;
          color: var(--auth-navy);
          font: inherit;
          font-size: 13px;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .auth-field input::placeholder {
          color: #a0aec0;
        }

        .auth-field input:focus {
          border-color: var(--auth-cyan);
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.12);
        }

        .auth-field input:disabled {
          background: #f8fafc;
          cursor: not-allowed;
        }

        .auth-password-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .auth-show-password {
          padding: 3px 0;
          border: 0;
          background: transparent;
          color: #008eac;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .auth-show-password:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .auth-field-hint {
          color: #8795a8;
          font-size: 11px;
        }

        .auth-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          min-height: 51px;
          margin-top: 4px;
          padding: 13px 18px;
          border: 0;
          border-radius: 11px;
          background: var(--auth-navy);
          color: #fff;
          font-family: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(11, 30, 58, 0.13);
          transition:
            transform 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .auth-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #12365e;
          box-shadow: 0 11px 24px rgba(11, 30, 58, 0.18);
        }

        .auth-submit:focus-visible,
        .auth-mode-option:focus-visible,
        .auth-show-password:focus-visible,
        .auth-inline-link:focus-visible {
          outline: 3px solid rgba(0, 180, 216, 0.45);
          outline-offset: 3px;
        }

        .auth-submit:disabled {
          cursor: not-allowed;
          opacity: 0.75;
        }

        .auth-submit > span:last-child {
          color: var(--auth-cyan);
          font-size: 19px;
        }

        .auth-spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: auth-spin 0.7s linear infinite;
        }

        .auth-alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 0 0 17px;
          padding: 12px 13px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.65;
        }

        .auth-alert > span {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 900;
        }

        .auth-alert p {
          margin: 0;
          overflow-wrap: anywhere;
        }

        .auth-alert-error {
          border-color: #fecaca;
          background: #fff5f5;
          color: #b42318;
        }

        .auth-alert-error > span {
          background: #fee2e2;
        }

        .auth-alert-success {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }

        .auth-alert-success > span {
          background: #dcfce7;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 13px;
          margin: 25px 0 19px;
          color: #9aa7b7;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: #edf1f5;
        }

        .auth-switch-copy {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 5px 7px;
          margin: 0;
          color: #728197;
          font-size: 12px;
          text-align: center;
        }

        .auth-inline-link {
          padding: 0;
          border: 0;
          background: transparent;
          color: #008eac;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        .auth-inline-link:hover {
          text-decoration: underline;
        }

        .auth-inline-link:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .auth-security-note {
          margin: 20px 0 0;
          color: #718096;
          font-size: 11px;
          line-height: 1.8;
          text-align: center;
        }

        .auth-legal {
          margin: 12px 0 0;
          color: #9aa7b7;
          font-size: 10px;
          line-height: 1.7;
          text-align: center;
        }

        @keyframes auth-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .auth-page {
            grid-template-columns: minmax(0, 1fr);
          }

          .auth-showcase {
            display: none;
          }

          .auth-main {
            min-height: 100vh;
            align-items: flex-start;
            padding: 28px 20px 36px;
          }

          .auth-form-container {
            max-width: 460px;
            margin: auto;
          }

          .auth-mobile-brand {
            display: block;
            margin-bottom: 28px;
          }

          .auth-mobile-brand .auth-brand-mark {
            background: var(--auth-navy);
            color: #fff;
          }

          .auth-mobile-brand .auth-brand-name {
            color: var(--auth-navy);
          }

          .auth-card {
            margin-top: 19px;
          }
        }

        @media (max-width: 480px) {
          .auth-main {
            padding: 22px 15px 28px;
          }

          .auth-card {
            padding: 22px 18px;
            border-radius: 17px;
          }

          .auth-card-heading h2 {
            font-size: 25px;
          }

          .auth-mode-switch {
            margin: 21px 0;
          }

          .auth-form {
            gap: 17px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .auth-page *,
          .auth-page *::before,
          .auth-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#f6f8fc",
            color: "#0b1e3a",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <p>Loading sign-in page...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
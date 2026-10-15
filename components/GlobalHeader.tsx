"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";

export default function GlobalHeader() {
  const pathname = usePathname();

  // Keep the login and authentication callback screens separate.
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/")
  ) {
    return null;
  }

  const isPublicHome = pathname === "/";

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        {/* Brand identity */}
        <Link
          href={isPublicHome ? "/" : "/home"}
          className="brand"
          aria-label="RuffNeck Connect home"
        >
          <Image
            src="/ruffneck-connect-symbol.png"
            alt=""
            width={44}
            height={44}
            className="brand-logo-image"
            priority
          />

          <span className="brand-wordmark">
            <span className="brand-name-main">RuffNeck</span>
            <span className="brand-name-accent">Connect</span>
          </span>
        </Link>

        {/* Public navigation */}
        {isPublicHome ? (
          <nav
            className="site-nav"
            aria-label="Main navigation"
          >
            <a href="#how-it-works">How it works</a>

            <a href="#features">Features</a>

            <Link href="/login">Sign in</Link>

            <Link href="/login" className="button">
              Get started
            </Link>
          </nav>
        ) : (
          /* Application navigation */
          <nav
            className="site-nav"
            aria-label="Application navigation"
          >
            <Link href="/home">Home</Link>

            <Link href="/communities">
              Communities
            </Link>

            <Link href="/intents">
              Discover
            </Link>

            <Link href="/messages">
              Messages
            </Link>

            <NotificationBell />

            <form
              action="/auth/signout"
              method="post"
            >
              <button
                type="submit"
                className="button button-secondary"
              >
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
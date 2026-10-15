"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import NotificationBell from "@/components/NotificationBell";

export default function GlobalHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Hide the shared navigation on authentication pages.
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/")
  ) {
    return null;
  }

  const isPublicHome = pathname === "/";

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <div className="container global-header-inner">
        <Link
          href={isPublicHome ? "/" : "/home"}
          className="brand"
          aria-label="RuffNeck Connect home"
          onClick={closeMenu}
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

        <button
          type="button"
          className="global-nav-toggle"
          aria-label={
            menuOpen ? "Close navigation" : "Open navigation"
          }
          aria-expanded={menuOpen}
          aria-controls="ruffneck-main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="ruffneck-main-navigation"
          className={`global-nav${menuOpen ? " is-open" : ""}`}
          aria-label="Main navigation"
        >
          {isPublicHome ? (
            <>
              <a href="#how-it-works" onClick={closeMenu}>
                How it works
              </a>

              <a href="#features" onClick={closeMenu}>
                Features
              </a>

              <Link href="/login" onClick={closeMenu}>
                Sign in
              </Link>

              <Link
                href="/login"
                className="button"
                onClick={closeMenu}
              >
                Get started
              </Link>
            </>
          ) : (
            <>
              <Link href="/home" onClick={closeMenu}>
                Home
              </Link>

              <Link href="/communities" onClick={closeMenu}>
                Communities
              </Link>

              <Link href="/intents" onClick={closeMenu}>
                Discover
              </Link>

              <Link href="/messages" onClick={closeMenu}>
                Messages
              </Link>

              <NotificationBell />

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="button-secondary"
                >
                  Sign out
                </button>
              </form>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
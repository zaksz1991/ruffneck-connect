import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }

  try {
    const url = new URL(value, "https://ruffneck-connect.invalid");

    if (url.origin !== "https://ruffneck-connect.invalid") {
      return "/home";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/home";
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const destination = getSafeDestination(
    requestUrl.searchParams.get("next")
  );

  const failureUrl = new URL("/login", requestUrl.origin);
  failureUrl.searchParams.set("error", "confirmation_failed");

  if (!code) {
    return NextResponse.redirect(failureUrl);
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error(
        "Supabase authentication callback failed:",
        error.message
      );

      return NextResponse.redirect(failureUrl);
    }

    return NextResponse.redirect(
      new URL(destination, requestUrl.origin)
    );
  } catch (error) {
    console.error("Authentication callback exception:", error);

    return NextResponse.redirect(failureUrl);
  }
}
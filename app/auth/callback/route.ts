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

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(destination, requestUrl.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=confirmation_failed", requestUrl.origin)
  );
}
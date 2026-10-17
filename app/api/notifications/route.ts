Continued from SQL Error Fix (8)

Next Upgrade: Secure Membership Request Loading

The membership request component currently queries community_members and profiles directly. The next improvement is to load pending requests through a database function that checks whether the current user is the community owner or an active moderator.

Step 1 — Create the database function

Open Supabase → SQL Editor → New query and run:

CREATE OR REPLACE FUNCTION public.get_community_membership_requests(
    p_community_id uuid
)
RETURNS TABLE (
    user_id uuid,
    full_name text,
    avatar_url text,
    joined_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_community_id IS NULL THEN
        RAISE EXCEPTION 'Community is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.communities c
        WHERE c.id = p_community_id
          AND c.status = 'active'
          AND (
              c.owner_id = v_actor_id
              OR EXISTS (
                  SELECT 1
                  FROM public.community_members cm
                  WHERE cm.community_id = c.id
                    AND cm.user_id = v_actor_id
                    AND cm.role = 'moderator'
                    AND cm.status = 'active'
              )
          )
    ) THEN
        RAISE EXCEPTION 'You are not authorized to view membership requests';
    END IF;

    RETURN QUERY
    SELECT
        cm.user_id,
        COALESCE(
            NULLIF(BTRIM(p.full_name), ''),
            'RuffNeck member'
        )::text,
        p.avatar_url::text,
        cm.joined_at
    FROM public.community_members cm
    LEFT JOIN public.profiles p
        ON p.id = cm.user_id
    WHERE cm.community_id = p_community_id
      AND cm.status = 'pending'
    ORDER BY cm.joined_at ASC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION
    public.get_community_membership_requests(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    public.get_community_membership_requests(uuid)
TO authenticated;
Step 2 — Replace the component

Download the complete replacement file:

Download CommunityMembershipRequests.tsx

Replace the entire contents of:

app/communities/[slug]/CommunityMembershipRequests.tsx

The replacement uses the new database function to load pending requests. It retains the Approve and Reject buttons, displays errors, and calls your existing admin_decide_community_membership function to process decisions.

Step 3 — Deploy

Commit the SQL changes in Supabase and the component replacement in GitHub. Vercel should automatically build the new commit.

Expected result: Community owners and active moderators can load pending requests through an authorized database function, approve or reject applications, and see success or error messages. The existing activity log and notification functions remain in place.

CommunityMembershipRequests.tsx
Code
next
Next Upgrade: Community Activity History Filters

The activity history now supports filtering membership events and moderator role changes, manual refresh, and automatic refresh after a membership request is approved or rejected.

1. Replace CommunityActivityLog.tsx

Download the complete replacement file

GitHub path: app/communities/[slug]/CommunityActivityLog.tsx

2. Replace CommunityMembershipRequests.tsx

Download the complete replacement file

GitHub path: app/communities/[slug]/CommunityMembershipRequests.tsx

The second file triggers an activity-history refresh after a membership decision succeeds.

3. Deploy

Commit both files to the main branch. Vercel should start a new deployment automatically.

No SQL changes are required for this upgrade.

CommunityActivityLog.tsx
Code
CommunityMembershipRequests.tsx
Code
next

The current GitHub version of your notification API still excludes community_role_changed, so moderator promotion and demotion notifications may appear as unknown.

Download the complete replacement file:

Download notifications-route.ts

Replace app/api/notifications/route.ts with the contents of this file.

The replacement preserves the existing authentication, notification retrieval, unread count, and link validation while adding support for moderator role-change notifications.

Commit the change to GitHub and check the Vercel deployment.

notifications-route.ts
Code

ỷ̩̦L̠̈V̘̜̆
Library
/
notifications-route.ts
999
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";


export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const NOTIFICATION_FIELDS =
  "id, actor_id, notification_type, title, body, link, is_read, created_at, read_at";


const ALLOWED_NOTIFICATION_TYPES = new Set([
  "community_join_approved",
  "community_join_declined",
  "community_join_request",
  "community_role_changed",
  "interest_received",
  "interest_approved",
  "interest_declined",
  "new_message",
]);


function sanitizeNotificationLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) {
    return null;
  }


  if (link.includes("\\") || /[\u0000-\u001F\u007F]/.test(link)) {
    return null;
  }


  try {
    const parsed = new URL(link, "https://ruffneck-connect.invalid");


    if (parsed.origin !== "https://ruffneck-connect.invalid") {
      return null;
    }


    const allowedPath =
      /^\/(home|communities(?:\/[a-zA-Z0-9_-]+)?|intents(?:\/[a-f0-9-]+)?|messages(?:\/[a-f0-9-]+)?|notifications)(?:\/)?$/i;


    if (!allowedPath.test(parsed.pathname)) {
      return null;
    }


    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}


export async function GET() {
  const supabase = await createClient();


  const {
    data: { user },
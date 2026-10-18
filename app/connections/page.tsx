import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MemberConnectionButton from "@/components/MemberConnectionButton";

export const dynamic = "force-dynamic";

type ConnectionRow = {
  connection_id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "connected";
  other_user_id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "RN";
}

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/connections");

  const { data, error } = await supabase.rpc("get_my_connections");
  const rows = (data ?? []) as ConnectionRow[];
  const incoming = rows.filter((row) => row.status === "pending" && row.direction === "incoming");
  const outgoing = rows.filter((row) => row.status === "pending" && row.direction === "outgoing");
  const accepted = rows.filter((row) => row.status === "accepted");

  function ConnectionCard({ row }: { row: ConnectionRow }) {
    return (
      <article className="feature-card" key={row.connection_id}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          {row.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.avatar_url} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div aria-hidden="true" style={{ display: "grid", width: 56, height: 56, flexShrink: 0, placeItems: "center", borderRadius: "50%", background: "#0b1e3a", color: "#fff", fontWeight: 800 }}>
              {getInitials(row.full_name)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3>{row.full_name}</h3>
            <p className="muted">{row.status === "accepted" ? "Connected" : row.direction === "incoming" ? "Sent you a request" : "Request sent"}</p>
            <p className="muted">{formatDate(row.created_at)}</p>
          </div>
        </div>
        {row.bio && <p>{row.bio.length > 180 ? `${row.bio.slice(0, 177).trim()}…` : row.bio}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <Link href={`/members/${row.other_user_id}`} className="button button-secondary">View profile</Link>
          <MemberConnectionButton otherUserId={row.other_user_id} />
        </div>
      </article>
    );
  }

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR NETWORK</p>
            <h1>My connections</h1>
            <p className="muted">Review incoming requests, track requests you sent, and message members who have accepted your connection.</p>
          </div>
          <Link href="/members" className="button button-secondary">Discover members</Link>
        </div>

        {error && (
          <div className="feature-card" role="alert">
            <h2>Connections could not be loaded</h2>
            <p className="muted">Run the member-connections SQL setup in Supabase, then refresh this page.</p>
          </div>
        )}

        {!error && incoming.length === 0 && outgoing.length === 0 && accepted.length === 0 && (
          <div className="empty-state">
            <h2>No connections yet</h2>
            <p className="muted">Open a member profile and select Connect to send a request.</p>
            <Link href="/members" className="button button-primary">Discover members</Link>
          </div>
        )}

        {incoming.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="section-heading"><div><h2>Incoming requests</h2><p className="muted">Accept a request before starting a private chat.</p></div><span className="status-badge status-pending">{incoming.length} pending</span></div>
            <div className="grid-3">{incoming.map((row) => <ConnectionCard key={row.connection_id} row={row} />)}</div>
          </div>
        )}

        {outgoing.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="section-heading"><div><h2>Requests sent</h2><p className="muted">These requests are waiting for a response.</p></div><span className="status-badge status-pending">{outgoing.length} pending</span></div>
            <div className="grid-3">{outgoing.map((row) => <ConnectionCard key={row.connection_id} row={row} />)}</div>
          </div>
        )}

        {accepted.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="section-heading"><div><h2>Connected members</h2><p className="muted">Open a private conversation with any accepted connection.</p></div><span className="status-badge status-active">{accepted.length} connected</span></div>
            <div className="grid-3">{accepted.map((row) => <ConnectionCard key={row.connection_id} row={row} />)}</div>
          </div>
        )}
      </section>
    </main>
  );
}

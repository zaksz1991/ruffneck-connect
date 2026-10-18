"use client";

import { useEffect, useState } from "react";

type Props = {
  slug: string;
  name: string;
  description?: string | null;
  category?: string | null;
  locationLabel?: string | null;
};

export default function CommunityInvitationCard({
  slug,
  name,
  description,
  category,
  locationLabel,
}: Props) {
  const [communityUrl, setCommunityUrl] = useState("");
  const [message, setMessage] = useState("");
  const [qrUnavailable, setQrUnavailable] = useState(false);

  useEffect(() => {
    const url = new URL(
      `/communities/${encodeURIComponent(slug)}`,
      window.location.origin
    ).toString();
    setCommunityUrl(url);
  }, [slug]);

  const qrUrl = communityUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(communityUrl)}`
    : "";

  async function copyInvitationLink() {
    if (!communityUrl) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(communityUrl);
      } else {
        const field = document.createElement("textarea");
        field.value = communityUrl;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Copy failed");
      }
      setMessage("Invitation link copied.");
    } catch {
      setMessage("Copy failed. Copy the community link shown on the card.");
    }
  }

  function printInvitation() {
    if (!communityUrl) {
      setMessage("The invitation link is not ready yet. Try again shortly.");
      return;
    }

    if (qrUnavailable) {
      setMessage(
        "The QR code could not load. Check your connection, then try printing again."
      );
      return;
    }

    setMessage("");
    window.print();
  }

  return (
    <section className="community-invitation-print-root feature-card">
      <div className="community-invitation-heading">
        <div>
          <span className="eyebrow">INVITE OTHERS</span>
          <h2>Community invitation card</h2>
          <p className="muted">
            Print this card or copy its link to invite people to join.
          </p>
        </div>
        <div className="community-invitation-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={copyInvitationLink}
            disabled={!communityUrl}
          >
            Copy link
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={printInvitation}
            disabled={!communityUrl}
          >
            Print invitation
          </button>
        </div>
      </div>

      <article className="community-invitation-card">
        <div className="community-invitation-copy">
          <span className="community-invitation-brand">RUFFNECK CONNECT</span>
          <p className="community-invitation-kicker">YOU’RE INVITED</p>
          <h3>{name}</h3>
          <p className="community-invitation-description">
            {description?.trim() ||
              "Connect with people, share opportunities, and build useful projects together."}
          </p>
          {(category || locationLabel) && (
            <p className="community-invitation-meta">
              {[category, locationLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="community-invitation-link">
            {communityUrl || "Preparing community link…"}
          </p>
          <p className="community-invitation-callout">
            Scan to explore the community
          </p>
        </div>

        <div className="community-invitation-qr-wrap">
          {qrUrl && !qrUnavailable ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="community-invitation-qr"
              src={qrUrl}
              alt={`QR code for the ${name} community`}
              width={180}
              height={180}
              onError={() => setQrUnavailable(true)}
              onLoad={() => setQrUnavailable(false)}
            />
          ) : (
            <div className="community-invitation-qr-fallback" role="status">
              QR code unavailable. Use the community link.
            </div>
          )}
          <span>Scan with your phone camera</span>
        </div>
      </article>

      <p className="community-invitation-status muted" role="status" aria-live="polite">
        {message}
      </p>

      <style jsx global>{`
        .community-invitation-print-root {
          margin-top: 1.25rem;
        }
        .community-invitation-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .community-invitation-heading h2 {
          margin: 0.35rem 0;
        }
        .community-invitation-heading p {
          margin-bottom: 0;
        }
        .community-invitation-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .community-invitation-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 200px;
          align-items: center;
          gap: 1.5rem;
          padding: clamp(1.25rem, 3vw, 2rem);
          border: 1px solid #d8e3ed;
          border-radius: 18px;
          background: linear-gradient(135deg, #f5fbff 0%, #ffffff 58%, #fff8e6 100%);
          color: #10243b;
        }
        .community-invitation-brand {
          display: inline-block;
          color: #087a98;
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.14em;
        }
        .community-invitation-kicker {
          margin: 1rem 0 0.35rem;
          color: #a16b00;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.12em;
        }
        .community-invitation-copy h3 {
          margin: 0;
          color: #0b1e3a;
          font-size: clamp(1.5rem, 3vw, 2.2rem);
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .community-invitation-description {
          max-width: 58ch;
          margin: 0.85rem 0;
          line-height: 1.65;
        }
        .community-invitation-meta {
          color: #456078;
          font-size: 0.9rem;
          font-weight: 650;
        }
        .community-invitation-link {
          margin: 1rem 0 0.35rem;
          color: #087a98;
          font-size: 0.85rem;
          overflow-wrap: anywhere;
        }
        .community-invitation-callout {
          margin: 0.6rem 0 0;
          font-weight: 750;
        }
        .community-invitation-qr-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          text-align: center;
          color: #456078;
          font-size: 0.75rem;
        }
        .community-invitation-qr {
          display: block;
          width: 180px;
          height: 180px;
          max-width: 100%;
          object-fit: contain;
          padding: 0.45rem;
          background: #ffffff;
          border: 1px solid #d8e3ed;
          border-radius: 12px;
        }
        .community-invitation-qr-fallback {
          display: grid;
          width: 180px;
          min-height: 180px;
          place-items: center;
          padding: 1rem;
          border: 1px dashed #9aacbd;
          border-radius: 12px;
          background: #ffffff;
          color: #456078;
        }
        .community-invitation-status {
          min-height: 1.25rem;
          margin: 0.7rem 0 0;
        }
        @media (max-width: 560px) {
          .community-invitation-card {
            grid-template-columns: 1fr;
          }
          .community-invitation-qr-wrap {
            justify-self: start;
          }
        }
        @media print {
          @page {
            size: A5 portrait;
            margin: 12mm;
          }
          body * {
            visibility: hidden !important;
          }
          .community-invitation-print-root,
          .community-invitation-print-root * {
            visibility: visible !important;
          }
          .community-invitation-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .community-invitation-heading,
          .community-invitation-status {
            display: none !important;
          }
          .community-invitation-card {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 165px !important;
            gap: 0.9rem !important;
            padding: 0.4rem !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            break-inside: avoid;
            color: #111111 !important;
          }
          .community-invitation-copy h3 {
            font-size: 1.5rem !important;
            color: #0b1e3a !important;
          }
          .community-invitation-description,
          .community-invitation-meta,
          .community-invitation-link,
          .community-invitation-callout,
          .community-invitation-brand,
          .community-invitation-kicker,
          .community-invitation-qr-wrap,
          .community-invitation-qr-wrap span {
            color: #111111 !important;
          }
          .community-invitation-qr {
            width: 150px !important;
            height: 150px !important;
            border: 1px solid #dddddd !important;
          }
        }
      `}</style>
    </section>
  );
}

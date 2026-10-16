type ReceiptStatus = "sent" | "delivered" | "read";

type Props = {
  status: ReceiptStatus;
  className?: string;
};

const LABELS: Record<ReceiptStatus, string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/** Small accessible status label for the current user's outgoing messages. */
export default function MessageReceiptStatus({ status, className = "" }: Props) {
  return (
    <span
      className={className}
      aria-label={`Message ${LABELS[status].toLowerCase()}`}
      title={`Message ${LABELS[status].toLowerCase()}`}
    >
      {status === "sent" ? "✓" : "✓✓"} {LABELS[status]}
    </span>
  );
}

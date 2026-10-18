type MemberNumberBadgeProps = {
  memberNumber: string | null | undefined;
  compact?: boolean;
};

export default function MemberNumberBadge({
  memberNumber,
  compact = false,
}: MemberNumberBadgeProps) {
  if (!memberNumber) return null;

  return (
    <span
      className={compact ? "rn-member-number rn-member-number-compact" : "rn-member-number"}
      aria-label={`RuffNeck member ID ${memberNumber}`}
      title="Permanent RuffNeck Connect member ID"
    >
      <span className="rn-member-number-label">MEMBER ID</span>
      <strong>{memberNumber}</strong>
    </span>
  );
}

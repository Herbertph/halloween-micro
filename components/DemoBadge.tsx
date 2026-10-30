export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="demo-badge"
      className={`inline-flex items-center rounded-full border border-ember/50 bg-ember/15 px-3 py-1 text-xs font-semibold text-pumpkin ${className}`}
    >
      Demo — no real payment
    </span>
  );
}

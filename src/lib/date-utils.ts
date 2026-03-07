/**
 * Formats last tested date for display (e.g. "Today", "Yesterday", "3 days ago").
 */
export function formatLastTestedDate(
  dateStr: string | null,
  neverLabel = "Never"
): string {
  if (!dateStr) return neverLabel;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

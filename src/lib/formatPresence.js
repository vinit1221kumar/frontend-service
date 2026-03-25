/**
 * Human-readable line for DM header: online or last seen.
 * @param {boolean} online
 * @param {string | null | undefined} lastSeenIso
 */
export function formatPeerPresence(online, lastSeenIso) {
  if (online) return 'Active now';
  if (!lastSeenIso) return 'Offline';
  const d = new Date(lastSeenIso);
  if (Number.isNaN(d.getTime())) return 'Offline';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'Last seen just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

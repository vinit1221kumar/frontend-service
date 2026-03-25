/**
 * Stable 1:1 video room id for two user IDs (order-independent).
 */
export function dmVideoRoomId(userIdA, userIdB) {
  const a = String(userIdA ?? '').trim();
  const b = String(userIdB ?? '').trim();
  if (!a || !b) return '';
  const [x, y] = [a, b].sort((p, q) => p.localeCompare(q));
  return `dm-${x}-${y}`;
}

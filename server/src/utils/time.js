// "1:02:05" or "62:05" or "45" or 3725 -> seconds. Returns null for anything else.
export function parseClock(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const parts = String(value ?? '').trim().split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

// 3725 -> "1:02:05", 75 -> "1:15"
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

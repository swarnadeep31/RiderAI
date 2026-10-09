// Where to go after logging in, from "?next=/new". Only paths on this site are
// allowed, so a link like "?next=https://evil.example" can't send people away.
export function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

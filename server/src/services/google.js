// "Continue with Google": the browser gets a signed token (an ID token) from
// Google's sign-in button and sends it here. Google's tokeninfo endpoint says
// whether it's genuine; it's only trusted if it was made for this site
// (GOOGLE_CLIENT_ID) and the email is verified. Free, no extra package.

const tokenInfoUrl = () => process.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';
export const googleLoginAvailable = () => Boolean(googleClientId());

// Returns { googleId, email, name } for a genuine token, or null.
export async function verifyGoogleCredential(credential) {
  if (typeof credential !== 'string' || credential.length > 5000 || !googleLoginAvailable()) return null;
  let info;
  try {
    const res = await fetch(`${tokenInfoUrl()}?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    info = await res.json();
  } catch {
    return null;
  }
  const fromGoogle = ['accounts.google.com', 'https://accounts.google.com'].includes(info.iss);
  const forThisSite = info.aud === googleClientId();
  const current = Number(info.exp) * 1000 > Date.now();
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (!fromGoogle || !forThisSite || !current || !verified || !info.sub || !info.email) return null;
  return { googleId: String(info.sub), email: String(info.email).toLowerCase(), name: typeof info.name === 'string' ? info.name.trim().slice(0, 60) : '' };
}

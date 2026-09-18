/**
 * Face ID / Touch ID / fingerprint for the hidden letters, per device.
 *
 * The database only ever checks the PIN. What the phone can do is refuse to hand the PIN over
 * until its own biometric prompt has passed: enrolling makes a platform passkey (WebAuthn, no
 * server round-trip — nothing is verified cryptographically, the OS prompt is the gate) and keeps
 * the PIN beside its id in this browser's storage. Unlocking asks the authenticator for an
 * assertion with user verification required, and only then reads the PIN back. Cancel the prompt,
 * or fail it, and nothing comes out. Anyone with the browser's devtools open is past this anyway —
 * but so are they past the signed-in session, and that is not who this is for.
 */

const KEY = (userId: string) => `hub-word-bio:${userId}`

interface Enrolment { id: string; pin: string }

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')), (c) => c.charCodeAt(0))

/** "Face ID" on an iPhone or Mac, "fingerprint" elsewhere — near enough to say the right thing. */
export function biometricName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|Macintosh/.test(ua)) return 'Face ID or Touch ID'
  if (/Windows/.test(ua)) return 'Windows Hello'
  return 'fingerprint or face unlock'
}

/** Whether this browser can put up a Face ID / fingerprint prompt at all. */
export async function biometricSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

function read(userId: string): Enrolment | null {
  try {
    const raw = localStorage.getItem(KEY(userId))
    if (!raw) return null
    const e = JSON.parse(raw) as Partial<Enrolment>
    return e && typeof e.id === 'string' && typeof e.pin === 'string' ? { id: e.id, pin: e.pin } : null
  } catch { return null }
}

export function biometricEnrolled(userId: string): boolean {
  return read(userId) !== null
}

export function forgetBiometric(userId: string) {
  try { localStorage.removeItem(KEY(userId)) } catch { /* fine */ }
}

/** Makes the passkey (the prompt appears now) and keeps the PIN with it on this device. */
export async function enrolBiometric(userId: string, name: string, pin: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'The Home Hub' },
      user: { id: new TextEncoder().encode(userId), name: name || 'Home Hub', displayName: name || 'Home Hub' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('The device did not make a passkey.')
  localStorage.setItem(KEY(userId), JSON.stringify({ id: b64url(cred.rawId), pin } satisfies Enrolment))
}

/** Puts up the prompt; the PIN comes back only if the device says it was really them. Null if not. */
export async function unlockWithBiometric(userId: string): Promise<string | null> {
  const e = read(userId)
  if (!e) return null
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64url(e.id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion ? e.pin : null
  } catch {
    return null
  }
}

/** When the PIN changes, the copy kept for Face ID has to change with it. */
export function updateBiometricPin(userId: string, pin: string) {
  const e = read(userId)
  if (e) localStorage.setItem(KEY(userId), JSON.stringify({ ...e, pin } satisfies Enrolment))
}

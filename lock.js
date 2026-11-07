// App lock using the phone's own Face ID, Touch ID or fingerprint, through a passkey.
// The phone does the checking; this app never sees a face or fingerprint. This is a lock
// on the door, not encryption: stored data is protected by the phone's own encryption.
const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));
const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function isAvailable() {
  try {
    return Boolean(window.PublicKeyCredential)
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enroll() {
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Erstes Jahr' },
      user: { id: randomBytes(16), name: 'Erstes Jahr', displayName: 'Erstes Jahr' },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      attestation: 'none',
      timeout: 60000,
    },
  });
  return toBase64(credential.rawId);
}

export async function verify(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return Boolean(assertion);
}

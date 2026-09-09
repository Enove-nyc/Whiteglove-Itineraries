"use client";

/**
 * Fingerprint / face unlock, when the page is running inside the native app.
 *
 * The apps are Capacitor shells loading this site. When the capacitor-native-
 * biometric plugin is installed in the shell, the bridge exposes it to this
 * remote page as `window.Capacitor.Plugins.NativeBiometric` — we call it by
 * name, so nothing has to be bundled here. On the plain website, and in a shell
 * built before the plugin was added, none of this is present and every function
 * below reports "unavailable" and does nothing. So the login screen shows a
 * biometric button ONLY where it can actually work, and always keeps the
 * password as the way in.
 *
 * The secret stored is the same one the password box would have sent — the
 * shared admin password, or an adviser's own password — held in the platform
 * keystore/keychain and released only after the OS confirms the person. It
 * never leaves the device and is never sent anywhere this page could read it
 * back other than to sign in exactly as typing it would.
 */

type NativeBiometricPlugin = {
  isAvailable: () => Promise<{ isAvailable: boolean; biometryType?: number }>;
  verifyIdentity: (options?: {
    reason?: string;
    title?: string;
    subtitle?: string;
    /** How many misreads before the prompt gives up. The plugin's default is ONE. */
    maxAttempts?: number;
    /** Offer the phone's PIN / pattern when the finger or face is not recognised. */
    useFallback?: boolean;
    negativeButtonText?: string;
  }) => Promise<void>;
  setCredentials: (options: { username: string; password: string; server: string }) => Promise<void>;
  getCredentials: (options: { server: string }) => Promise<{ username: string; password: string }>;
  deleteCredentials: (options: { server: string }) => Promise<void>;
};

function plugin(): NativeBiometricPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { NativeBiometric?: NativeBiometricPlugin } };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.NativeBiometric ?? null;
}

/**
 * How the system prompt behaves. THE PLUGIN'S DEFAULT IS ONE ATTEMPT: a single
 * misread finished the prompt with an error, so a finger placed slightly off
 * once looked like "it does not work with my fingerprints". The phone's own
 * lock screen allows several tries and then offers the PIN; this asks for the
 * same, so the prompt behaves the way the rest of the phone does.
 */
function promptOptions(reason: string) {
  return { reason, title: "White Glove", subtitle: reason, maxAttempts: 5, useFallback: true, negativeButtonText: "Use the password" };
}

/** True only inside the native app, with the plugin present and a sensor enrolled. */
export async function biometricAvailable(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const result = await p.isAvailable();
    return Boolean(result?.isAvailable);
  } catch {
    return false;
  }
}

/**
 * Remember a secret behind biometrics for this door.
 *
 * `server` namespaces it, so the admin door and an adviser's door never read
 * each other's. `username` is a label the keystore wants; the password is what
 * matters. Returns whether it was stored.
 */
export async function rememberSecret(server: string, secret: string, username = "white-glove"): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    await p.setCredentials({ username, password: secret, server });
    return true;
  } catch {
    return false;
  }
}

/** Whether a secret is already stored for this door (so the button can show). */
export async function hasRememberedSecret(server: string): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const creds = await p.getCredentials({ server });
    return Boolean(creds?.password);
  } catch {
    return false;
  }
}

/**
 * Ask the OS to confirm the person, then hand back the stored secret.
 *
 * Two steps on purpose: verifyIdentity puts up the system fingerprint/face
 * prompt, and only if it passes do we read the secret out. Returns null when
 * there is nothing stored, the plugin is absent, or the person cancels — every
 * one of which just leaves them on the password box.
 */
export async function unlockSecret(server: string, reason: string): Promise<string | null> {
  const p = plugin();
  if (!p) return null;
  try {
    await p.verifyIdentity(promptOptions(reason));
    const creds = await p.getCredentials({ server });
    return creds?.password || null;
  } catch {
    return null;
  }
}

/**
 * Like unlockSecret, but for a door that needs a username too (an account
 * login: email + password). Returns both, or null on cancel / nothing stored.
 */
export async function unlockCredential(server: string, reason: string): Promise<{ username: string; password: string } | null> {
  const p = plugin();
  if (!p) return null;
  try {
    await p.verifyIdentity(promptOptions(reason));
    const creds = await p.getCredentials({ server });
    if (!creds?.password) return null;
    return { username: creds.username, password: creds.password };
  } catch {
    return null;
  }
}

/** Forget the stored secret for this door (on sign-out, or a failed sign-in). */
export async function forgetSecret(server: string): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.deleteCredentials({ server });
  } catch {
    // Nothing stored, or no plugin — either way there is nothing to clear.
  }
}

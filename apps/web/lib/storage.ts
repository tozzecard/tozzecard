/**
 * Local storage keys, all under the `tozzecard.` prefix so one origin's values never collide with
 * another app's. If a key must change, move the old value across before the first read.
 */
export const STORAGE = {
  /** The API session: `{ token, address }` from POST /auth/verify, valid 30 days. */
  session: "tozzecard.session.v1",
  /** The passkey credential id, so sign-in can offer the same passkey first. */
  credential: "tozzecard.passkey.v1",
  /** "1" once the three-step tour has been seen or skipped. */
  onboardingDone: "tozzecard.onboarding.done",
  /** "card" or "agent": which mode Home and the bottom bar show. */
  mode: "tozzecard.mode.v1",
  /** "1" once someone chose to carry on with Tozzecard on a desktop. */
  desktopOk: "tozzecard.desktop.ok",
} as const;

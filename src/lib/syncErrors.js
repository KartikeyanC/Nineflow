// Errors the sync loop understands, whichever store (Drive or Supabase) raised them.
export class AuthError extends Error {} // signed out or session expired: the person has to sign in again
export class OfflineError extends Error {} // no connection: try again later

// Sending work to another account (handoffs): a message to show as it is.
export class HandoffError extends Error {}

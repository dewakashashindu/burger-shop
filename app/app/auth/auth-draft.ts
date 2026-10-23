"use client";

// Non-secret, tab-memory-only UI draft. Not an account, session or reset token.
const empty = { phone: "", country: "+94", name: "", notice: "" };
let draft = empty;
const listeners = new Set<() => void>();
export const getAuthDraft = () => draft;
export const getServerAuthDraft = () => empty;
export function subscribeAuthDraft(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function updateAuthDraft(update: Partial<typeof empty>) {
  draft = { ...draft, ...update };
  listeners.forEach(listener => listener());
}

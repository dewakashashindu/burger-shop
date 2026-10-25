/**
 * Sri Lankan phone numbers, in one place — used by the browser and the server.
 *
 * Everything that reaches the database as a key is the last nine digits
 * (`77 233 6233` -> `772336233`), so `0772336233`, `+94 77 233 6233` and
 * `77-233-6233` are the same person.
 */

/** Digits only. */
export const digitsOf = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** The nine digits after the `0` / `+94` prefix — `""` when there are not nine. */
export function lastNine(value: unknown): string {
  const digits = digitsOf(value);
  if (digits.length < 9) return "";
  return digits.slice(-9);
}

/** `772336233` -> `0772336233` (how the restaurant's counter writes it). */
export function localPhone(value: unknown): string {
  const nine = lastNine(value);
  return nine ? `0${nine}` : "";
}

/** `772336233` -> `77 233 6233` (how a guest reads it). */
export function prettyPhone(value: unknown): string {
  const nine = lastNine(value);
  if (!nine) return "";
  return `${nine.slice(0, 2)} ${nine.slice(2, 5)} ${nine.slice(5)}`;
}

/** `772336233` -> `94772336233` (Text.lk wants the country code, no plus). */
export function internationalDigits(value: unknown): string {
  const nine = lastNine(value);
  return nine ? `94${nine}` : "";
}

/** A Sri Lankan mobile: nine digits, starting with 7. */
export function isSriLankanMobile(value: unknown): boolean {
  return /^7\d{8}$/.test(lastNine(value));
}

/** Groups while typing: `77 123 4567`. */
export function formatAsTyped(value: unknown): string {
  const digits = digitsOf(value).slice(0, 9);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

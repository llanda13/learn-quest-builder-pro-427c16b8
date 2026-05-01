/**
 * Cross-environment UUID Generator
 * 
 * Supports both native crypto.randomUUID() (Node.js, modern browsers)
 * and provides fallback for environments without crypto support.
 */

export function generateUUID(): string {
  // Try native crypto.randomUUID first (preferred)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback to RFC 4122 v4 UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

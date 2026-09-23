// Badging API (https://w3c.github.io/badging/) isn't in TS's lib.dom.d.ts yet.
export {};

declare global {
  interface Navigator {
    setAppBadge?(contents?: number): Promise<void>;
    clearAppBadge?(): Promise<void>;
  }
}

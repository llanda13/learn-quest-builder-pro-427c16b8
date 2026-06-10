// Cache the institution logo as a base64 data URL so Print/Export don't
// re-fetch or re-decode it on every action.

const LOGO_URL = "/images/institution-logo.png";

let logoPromise: Promise<string> | null = null;

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load asset ${url}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function getLogoDataUrl(): Promise<string> {
  if (!logoPromise) {
    logoPromise = fetchAsDataUrl(LOGO_URL).catch((err) => {
      // Reset so the next call can retry; resolve to empty so callers can
      // still render without crashing.
      logoPromise = null;
      console.warn("Logo preload failed:", err);
      return "";
    });
  }
  return logoPromise;
}

// Synchronous accessor that returns the cached value if already resolved.
let logoCached = "";
getLogoDataUrl().then((v) => {
  logoCached = v;
});
export function getLogoDataUrlSync(): string {
  return logoCached;
}

// Warm cache from app bootstrap.
export function warmPrintAssets(): void {
  void getLogoDataUrl();
}

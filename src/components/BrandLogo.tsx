import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Permanent, production-safe brand logo.
 * Served as a static file from /assets/logo.png (public dir), so it resolves
 * on every route, refresh, and deployed environment. If the image ever fails
 * to load, it degrades to the TestBank text mark instead of a broken image.
 */
export function BrandLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold select-none",
          className
        )}
        aria-label="TestBank"
      >
        TB
      </span>
    );
  }

  return (
    <img
      src="/assets/logo.png"
      alt="AI-Integrated Test Bank official logo"
      className={cn("object-contain shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}

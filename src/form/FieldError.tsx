import { cn } from "@/lib/utils";

interface FieldErrorProps {
  /** Field name — used to build a stable id referenced by aria-errormessage. */
  name?: string;
  message?: string | null;
  className?: string;
}

/** Inline error message rendered under an invalid field. */
export function FieldError({ name, message, className }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={name ? `${name}-error` : undefined} className={cn("text-sm font-medium text-destructive", className)}>
      {message}
    </p>
  );
}

export default FieldError;

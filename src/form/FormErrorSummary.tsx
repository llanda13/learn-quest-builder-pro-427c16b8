import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORM_SUMMARY_MESSAGE } from "@/lib/formValidation";

interface FormErrorSummaryProps {
  show?: boolean;
  message?: string;
  /** Optional list of field labels that are incomplete. */
  fields?: string[];
  className?: string;
}

/**
 * Form-level banner shown when a submission is blocked by missing/invalid fields.
 */
export function FormErrorSummary({ show, message, fields, className }: FormErrorSummaryProps) {
  if (!show) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{message || FORM_SUMMARY_MESSAGE}</p>
        {fields && fields.length > 0 && (
          <ul className="list-disc pl-4 opacity-90">
            {fields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default FormErrorSummary;

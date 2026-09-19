import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { FormErrorSummary } from "@/components/form/FormErrorSummary";
import { focusInvalidElement } from "@/lib/formValidation";

interface RhfErrorSummaryProps {
  message?: string;
  className?: string;
}

/**
 * Drop-in error summary for react-hook-form forms.
 * Shows the form-level message and scrolls to the first invalid field.
 */
export function RhfErrorSummary({ message, className }: RhfErrorSummaryProps) {
  const form = useFormContext();
  const errors = form?.formState?.errors ?? {};
  const errorKeys = Object.keys(errors);
  const submitCount = form?.formState?.submitCount ?? 0;

  useEffect(() => {
    if (!submitCount || errorKeys.length === 0) return;
    const first = errorKeys[0];
    const el =
      (document.querySelector(`[name="${first}"]`) as HTMLElement | null) ??
      (document.querySelector(`[aria-invalid="true"]`) as HTMLElement | null);
    focusInvalidElement(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount, errorKeys.length]);

  return <FormErrorSummary show={errorKeys.length > 0} message={message} className={className} />;
}

export default RhfErrorSummary;

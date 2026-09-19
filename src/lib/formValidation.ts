import { useCallback, useRef, useState } from "react";

export type FieldValidator<T = unknown> = (value: T, values: Record<string, unknown>) => string | null | undefined;

export type ValidationSchema = Record<string, FieldValidator<never> | FieldValidator<unknown>>;

export type FieldErrors = Record<string, string>;

export const REQUIRED_MESSAGE = "This field is required.";
export const FORM_SUMMARY_MESSAGE = "Please complete all required fields before continuing.";

/** Built-in validators */
export const required =
  (message: string = REQUIRED_MESSAGE): FieldValidator<unknown> =>
  (value) => {
    if (value === null || value === undefined) return message;
    if (typeof value === "string" && value.trim() === "") return message;
    if (Array.isArray(value) && value.length === 0) return message;
    if (typeof value === "number" && Number.isNaN(value)) return message;
    return null;
  };

export const requiredNumber =
  (message: string = REQUIRED_MESSAGE, min?: number): FieldValidator<unknown> =>
  (value) => {
    if (value === null || value === undefined || value === "") return message;
    const n = Number(value);
    if (Number.isNaN(n)) return "Please enter a valid number.";
    if (min !== undefined && n < min) return `Value must be at least ${min}.`;
    return null;
  };

export const requiredEmail =
  (message: string = REQUIRED_MESSAGE): FieldValidator<unknown> =>
  (value) => {
    if (typeof value !== "string" || value.trim() === "") return message;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Please enter a valid email address.";
    return null;
  };

export const combine =
  (...validators: FieldValidator<unknown>[]): FieldValidator<unknown> =>
  (value, values) => {
    for (const v of validators) {
      const result = v(value, values);
      if (result) return result;
    }
    return null;
  };

/** Scrolls the given element into view and focuses it (or its first focusable child). */
export function focusInvalidElement(element: HTMLElement | null) {
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusTarget =
    element.matches("input, textarea, select, button, [tabindex]")
      ? element
      : element.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]");
  window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 250);
}

/**
 * Lightweight validation for forms that are not built on react-hook-form.
 * Provides per-field errors, a form-level summary flag, red-border props and
 * automatic scroll/focus to the first invalid field.
 */
export function useFormValidation(schema: ValidationSchema) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const setFieldRef = useCallback(
    (name: string) => (el: HTMLElement | null) => {
      refs.current[name] = el;
    },
    [],
  );

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      if (Object.keys(next).length === 0) setShowSummary(false);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors({});
    setShowSummary(false);
  }, []);

  /** Re-validate a single field as the user types, so errors disappear once valid. */
  const revalidateField = useCallback(
    (name: string, value: unknown, values: Record<string, unknown> = {}) => {
      const validator = schema[name] as FieldValidator<unknown> | undefined;
      if (!validator) return;
      const message = validator(value, values);
      if (message) {
        setErrors((prev) => ({ ...prev, [name]: message }));
      } else {
        clearError(name);
      }
    },
    [schema, clearError],
  );

  const validate = useCallback(
    (values: Record<string, unknown>): boolean => {
      const nextErrors: FieldErrors = {};
      for (const name of Object.keys(schema)) {
        const validator = schema[name] as FieldValidator<unknown>;
        const message = validator(values[name], values);
        if (message) nextErrors[name] = message;
      }
      setErrors(nextErrors);
      const isValid = Object.keys(nextErrors).length === 0;
      setShowSummary(!isValid);

      if (!isValid) {
        const firstInvalid = Object.keys(schema).find((name) => nextErrors[name]);
        if (firstInvalid) focusInvalidElement(refs.current[firstInvalid] ?? null);
      }
      return isValid;
    },
    [schema],
  );

  /** Props to spread on the field wrapper/control to get a red highlight + a11y wiring. */
  const fieldProps = useCallback(
    (name: string) => ({
      ref: setFieldRef(name),
      "aria-invalid": Boolean(errors[name]),
      "aria-errormessage": errors[name] ? `${name}-error` : undefined,
    }),
    [errors, setFieldRef],
  );

  return {
    errors,
    hasErrors: Object.keys(errors).length > 0,
    showSummary,
    validate,
    revalidateField,
    clearError,
    clearAll,
    setFieldRef,
    fieldProps,
    setErrors,
  };
}

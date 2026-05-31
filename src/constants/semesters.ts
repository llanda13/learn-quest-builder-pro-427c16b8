/**
 * Semester options used across TOS Builder, Generated Tests,
 * history pages, and export templates.
 */
export const SEMESTER_OPTIONS = [
  "1st Semester",
  "2nd Semester",
  "Summer",
] as const;

export type Semester = (typeof SEMESTER_OPTIONS)[number];

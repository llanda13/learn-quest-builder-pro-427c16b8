export function normalizeSubjectCode(code?: string | null): string {
  return code?.trim().toUpperCase() || "";
}

export function matchesSubjectCodeFilter(questionCode: unknown, filterCode: string): boolean {
  if (typeof questionCode !== "string") return false;
  return normalizeSubjectCode(questionCode) === normalizeSubjectCode(filterCode);
}

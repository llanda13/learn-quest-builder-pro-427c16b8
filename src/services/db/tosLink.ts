import { supabase } from "@/integrations/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTosId(tosId: unknown): tosId is string {
  return typeof tosId === "string" && UUID_RE.test(tosId.trim());
}

/**
 * Guarantees the generated questionnaire is permanently bound to the exact TOS
 * record it was generated from. Never guesses a TOS from subject/course/period.
 * Throws with a clear message when the link is missing or points nowhere.
 */
export async function assertTosLink(tosId: unknown): Promise<string> {
  if (!isValidTosId(tosId)) {
    throw new Error(
      "This test cannot be generated because it is not linked to a saved Table of Specification. Save the TOS first, then generate the questionnaire from it.",
    );
  }
  const id = tosId.trim();
  const { data, error } = await supabase
    .from("tos_entries")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not verify the Table of Specification for this test: ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(
      "The Table of Specification referenced by this generation no longer exists. Open the original TOS and generate the questionnaire again.",
    );
  }
  return id;
}

export type TosLinkState =
  | { status: "missing" }
  | { status: "invalid"; tosId: string }
  | { status: "ok"; tosId: string };

export function describeTosLink(tosId: unknown): TosLinkState {
  if (tosId === null || tosId === undefined || tosId === "") {
    return { status: "missing" };
  }
  if (!isValidTosId(tosId)) return { status: "invalid", tosId: String(tosId) };
  return { status: "ok", tosId: tosId.trim() };
}

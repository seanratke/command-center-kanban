// lib/promote-idea.ts -- promotes a self-flagged act_now idea (from Inventor Pool or
// Synthesis) into the items table as a fresh Inbox entry, so it goes through the same
// independent 5-role panel review + STEP 5 rubric that Sean's own submitted ideas do,
// instead of the generating model self-grading its own priority.
import { SupabaseClient } from "@supabase/supabase-js";

export async function promoteIfActNow(
  supabase: SupabaseClient,
  sourceTable: "inventor_ideas" | "synthesis_ideas",
  sourceId: string,
  currentPromotedId: string | null | undefined,
  title: string,
  note: string
): Promise<void> {
  if (currentPromotedId) return; // never promote the same idea twice

  const { data: newItem, error } = await supabase
    .from("items")
    .insert({ stage: "inbox", title, note })
    .select("id")
    .single();

  if (error || !newItem) {
    console.error(`Failed to promote ${sourceTable} idea ${sourceId} to inbox:`, error);
    return;
  }

  await supabase.from(sourceTable).update({ promoted_item_id: newItem.id }).eq("id", sourceId);
}

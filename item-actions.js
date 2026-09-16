// item-actions.js -- single source of truth for what "advance a stage" and "kill an
// item" actually write to the items table, shared by board.html and index.html so the
// two pages can't drift on this logic.
const ITEM_STAGE_ORDER = ['inbox', 'lab', 'validating', 'building', 'shipped', 'killed'];

function nextItemStage(currentStage) {
  const idx = ITEM_STAGE_ORDER.indexOf(currentStage);
  if (idx < 0 || idx >= ITEM_STAGE_ORDER.length - 2) return null; // unknown stage, or already at/past 'shipped'
  return ITEM_STAGE_ORDER[idx + 1];
}

async function advanceItemStage(sbClient, itemId, currentStage) {
  const nextStage = nextItemStage(currentStage);
  if (!nextStage) return { error: 'no further stage to advance to' };
  const { error } = await sbClient
    .from('items')
    .update({ stage: nextStage, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { error: error.message };
  return { stage: nextStage };
}

async function killItemWithReason(sbClient, itemId, reason) {
  const { error } = await sbClient
    .from('items')
    .update({ stage: 'killed', kill_reason: reason || null, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { error: error.message };
  return { stage: 'killed' };
}

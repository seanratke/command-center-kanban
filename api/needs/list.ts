// api/needs/list.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const items: any[] = [];

  const { data: opps } = await supabase.from('opportunities').select('id, title, confidence, created_at').is('status', null).limit(50);
  (opps || []).forEach((o: any) => items.push({ type: 'opportunity', id: o.id, title: o.title, meta: o.confidence, created_at: o.created_at, link: '/opportunities' }));

  const { data: inboxItems } = await supabase.from('items').select('id, title, review_status, created_at').eq('stage', 'inbox').limit(50);
  (inboxItems || []).forEach((i: any) => {
    if (i.review_status === null || i.review_status === 'needs_input' || i.review_status === 'rejected') {
      items.push({ type: 'inbox_item', id: i.id, title: i.title, meta: i.review_status || 'not yet reviewed', created_at: i.created_at, link: '/' });
    }
  });

  const { data: noms } = await supabase.from('inventor_nominations').select('id, proposed_domain, created_at').eq('status', 'pending').limit(50);
  (noms || []).forEach((n: any) => items.push({ type: 'nomination', id: n.id, title: n.proposed_domain, meta: 'pending nomination', created_at: n.created_at, link: '/inventors' }));

  const { data: invIdeas } = await supabase.from('inventor_ideas').select('id, title, created_at').eq('status', 'new').limit(50);
  (invIdeas || []).forEach((i: any) => items.push({ type: 'inventor_idea', id: i.id, title: i.title, meta: 'new inventor idea', created_at: i.created_at, link: '/inventors' }));

  const { data: synth } = await supabase.from('synthesis_ideas').select('id, title, created_at').eq('status', 'new').limit(50);
  (synth || []).forEach((s: any) => items.push({ type: 'synthesis', id: s.id, title: s.title, meta: 'new synthesis', created_at: s.created_at, link: '/inventors' }));

  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return res.status(200).json({ items });
}

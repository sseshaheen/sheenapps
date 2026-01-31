#!/usr/bin/env ts-node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryMessages() {
  const projectId = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06';

  const { data, error } = await supabase
    .from('project_chat_log_minimal')
    .select('id, mode, actor_type, message_text, client_msg_id, build_id, created_at, seq')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(30);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n=== Chat Messages for Project ===\n');
  console.table(data?.map(msg => ({
    id: msg.id,
    seq: msg.seq,
    mode: msg.mode,
    actor: msg.actor_type,
    text: (msg.message_text || '').substring(0, 40) + '...',
    client_msg_id: msg.client_msg_id || 'NULL',
    build_id: msg.build_id || 'NULL',
    time: new Date(msg.created_at).toLocaleTimeString()
  })));

  // Check for duplicates by build_id
  const buildIds = data?.filter(m => m.build_id).map(m => m.build_id);
  const duplicates = buildIds?.filter((id, index) => buildIds.indexOf(id) !== index);

  if (duplicates && duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATE BUILD IDs FOUND:', [...new Set(duplicates)]);
  } else {
    console.log('\n✅ No duplicate build_id references found');
  }

  // Count messages referencing KDJ7PPEK
  const kdjCount = data?.filter(m => m.build_id === 'KDJ7PPEK').length;
  console.log(`\n📊 Messages referencing build KDJ7PPEK: ${kdjCount}`);
}

queryMessages().catch(console.error);

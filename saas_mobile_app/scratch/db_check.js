const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const pid = 'bf345711-06fc-405f-b3a6-0a4888fff8b2';
  console.log(`Querying property memberships columns...`);
  const { data: memberships, error: mErr } = await supabase
    .from('property_memberships')
    .select('*')
    .limit(1);
  if (mErr) {
    console.error('Memberships error:', mErr);
  } else {
    console.log('Sample membership:', memberships);
  }
}

check();

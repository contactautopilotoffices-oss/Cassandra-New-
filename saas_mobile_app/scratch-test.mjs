import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: readings, error } = await supabase
    .from('electricity_readings')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching electricity_readings:', error);
  } else {
    console.log('electricity_readings sample:', readings);
  }

  const { data: dgReadings, error: dgError } = await supabase
    .from('diesel_readings')
    .select('*')
    .limit(1);
    
  if (dgError) {
    console.error('Error fetching diesel_readings:', dgError);
  } else {
    console.log('diesel_readings sample:', dgReadings);
  }
}

test();

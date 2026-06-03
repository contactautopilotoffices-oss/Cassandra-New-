import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.existsSync('.env.local') ? '.env.local' : '.env';
const env = dotenv.parse(fs.readFileSync(envFile));

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.from('tickets').select('*').limit(1);
  if (error) console.error(error);
  else console.log(Object.keys(data[0]));
}

run();

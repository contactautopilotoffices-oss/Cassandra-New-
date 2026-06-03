// app/api/users/onboarding-status/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getAuthorizedSupabase } from '@/lib/mobileClient';

export async function GET(request: NextRequest) {
  const { client, user, response } = await getAuthorizedSupabase(request);
  if (response || !client || !user) {
    return response || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await client
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ onboarding_completed: data?.onboarding_completed ?? false });
}

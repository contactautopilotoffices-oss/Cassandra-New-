// stress_test.js – simple fetch stress test for meeting rooms, electricity, diesel
// Run with: node --experimental-fetch stress_test.js
// Ensure EXPO_PUBLIC_MOBILE_SERVER_URL is set correctly in .env and a valid auth token is available.

import fetch from 'node-fetch'; // fallback for older node; you can also use built‑in fetch in recent node versions

async function getToken() {
  // TODO: Replace with real token retrieval (e.g., from Supabase auth session)
  // For quick testing you can paste a valid JWT here.
  return process.env.TEST_AUTH_TOKEN || '';
}

async function callApi(endpoint, token) {
  const base = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL?.replace(/\/$/, '');
  const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: token ? `Bearer ${token}` : undefined,
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await getToken();
  if (!token) {
    console.error('⚠️ No auth token – set TEST_AUTH_TOKEN env var.');
    process.exit(1);
  }
  const endpoints = [
    '/api/meeting-rooms?propertyId=PLACEHOLDER',
    '/api/electricity?propertyId=PLACEHOLDER',
    '/api/diesel?propertyId=PLACEHOLDER',
  ];
  for (const ep of endpoints) {
    console.log(`🔎 Calling ${ep}`);
    const { status, json } = await callApi(ep, token);
    console.log(`→ Status: ${status}`);
    console.log('   Response keys:', Object.keys(json).join(', '));
  }
}

main().catch((e) => console.error('❌ Unexpected error', e));

// tests/schema.test.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local, from `supabase status`)');

const supabase = createClient(url, serviceKey);

async function main() {
  const { data: organizer, error: userErr } = await supabase.auth.admin.createUser({
    email: `organizer-${Date.now()}@example.com`,
    password: 'password123',
    email_confirm: true,
  });
  assert(!userErr, `createUser failed: ${userErr?.message}`);

  const { data: near, error: nearErr } = await supabase
    .from('venues')
    .insert({
      name: 'Taipei Main Station Courts',
      address: '3 Zhongxiao W Rd, Taipei',
      location: 'SRID=4326;POINT(121.5170 25.0478)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!nearErr, `insert near venue failed: ${nearErr?.message}`);

  const { data: far, error: farErr } = await supabase
    .from('venues')
    .insert({
      name: 'Tamsui Courts',
      address: 'Tamsui District, New Taipei',
      location: 'SRID=4326;POINT(121.4488 25.1700)',
      created_by: organizer.user.id,
    })
    .select()
    .single();
  assert(!farErr, `insert far venue failed: ${farErr?.message}`);

  const { data: results, error: rpcErr } = await supabase.rpc('nearby_venues', {
    lat: 25.0478,
    lng: 121.5170,
    radius_meters: 5000,
  });
  assert(!rpcErr, `nearby_venues rpc failed: ${rpcErr?.message}`);

  const ids = results.map((v) => v.id);
  assert(ids.includes(near.id), 'expected near venue to be within 5km radius');
  assert(!ids.includes(far.id), 'expected far venue to be excluded from 5km radius');

  console.log('PASS: nearby_venues returns venues within radius and excludes far ones');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
  });

import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';
import { SKILL_BANDS, skillBandForLevel } from '../src/lib/skill-bands.ts';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && serviceKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');

const supabase = createClient(url, serviceKey);

async function main() {
  assert.strictEqual(SKILL_BANDS[0].min, 1, 'bands should start at skill level 1');
  assert.strictEqual(SKILL_BANDS[SKILL_BANDS.length - 1].max, 18, 'bands should end at skill level 18');

  for (let i = 0; i < SKILL_BANDS.length - 1; i++) {
    assert.strictEqual(
      SKILL_BANDS[i].max + 1,
      SKILL_BANDS[i + 1].min,
      `bands must be contiguous with no gaps/overlaps: ${SKILL_BANDS[i].id} -> ${SKILL_BANDS[i + 1].id}`
    );
  }

  for (const band of SKILL_BANDS) {
    for (let level = band.min; level <= band.max; level++) {
      const { data, error } = await supabase.rpc('skill_band', { level });
      assert(!error, `skill_band(${level}) rpc failed: ${error?.message}`);
      assert.strictEqual(
        data,
        band.id,
        `level ${level} should map to '${band.id}' per public.skill_band(), got '${data}'`
      );
      assert.strictEqual(
        skillBandForLevel(level).id,
        band.id,
        `skillBandForLevel(${level}) should return the '${band.id}' band`
      );
    }
  }

  assert.throws(() => skillBandForLevel(0), /no skill band/i, 'expected skillBandForLevel to throw for level below 1');
  assert.throws(() => skillBandForLevel(19), /no skill band/i, 'expected skillBandForLevel to throw for level above 18');

  console.log('PASS: SKILL_BANDS is contiguous 1-18, matches public.skill_band() for every level, and skillBandForLevel agrees with SKILL_BANDS');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  });

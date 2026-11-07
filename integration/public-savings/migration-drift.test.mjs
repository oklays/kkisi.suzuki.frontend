import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The synthetic fixture and the additive migration must enforce the identical boundary.
test('synthetic schema and migration 002 carry byte-identical triggers and commands',async()=>{
 const block=async name=>{const text=await readFile(new URL(name,import.meta.url),'utf8');return text.slice(text.indexOf('DELIMITER $$'));};
 assert.equal(await block('./schema.sql'),await block('./migrations/002_wajib_savings.sql'));
});

test('migration 002 preserves additive, idempotent type upgrade',async()=>{
 const sql=await readFile(new URL('./migrations/002_wajib_savings.sql',import.meta.url),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS savings_type/);
 assert.match(sql,/IMMUTABLE_LINK_BINDING/);
 assert.match(sql,/BINARY l.savings_type=BINARY NEW.jenis_simpanan/);
 assert.match(sql,/SET sim_wajib=v_amount/);
 assert.doesNotMatch(sql,/DROP TABLE|DROP DATABASE|ALTER TABLE m_anggota/);
});

test('local upgrade uses sentinel connection and checksum ledger without reset',async()=>{
 const source=await readFile(new URL('./staging.mjs',import.meta.url),'utf8');
 const upgrade=source.slice(source.indexOf('export async function upgrade()'),source.indexOf('export async function refreshCommands()'));
 assert.match(upgrade,/await connect\('admin'\)/);
 assert.match(upgrade,/LOCAL_MIGRATION_CHECKSUM_MISMATCH/);
 assert.match(upgrade,/if\(!rows.length\)/);
 assert.match(upgrade,/const introducedWajib=columns.length===0/);
 assert.match(upgrade,/if\(introducedWajib\)await db.execute\("UPDATE m_anggota SET sim_wajib/);
 assert.match(source,/sim_wajib,sim_wajib,1,0 FROM m_anggota WHERE id=\? AND nik_kar=\? AND sim_wajib>0/);
 assert.doesNotMatch(upgrade,/DROP DATABASE|applySchema\(|reset\(/);
 const setup=source.slice(source.indexOf('export async function setup()'),source.indexOf('export async function stop()'));
 assert.match(setup,/await upgrade\(\)/);
});

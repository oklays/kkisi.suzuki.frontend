import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The synthetic fixture and the additive migration must enforce the identical boundary.
test('synthetic schema and migration 001 carry byte-identical triggers and commands',async()=>{
 const block=async name=>{const text=await readFile(new URL(name,import.meta.url),'utf8');return text.slice(text.indexOf('DELIMITER $$'));};
 assert.equal(await block('./schema.sql'),await block('./migrations/001_public_savings.sql'));
});

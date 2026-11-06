import assert from 'node:assert/strict';
import test from 'node:test';
import { initialsOf, avatarTone } from '../src/components/console/kosipa/membership-format.ts';

test('initials come from the first two words, are upper case and never throw on odd data', () => {
  assert.equal(initialsOf('A. FACHIZIN'), 'AF');
  assert.equal(initialsOf('A. FAUZI NOFERI'), 'AF');
  assert.equal(initialsOf('A. HARJONO'), 'AH');
  assert.equal(initialsOf('A.DIMAS RAHMAT S'), 'AD');
  assert.equal(initialsOf('budi santoso'), 'BS');
  assert.equal(initialsOf('MADONA'), 'MA');
  assert.equal(initialsOf('  '), '?');
  assert.equal(initialsOf(''), '?');
  assert.equal(initialsOf('... ---'), '?');
});

test('avatar tone is deterministic and within the 5 palette variants', () => {
  for (const name of ['A. FACHIZIN', 'ZUBAIDY HAMZAH', '', 'x']) { const t = avatarTone(name); assert.equal(t, avatarTone(name)); assert.ok(Number.isInteger(t) && t >= 0 && t < 5); }
});

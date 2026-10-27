import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, LANGUAGE_NAMES, setLanguage, t, tx } from '../src/common/i18n.js';
import { BAND_COLORS, COMM, PARTS } from '../src/common/parts.js';

const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();

test('every language has a name and translates every English string', () => {
  const { en, ...others } = LANGUAGES;
  for (const [code, strings] of Object.entries(others)) {
    assert.ok(LANGUAGE_NAMES[code], `${code} has no display name`);
    for (const key of Object.keys(en)) {
      assert.ok(key in strings, `${code} is missing ${key}`);
      assert.equal(placeholders(strings[key]), placeholders(en[key]), `${code} ${key} placeholders`);
    }
  }
});

test('Turkish names every part and option', () => {
  for (const [type, def] of Object.entries(PARTS)) {
    assert.ok(LANGUAGES.tr[`part.${type}`], `part.${type}`);
    if (def.hint) assert.ok(LANGUAGES.tr[`hint.${type}`], `hint.${type}`);
    for (const o of def.options ?? []) assert.ok(LANGUAGES.tr[`option.${o.key}`], `option.${o.key}`);
  }
  for (const comm of Object.keys(COMM)) assert.ok(LANGUAGES.tr[`comm.${comm}`], `comm.${comm}`);
  for (const d of Object.keys(BAND_COLORS)) assert.ok(LANGUAGES.tr[`band.${d}`], `band.${d}`);
});

test('falls back to English', () => {
  setLanguage('tr');
  assert.equal(t('view.pins'), 'Devre');
  assert.equal(tx('part.nothing', 'Fallback'), 'Fallback');
  setLanguage('xx');
  assert.equal(t('view.pins'), 'Devre');
  setLanguage('en');
  assert.equal(t('view.pins'), 'Circuit');
});

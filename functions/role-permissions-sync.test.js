import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// firestore.rules keeps its own copy of the default role permissions (rules can't import
// TypeScript). This keeps the two copies from drifting apart.
const root = fileURLToPath(new URL('..', import.meta.url));
const rules = readFileSync(`${root}firestore.rules`, 'utf8');
const ts = readFileSync(`${root}src/app/core/auth/permissions.ts`, 'utf8');

const quoted = (text) => [...text.matchAll(/'([a-zA-Z.]+)'/g)].map((m) => m[1]);

function tsDefaults() {
  const list = (name) => {
    const m = new RegExp(`const ${name}: readonly Permission\\[\\] = \\[([\\s\\S]*?)\\];`).exec(ts);
    assert.ok(m, `${name} not found in permissions.ts`);
    return m[1];
  };
  const cashier = quoted(list('CASHIER'));
  const manager = [...cashier, ...quoted(list('MANAGER').replace('...CASHIER', ''))];
  const admin = [...manager, ...quoted(list('ADMIN').replace('...MANAGER', ''))];
  return { admin, manager, cashier };
}

function rulesDefaults() {
  const body = /function defaultRolePermissions\(\) \{([\s\S]*?)\n    \}/.exec(rules);
  assert.ok(body, 'defaultRolePermissions() not found in firestore.rules');
  const out = {};
  for (const m of body[1].matchAll(/'(admin|manager|cashier)': \[([^\]]*)\]/g)) out[m[1]] = quoted(m[2]);
  return out;
}

test('firestore.rules default role permissions match permissions.ts', () => {
  const a = tsDefaults();
  const b = rulesDefaults();
  for (const role of ['admin', 'manager', 'cashier']) {
    assert.deepEqual([...b[role]].sort(), [...a[role]].sort(), role);
  }
});

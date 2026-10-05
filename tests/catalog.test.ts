import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('vehicle catalog contains attributed, unique, usable makes and matching models', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/vehicles.json', import.meta.url), 'utf8')) as { source: string; source_url: string; updated_at: string; vehicles: { make: string; models: string[] }[] };
  assert.equal(catalog.source, 'NHTSA vPIC');
  assert.equal(new URL(catalog.source_url).hostname, 'vpic.nhtsa.dot.gov');
  assert.ok(Number.isFinite(Date.parse(catalog.updated_at)));
  assert.ok(catalog.vehicles.length >= 50);
  assert.equal(new Set(catalog.vehicles.map(entry => entry.make.toLowerCase())).size, catalog.vehicles.length);
  for (const entry of catalog.vehicles) {
    assert.ok(entry.make.length <= 120 && entry.models.length > 0);
    assert.equal(new Set(entry.models).size, entry.models.length);
    assert.ok(entry.models.every(model => model.length > 0 && model.length <= 120));
  }
  assert.ok(catalog.vehicles.find(entry => entry.make === 'Honda')?.models.includes('Civic'));
  assert.ok(catalog.vehicles.find(entry => entry.make === 'Toyota')?.models.includes('Camry'));
  assert.ok(catalog.vehicles.find(entry => entry.make === 'Ford')?.models.includes('Mustang'));
});

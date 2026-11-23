import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
test('add-on is self-contained and its compiled entry supports an Ingress prefix', async () => {
  const root = new URL('../toe/app/', import.meta.url);
  const index = await readFile(new URL('dist/client/index.html', root), 'utf8');
  const assets = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) {
    assert.ok(asset.startsWith('./'), `Ingress needs relative asset: ${asset}`);
    await access(new URL(`dist/client/${asset}`, root));
  }
  assert.equal(await readFile(new URL('server.mjs', root), 'utf8'), await readFile(new URL('../server.mjs', import.meta.url), 'utf8'));
  const javascript = assets.find(a => a.endsWith('.js'));
  const js = await readFile(new URL(`dist/client/${javascript}`, root), 'utf8');
  assert.ok(js.includes('./toe-api'));
  assert.ok(!js.includes('"/assets/light-'));
});

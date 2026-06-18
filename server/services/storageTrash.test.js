import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('moveLocalFileToTrash moves archive files instead of deleting them', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manual-library-trash-'));
  process.env.MANUAL_LIBRARY_DATA_DIR = dataDir;
  const storage = await import(`../lib/storage.js?trash-test=${Date.now()}`);

  await storage.ensureDataDir();
  const product = {
    id: 'P0001',
    productId: 'P0001',
    name: 'Test Product'
  };
  const manual = {
    type: '取扱説明書',
    title: 'Manual'
  };
  const archive = await storage.saveLocalPdf(product, manual, Buffer.from('pdf'));
  const moved = await storage.moveLocalFileToTrash(archive.path, { product, label: 'manual' });

  assert.ok(moved);
  assert.match(moved, /trash/);
  await assert.rejects(fs.stat(archive.path), { code: 'ENOENT' });
  assert.equal(await fs.readFile(moved, 'utf8'), 'pdf');
});

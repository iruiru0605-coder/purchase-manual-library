import express from 'express';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_DIR, PORT, TRASH_DIR } from './config.js';
import { parsePurchaseCsv } from './services/csvImport.js';
import { parsePurchaseText } from './services/textImport.js';
import { enrichCandidateWithLlm } from './services/llm.js';
import { searchManualCandidates } from './services/manualSearch.js';
import { getDriveStatus, handleGoogleOAuthCallback, makeGoogleAuthUrl, moveDriveFileToTrashFolder, uploadPdfToDrive } from './services/googleDrive.js';
import { registerCandidate, removeProduct, updateProductFields } from './services/products.js';
import { buildTemplateCsv } from './services/stores.js';
import {
  ensureDataDir,
  makeManualId,
  moveLocalFileToTrash,
  saveLocalPdf,
  saveLocalProductImage,
  mutateDb,
  readDb,
  readSettings,
  writeDb,
  writeSettings
} from './lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 90 * 1024 * 1024 } });

await ensureDataDir();

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/api/state', async (_req, res, next) => {
  try {
    const [db, settings, drive] = await Promise.all([readDb(), readSettings(), getDriveStatus()]);
    res.json({
      imports: db.imports,
      candidates: db.candidates,
      products: db.products,
      settings,
      drive,
      trash: {
        localPath: TRASH_DIR,
        driveFolderName: '_削除予定'
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/trash/open', async (_req, res, next) => {
  try {
    await fs.mkdir(TRASH_DIR, { recursive: true });
    openFolder(TRASH_DIR);
    res.json({ ok: true, path: TRASH_DIR });
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings', async (_req, res, next) => {
  try {
    res.json(await readSettings());
  } catch (error) {
    next(error);
  }
});

app.post('/api/settings', async (req, res, next) => {
  try {
    res.json(await writeSettings(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/api/imports/csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('CSVファイルを選択してください。');
    const source = req.body.source || 'Amazon';
    const parsed = parsePurchaseCsv(req.file.buffer, { source });
    const result = await mutateDb(db => {
      db.imports.unshift(parsed.importRecord);
      db.candidates.unshift(...parsed.candidates);
      return parsed;
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/imports/text', async (req, res, next) => {
  try {
    const source = req.body.source || 'Amazon';
    const parsed = parsePurchaseText(req.body.text || '', { source });
    const result = await mutateDb(db => {
      db.imports.unshift(parsed.importRecord);
      db.candidates.unshift(...parsed.candidates);
      return parsed;
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/imports/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="purchase-history-template.csv"');
  res.send(`﻿${buildTemplateCsv()}`);
});

app.post('/api/candidates/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['suggested', 'accepted', 'rejected', 'later', 'review'];
    if (!allowed.includes(status)) throw new Error('不正なステータスです。');
    const updated = await mutateDb(db => {
      const candidate = findCandidate(db, req.params.id);
      candidate.status = status;
      candidate.updatedAt = new Date().toISOString();
      return candidate;
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/candidates/:id', async (req, res, next) => {
  try {
    const removed = await mutateDb(db => {
      const index = db.candidates.findIndex(candidate => candidate.id === req.params.id);
      if (index < 0) throw new Error('登録候補が見つかりません。');
      const [candidate] = db.candidates.splice(index, 1);
      return candidate;
    });
    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/:id/select-manuals', async (req, res, next) => {
  try {
    const selectedManualIds = Array.isArray(req.body.selectedManualIds) ? req.body.selectedManualIds : [];
    const updated = await mutateDb(db => {
      const candidate = findCandidate(db, req.params.id);
      candidate.selectedManualIds = selectedManualIds;
      candidate.manualCandidates = (candidate.manualCandidates || []).map(manual => ({
        ...manual,
        selected: selectedManualIds.includes(manual.id)
      }));
      candidate.updatedAt = new Date().toISOString();
      return candidate;
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/:id/enrich', async (req, res, next) => {
  try {
    const settings = await readSettings({ revealSecrets: true });
    const candidate = await mutateDb(async db => {
      const item = findCandidate(db, req.params.id);
      item.enrichmentStatus = 'running';
      item.updatedAt = new Date().toISOString();
      return item;
    });
    try {
      const enrichment = await enrichCandidateWithLlm(candidate, settings);
      const updated = await mutateDb(db => {
        const item = findCandidate(db, req.params.id);
        item.enrichment = enrichment;
        item.enrichmentStatus = 'done';
        item.updatedAt = new Date().toISOString();
        return item;
      });
      res.json(updated);
    } catch (error) {
      await mutateDb(db => {
        const item = findCandidate(db, req.params.id);
        item.enrichmentStatus = 'failed';
        item.enrichmentError = error.message;
        item.updatedAt = new Date().toISOString();
      });
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post('/api/candidates/:id/search-manuals', async (req, res, next) => {
  try {
    const candidate = (await readDb()).candidates.find(item => item.id === req.params.id);
    if (!candidate) throw new Error('登録候補が見つかりません。');
    const manuals = await searchManualCandidates(candidate);
    const updated = await mutateDb(db => {
      const item = findCandidate(db, req.params.id);
      item.manualCandidates = manuals;
      item.selectedManualIds = manuals.filter(manual => manual.selected).map(manual => manual.id);
      item.manualSearchStatus = 'done';
      item.updatedAt = new Date().toISOString();
      return item;
    });
    res.json(updated);
  } catch (error) {
    await mutateDb(db => {
      const item = db.candidates.find(candidate => candidate.id === req.params.id);
      if (item) {
        item.manualSearchStatus = 'failed';
        item.manualSearchError = error.message;
        item.updatedAt = new Date().toISOString();
      }
    });
    next(error);
  }
});

app.post('/api/candidates/:id/register', async (req, res, next) => {
  try {
    const product = await mutateDb(db => registerCandidate(db, req.params.id, {
      selectedManualIds: req.body.selectedManualIds || []
    }));
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/products/:id', async (req, res, next) => {
  try {
    const product = await mutateDb(db => updateProductFields(db, req.params.id, req.body));
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const product = await mutateDb(db => removeProduct(db, req.params.id));
    await moveManualFilesToTrash(product);
    await moveProductImageToTrash(product);
    res.json({ ok: true, removed: product });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products/:id/image', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('画像ファイルを選択してください。');
    if (!isSupportedImage(req.file)) {
      throw new Error('PNG、JPEG、WebP画像のみアップロードできます。');
    }
    if (req.file.size > 8 * 1024 * 1024) {
      throw new Error('画像は8MB以下にしてください。');
    }

    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.id || item.productId === req.params.id);
    if (!product) throw new Error('商品が見つかりません。');

    await moveProductImageToTrash(product);
    product.image = await saveLocalProductImage(product, req.file);
    product.updatedAt = new Date().toISOString();
    await writeDb(db);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id/image', async (req, res, next) => {
  try {
    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.id || item.productId === req.params.id);
    if (!product) throw new Error('商品が見つかりません。');
    const removed = product.image || null;
    await moveProductImageToTrash(product);
    delete product.image;
    product.updatedAt = new Date().toISOString();
    await writeDb(db);
    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products/:id/manuals/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('PDFファイルを選択してください。');
    if (!/pdf/i.test(req.file.mimetype) && !/\.pdf$/i.test(req.file.originalname || '')) {
      throw new Error('PDFファイルのみアップロードできます。');
    }

    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.id || item.productId === req.params.id);
    if (!product) throw new Error('商品が見つかりません。');

    const manual = {
      id: makeManualId(),
      title: req.body.title || req.file.originalname.replace(/\.pdf$/i, ''),
      url: '',
      type: req.body.type || '取扱説明書',
      sourceHost: 'uploaded',
      sourceType: 'user-uploaded',
      discoveryMethod: 'manual-upload',
      score: 100,
      selected: true,
      status: 'uploaded',
      checkedAt: new Date().toISOString()
    };

    const [driveStatus, settings] = await Promise.all([
      getDriveStatus(),
      readSettings({ revealSecrets: true })
    ]);
    const useGoogleDrive = wantsGoogleDrive(settings);
    const driveAvailable = useGoogleDrive && driveReady(driveStatus);

    // Driveを希望しているが未認証、またはアップロード失敗のときは
    // データを失わないようローカルへ自動退避する（local-first）。
    let archive = null;
    let driveFallback = false;
    if (driveAvailable) {
      try {
        archive = await uploadPdfToDrive({ product, manual, buffer: req.file.buffer });
      } catch {
        archive = null;
      }
    }
    if (!archive) {
      if (useGoogleDrive) driveFallback = true;
      archive = await saveLocalPdf(product, manual, req.file.buffer);
    }
    if (driveFallback) {
      archive.fallbackReason = 'drive-unavailable';
    }

    product.manuals = product.manuals || [];
    product.manuals.unshift({
      ...manual,
      archiveStatus: 'saved',
      archive,
      savedAt: new Date().toISOString()
    });
    product.updatedAt = new Date().toISOString();
    await writeDb(db);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:productId/manuals/:manualId', async (req, res, next) => {
  try {
    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.productId || item.productId === req.params.productId);
    if (!product) throw new Error('商品が見つかりません。');
    const index = (product.manuals || []).findIndex(manual => manual.id === req.params.manualId);
    if (index < 0) throw new Error('PDFが見つかりません。');
    const [removed] = product.manuals.splice(index, 1);
    await moveManualFileToTrash(product, removed);
    product.updatedAt = new Date().toISOString();
    await writeDb(db);
    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

app.get('/api/products/:productId/manuals/:manualId/file', async (req, res, next) => {
  try {
    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.productId || item.productId === req.params.productId);
    if (!product) throw new Error('商品が見つかりません。');
    const manual = (product.manuals || []).find(item => item.id === req.params.manualId);
    if (!manual) throw new Error('PDFが見つかりません。');
    if (manual.archive?.storage === 'local' && manual.archive.path) {
      const resolved = path.resolve(manual.archive.path);
      const archiveRoot = path.resolve(ARCHIVE_DIR);
      if (!resolved.startsWith(`${archiveRoot}${path.sep}`)) throw new Error('PDFの保存先が不正です。');
      try {
        await sendLocalPdf(res, resolved);
      } catch (error) {
        if (manual.url) {
          res.redirect(manual.url);
          return;
        }
        throw error;
      }
      return;
    }
    const remoteUrl = manual.archive?.webViewLink || manual.url;
    if (remoteUrl) {
      res.redirect(remoteUrl);
      return;
    }
    throw new Error('開けるPDFリンクがありません。');
  } catch (error) {
    next(error);
  }
});

app.get('/api/products/:id/image', async (req, res, next) => {
  try {
    const db = await readDb();
    const product = db.products.find(item => item.id === req.params.id || item.productId === req.params.id);
    if (!product?.image?.path) throw new Error('製品画像が見つかりません。');
    const resolved = path.resolve(product.image.path);
    const archiveRoot = path.resolve(ARCHIVE_DIR);
    if (!resolved.startsWith(`${archiveRoot}${path.sep}`)) throw new Error('画像の保存先が不正です。');
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error('製品画像が見つかりません。');
    res.setHeader('Content-Type', product.image.mimeType || 'image/jpeg');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(resolved).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/google/status', async (_req, res, next) => {
  try {
    res.json(await getDriveStatus());
  } catch (error) {
    next(error);
  }
});

app.get('/api/google/oauth/start', async (_req, res, next) => {
  try {
    const url = await makeGoogleAuthUrl();
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

app.get('/api/google/oauth/callback', async (req, res, next) => {
  try {
    const code = req.query.code;
    if (!code) throw new Error('Googleから認証コードが返りませんでした。');
    await handleGoogleOAuthCallback(code);
    res.send('<!doctype html><meta charset="utf-8"><title>認証完了</title><body style="font-family:sans-serif;padding:32px"><h1>Google Drive認証が完了しました</h1><p>このタブを閉じて、取説ライブラリに戻ってください。</p></body>');
  } catch (error) {
    next(error);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: `APIエンドポイントが見つかりません: ${req.method} ${req.originalUrl}`
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(repoRoot, 'dist')));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(repoRoot, 'dist', 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({
    error: error.message || 'エラーが発生しました。'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Manual Library API: http://localhost:${PORT}`);
});

function findCandidate(db, id) {
  const candidate = db.candidates.find(item => item.id === id);
  if (!candidate) throw new Error('登録候補が見つかりません。');
  return candidate;
}

async function moveManualFilesToTrash(product) {
  const manuals = product?.manuals || [];
  await Promise.all(manuals.map(async manual => {
    await moveManualFileToTrash(product, manual);
  }));
}

async function moveManualFileToTrash(product, manual) {
  if (manual?.archive?.storage === 'local' && manual.archive.path) {
    await moveLocalFileToTrash(manual.archive.path, { product, label: 'manual' }).catch(() => {});
  }
  if (manual?.archive?.storage === 'google-drive') {
    await moveDriveFileToTrashFolder(manual.archive, { product }).catch(() => {});
  }
}

async function moveProductImageToTrash(product) {
  if (product?.image?.storage !== 'local' || !product.image.path) return;
  await moveLocalFileToTrash(product.image.path, { product, label: 'image' }).catch(() => {});
}

function openFolder(folderPath) {
  if (process.platform === 'win32') {
    // ランチャー経由のデタッチ/非表示コンテキストでも画面に表示されるよう、
    // ブラウザ起動（openBrowser）と同じ `cmd /c start` 方式を使う。
    // explorer の直接spawnでは、非表示サーバーからだとウィンドウが出ないことがある。
    spawn('cmd.exe', ['/c', 'start', '', folderPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
}

function isSupportedImage(file) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)
    || /\.(png|jpe?g|webp)$/.test(name);
}

function wantsGoogleDrive(settings) {
  return settings?.app?.archiveMode !== 'local-only';
}

function driveReady(driveStatus) {
  return Boolean(driveStatus?.configured && driveStatus?.authenticated);
}

async function sendLocalPdf(res, filePath) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new Error('保存済みPDFファイルが見つかりません。元URLがある場合はPDFを入れ替えてください。');
  }
  if (!stat.isFile()) throw new Error('保存済みPDFファイルが見つかりません。');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`);
  const stream = createReadStream(filePath);
  stream.on('error', error => {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.destroy(error);
  });
  stream.pipe(res);
}

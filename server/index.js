import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT } from './config.js';
import { parsePurchaseCsv } from './services/csvImport.js';
import { parsePurchaseText } from './services/textImport.js';
import { enrichCandidateWithLlm } from './services/llm.js';
import { searchManualCandidates } from './services/manualSearch.js';
import { getDriveStatus, handleGoogleOAuthCallback, makeGoogleAuthUrl } from './services/googleDrive.js';
import { registerCandidate } from './services/products.js';
import {
  ensureDataDir,
  mutateDb,
  readDb,
  readSettings,
  writeSettings
} from './lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

await ensureDataDir();

const app = express();
app.use(express.json({ limit: '3mb' }));

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
      drive
    });
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

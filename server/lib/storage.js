import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ARCHIVE_DIR, DATA_DIR, DB_PATH, DEFAULT_SETTINGS, SETTINGS_PATH } from '../config.js';

const emptyDb = {
  imports: [],
  candidates: [],
  products: [],
  counters: {
    product: 0
  },
  updatedAt: null
};

export async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fsp.chmod(DATA_DIR, 0o700).catch(() => {});
  await fsp.mkdir(ARCHIVE_DIR, { recursive: true, mode: 0o700 });
  await fsp.chmod(ARCHIVE_DIR, 0o700).catch(() => {});
  if (!fs.existsSync(DB_PATH)) {
    await writeJson(DB_PATH, emptyDb);
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    await writeJson(SETTINGS_PATH, DEFAULT_SETTINGS);
  }
}

export async function readDb() {
  await ensureDataDir();
  return readJson(DB_PATH, emptyDb);
}

export async function writeDb(db) {
  db.updatedAt = new Date().toISOString();
  await writeJson(DB_PATH, db);
  return db;
}

export async function mutateDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

export async function readSettings({ revealSecrets = false } = {}) {
  await ensureDataDir();
  const settings = mergeSettings(DEFAULT_SETTINGS, await readJson(SETTINGS_PATH, DEFAULT_SETTINGS));
  if (revealSecrets) return settings;
  return redactSettings(settings);
}

export async function writeSettings(nextSettings) {
  await ensureDataDir();
  const current = await readSettings({ revealSecrets: true });
  const normalized = structuredClone(nextSettings || {});
  if (normalized.llm?.apiKey === '********') normalized.llm.apiKey = current.llm.apiKey;
  if (normalized.googleDrive?.clientSecret === '********') {
    normalized.googleDrive.clientSecret = current.googleDrive.clientSecret;
  }
  const merged = mergeSettings(current, normalized);
  await writeJson(SETTINGS_PATH, merged);
  return redactSettings(merged);
}

export function nextProductId(db) {
  db.counters.product = Number(db.counters.product || 0) + 1;
  return `P${String(db.counters.product).padStart(4, '0')}`;
}

export function makeImportId() {
  return `I_${nanoid(10)}`;
}

export function makeCandidateId() {
  return `C_${nanoid(10)}`;
}

export function makeManualId() {
  return `M_${nanoid(10)}`;
}

export function makeSafeSegment(value) {
  return String(value || '未設定')
    .trim()
    .replace(/[\\/:*?"<>|#{}\[\]\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || '未設定';
}

export async function saveLocalPdf(product, manual, buffer) {
  const folder = path.join(
    ARCHIVE_DIR,
    makeSafeSegment(product.category || 'その他'),
    makeSafeSegment(`${product.productId}_${product.maker || ''}_${product.name || ''}_${product.model || ''}`)
  );
  await fsp.mkdir(folder, { recursive: true });
  const filename = `${makeSafeSegment(manual.type || 'manual')}_${makeSafeSegment(manual.title || '取扱説明書')}.pdf`;
  const filePath = path.join(folder, filename);
  await fsp.writeFile(filePath, buffer);
  return {
    storage: 'local',
    path: filePath,
    filename
  };
}

export async function saveLocalProductImage(product, file) {
  const folder = path.join(ARCHIVE_DIR, '_images', makeSafeSegment(product.productId || product.id));
  await fsp.mkdir(folder, { recursive: true });
  const extension = imageExtensionFor(file);
  const filename = `product-image${extension}`;
  const filePath = path.join(folder, filename);
  await fsp.writeFile(filePath, file.buffer);
  return {
    storage: 'local',
    path: filePath,
    filename,
    mimeType: file.mimetype,
    sourceUrl: file.sourceUrl,
    uploadedAt: new Date().toISOString()
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fsp.chmod(filePath, 0o600).catch(() => {});
}

function mergeSettings(base, patch) {
  return {
    ...base,
    ...patch,
    llm: { ...base.llm, ...(patch?.llm || {}) },
    googleDrive: { ...base.googleDrive, ...(patch?.googleDrive || {}) },
    app: { ...base.app, ...(patch?.app || {}) },
    categories: Array.isArray(patch?.categories) ? patch.categories : base.categories
  };
}

function redactSettings(settings) {
  const copy = structuredClone(settings);
  if (copy.llm?.apiKey) copy.llm.apiKey = '********';
  if (copy.googleDrive?.clientSecret) copy.googleDrive.clientSecret = '********';
  return copy;
}

function imageExtensionFor(file) {
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  const ext = path.extname(file?.originalname || '').toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.jpg';
}

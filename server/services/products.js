import { getDriveStatus, uploadPdfToDrive } from './googleDrive.js';
import { downloadPdf } from './manualSearch.js';
import { nextProductId, readSettings, saveLocalPdf } from '../lib/storage.js';

export async function registerCandidate(db, candidateId, { selectedManualIds = [] } = {}) {
  const candidate = db.candidates.find(item => item.id === candidateId);
  if (!candidate) throw new Error('登録候補が見つかりません。');
  if (candidate.status === 'registered') throw new Error('この候補は登録済みです。');

  const enrichment = candidate.enrichment || {};
  const settings = await readSettings({ revealSecrets: true });
  const productId = nextProductId(db);
  const now = new Date().toISOString();
  const category = enrichment.category || 'その他';
  const product = {
    id: productId,
    productId,
    sourceCandidateId: candidate.id,
    source: candidate.source,
    purchaseDate: candidate.purchaseDate || '',
    warrantyMonths: candidate.warrantyMonths || null,
    extendedWarrantyMonths: candidate.extendedWarrantyMonths || null,
    warrantyExpiresAt: computeWarrantyExpiresAt(candidate.purchaseDate, candidate.warrantyMonths, candidate.extendedWarrantyMonths),
    sourceUrl: candidate.sourceUrl || '',
    maker: enrichment.maker || '',
    name: enrichment.productName || candidate.title,
    model: enrichment.model || '',
    category,
    paperStorage: candidate.paperStorage || issuePaperStorage(db, category, settings.categories),
    manuals: [],
    notes: candidate.memo || '',
    createdAt: now,
    updatedAt: now
  };

  const selected = (candidate.manualCandidates || []).filter(manual => {
    if (selectedManualIds.length > 0) return selectedManualIds.includes(manual.id);
    return manual.selected;
  });

  const driveStatus = await getDriveStatus();
  for (const manual of selected) {
    try {
      const buffer = await downloadPdf(manual.url);
      const storage = driveStatus.configured && driveStatus.authenticated
        ? await uploadPdfToDrive({ product, manual, buffer })
        : await saveLocalPdf(product, manual, buffer);
      product.manuals.push({
        ...manual,
        archiveStatus: 'saved',
        archive: storage,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      product.manuals.push({
        ...manual,
        archiveStatus: 'failed',
        archiveError: error.message,
        savedAt: new Date().toISOString()
      });
    }
  }

  candidate.status = 'registered';
  candidate.registeredProductId = product.id;
  candidate.updatedAt = now;
  db.products.unshift(product);
  return product;
}

export function updateProductFields(db, productId, patch) {
  const product = db.products.find(item => item.id === productId || item.productId === productId);
  if (!product) throw new Error('商品が見つかりません。');
  const editable = [
    'purchaseDate',
    'warrantyMonths',
    'extendedWarrantyMonths',
    'maker',
    'name',
    'model',
    'category',
    'paperStorage',
    'notes',
    'sourceUrl'
  ];

  for (const key of editable) {
    if (patch[key] !== undefined) product[key] = normalizeProductValue(key, patch[key]);
  }
  product.warrantyExpiresAt = computeWarrantyExpiresAt(product.purchaseDate, product.warrantyMonths, product.extendedWarrantyMonths);
  product.updatedAt = new Date().toISOString();
  return product;
}

export function removeProduct(db, productId) {
  const index = db.products.findIndex(item => item.id === productId || item.productId === productId);
  if (index < 0) throw new Error('商品が見つかりません。');
  const [removed] = db.products.splice(index, 1);
  return removed;
}

export function computeWarrantyExpiresAt(purchaseDate, warrantyMonths, extendedWarrantyMonths) {
  const months = Math.max(Number(warrantyMonths || 0), Number(extendedWarrantyMonths || 0));
  if (!purchaseDate || !months) return '';
  const date = parseDate(purchaseDate);
  if (!date) return '';
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function issuePaperStorage(db, category, categories = []) {
  const settingsCategories = categories || [];
  const categoryConfig = settingsCategories.find(item => item.name === category);
  const box = categoryConfig?.box || defaultBoxForCategory(category);
  const sameCategory = db.products.filter(product => product.category === category).length + 1;
  return `${category} ${box} #${String(sameCategory).padStart(3, '0')}`;
}

function defaultBoxForCategory(category) {
  const map = {
    キッチン家電: 'BOX-01',
    生活家電: 'BOX-02',
    'PC・周辺機器': 'BOX-03',
    'スマホ・充電': 'BOX-04',
    '家具・設備': 'BOX-05',
    工具: 'BOX-06',
    子ども用品: 'BOX-07',
    健康器具: 'BOX-08',
    車用品: 'BOX-09',
    ソフトウェア: 'BOX-10',
    その他: 'BOX-99'
  };
  return map[category] || 'BOX-99';
}

function normalizeProductValue(key, value) {
  if (key === 'warrantyMonths' || key === 'extendedWarrantyMonths') {
    const numeric = Number(value || 0);
    return numeric > 0 ? numeric : null;
  }
  return String(value || '').trim();
}

function parseDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

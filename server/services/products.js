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
    sourceUrl: candidate.sourceUrl || '',
    maker: enrichment.maker || '',
    name: enrichment.productName || candidate.title,
    model: enrichment.model || '',
    category,
    paperStorage: issuePaperStorage(db, category, settings.categories),
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

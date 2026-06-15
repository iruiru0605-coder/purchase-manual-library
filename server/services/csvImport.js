import Papa from 'papaparse';
import { makeCandidateId, makeImportId } from '../lib/storage.js';

const FIELD_ALIASES = {
  title: ['商品名', '品名', 'タイトル', '商品', 'Product Name', 'Item Name', 'Title', 'name', 'Name'],
  purchaseDate: ['購入日', '注文日', '日付', 'Date', 'Order Date', 'Purchased Date', 'purchaseDate'],
  price: ['価格', '金額', '合計', '支払金額', 'Price', 'Total', 'Item Total', 'Amount'],
  quantity: ['数量', '個数', 'Quantity', 'Qty'],
  sourceUrl: ['商品URL', '商品リンク', 'URL', 'リンク', 'Product URL', 'Item URL'],
  orderId: ['注文番号', '注文ID', 'Order ID', 'Order Number'],
  seller: ['販売元', 'ショップ', '店舗', 'Seller', 'Store'],
  memo: ['メモ', '備考', 'Memo', 'Note']
};

const REGISTER_HINTS = [
  '家電', '炊飯器', 'レンジ', '冷蔵庫', '洗濯機', '掃除機', '食洗機', '空気清浄機', '照明',
  'モニター', 'ディスプレイ', 'pc', 'パソコン', 'プリンタ', 'ルーター', 'ssd', 'hdd',
  '充電器', 'バッテリー', 'anker', 'usb', 'bluetooth', 'イヤホン', 'スピーカー',
  '家具', '椅子', 'チェア', '机', 'デスク', '棚', 'ラック', 'ベッド',
  '工具', 'ドリル', 'ドライバー', 'makita', 'bosch', 'hikoki',
  '子ども', 'ベビー', 'チャイルドシート', 'ベビーカー',
  '健康', '体温計', '血圧計', 'マッサージ', 'フィットネス',
  '車', 'カー', 'ドライブレコーダー', 'タイヤ', 'ナビ',
  'ソフトウェア', 'ライセンス', 'アプリ'
];

const LOW_PRIORITY_HINTS = [
  '食品', '水', '米', '洗剤', '詰替', 'サプリ', '化粧品', '服', '靴下', '本 ', '書籍', 'dvd',
  '消耗品', 'マスク', 'トイレット', 'ペーパー', 'おむつ'
];

export function parsePurchaseCsv(buffer, { source = 'Amazon' } = {}) {
  const text = normalizeCsvText(buffer);
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => String(header || '').trim()
  });

  if (parsed.errors?.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSVを読み取れませんでした: ${parsed.errors[0].message}`);
  }

  const headers = parsed.meta.fields || [];
  const importId = makeImportId();
  const importedAt = new Date().toISOString();
  const rows = parsed.data
    .map((row, index) => makeCandidate(row, index, { source, importId, importedAt, headers }))
    .filter(candidate => candidate.title || Object.values(candidate.raw || {}).some(Boolean));

  return {
    importRecord: {
      id: importId,
      source,
      importedAt,
      rowCount: rows.length,
      headers
    },
    candidates: rows
  };
}

function normalizeCsvText(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function makeCandidate(row, index, context) {
  const title = pick(row, FIELD_ALIASES.title);
  const score = estimateRegistrationScore(title, row);
  return {
    id: makeCandidateId(),
    importId: context.importId,
    source: context.source,
    sourceRow: index + 2,
    status: score >= 60 ? 'suggested' : 'review',
    title,
    purchaseDate: pick(row, FIELD_ALIASES.purchaseDate),
    price: normalizePrice(pick(row, FIELD_ALIASES.price)),
    quantity: pick(row, FIELD_ALIASES.quantity) || '',
    sourceUrl: pick(row, FIELD_ALIASES.sourceUrl),
    orderId: pick(row, FIELD_ALIASES.orderId),
    seller: pick(row, FIELD_ALIASES.seller),
    memo: pick(row, FIELD_ALIASES.memo),
    raw: row,
    registrationScore: score,
    reason: score >= 60 ? '説明書管理の対象になりそうです' : '必要なら登録してください',
    enrichment: null,
    manualCandidates: [],
    selectedManualIds: [],
    createdAt: context.importedAt,
    updatedAt: context.importedAt
  };
}

function pick(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return String(row[alias]).trim();
    }
  }
  const normalizedAliases = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeKey(key)) && String(value || '').trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function normalizePrice(value) {
  const text = String(value || '').replace(/[^\d.-]/g, '');
  return text ? Number(text) : null;
}

function estimateRegistrationScore(title, row) {
  const text = `${title} ${Object.values(row).join(' ')}`.toLowerCase();
  let score = 35;
  if (REGISTER_HINTS.some(word => text.includes(word.toLowerCase()))) score += 45;
  if (LOW_PRIORITY_HINTS.some(word => text.includes(word.toLowerCase()))) score -= 40;
  if (/[A-Z]{1,5}[-\s]?\d{2,}/i.test(text)) score += 12;
  if (/説明書|マニュアル|保証|型番/.test(text)) score += 8;
  return Math.max(0, Math.min(100, score));
}

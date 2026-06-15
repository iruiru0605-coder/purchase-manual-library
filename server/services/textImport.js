import { makeImportId } from '../lib/storage.js';
import { estimateRegistrationScore, makeCandidateFromRow } from './csvImport.js';

const NOISE_PATTERNS = [
  /注文履歴|購入履歴|アカウント|ログイン|検索|メニュー|ヘルプ|カート|レジ/i,
  /購入日時|購入日|注文日|注文番号|注文ID|オーダー|order\s*(number|#|id)?/i,
  /合計|小計|送料|ポイント|クーポン|支払い|お届け先|配送|配達|発送|出荷/i,
  /返品|交換|レビュー|領収書|請求書|再購入|もう一度購入|商品を表示/i,
  /前へ|次へ|表示|絞り込み|すべて|キャンセル|閉じる/i,
  /^¥?[\d,]+円?$/,
  /^\d{4}[\/年.-]\d{1,2}[\/月.-]\d{1,2}日?$/
];

const PRODUCT_HINTS = [
  '家電', '炊飯器', 'レンジ', '冷蔵庫', '洗濯機', '掃除機', '食洗機', '食器洗い', '空気清浄機',
  'モニター', 'ディスプレイ', 'プリンタ', 'ルーター', '充電器', 'charger', 'バッテリー',
  'カメラ', 'ベビーモニター', '見守り', 'ペットカメラ',
  '家具', '椅子', 'チェア', '机', 'デスク', '棚', 'ラック', '工具', 'ドリル',
  '子ども', 'ベビー', 'チャイルド', '健康', '体温計', '血圧', '車', 'カー',
  'ソフトウェア', 'ライセンス', 'Anker', 'Panasonic', 'Sony', 'Makita', 'Apple'
];

export function parsePurchaseText(text, { source = 'Amazon' } = {}) {
  const normalized = String(text || '').replace(/\r/g, '\n').replace(/\t/g, '\n');
  if (!normalized.trim()) throw new Error('購入履歴ページからコピーしたテキストを貼り付けてください。');

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const importId = makeImportId();
  const importedAt = new Date().toISOString();
  const rows = [];
  let currentDate = '';
  let currentOrderId = '';
  let currentPrice = '';
  let currentUrl = '';
  let pendingLabel = '';

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (isDateLabel(line)) {
      pendingLabel = 'date';
      continue;
    }
    if (isOrderLabel(line)) {
      pendingLabel = 'orderId';
      continue;
    }

    const date = extractDate(line);
    if (date) {
      currentDate = date;
      currentOrderId = '';
      currentPrice = '';
      currentUrl = '';
      if (pendingLabel === 'date' || isPureDateLine(line)) {
        pendingLabel = '';
        continue;
      }
    }

    if (pendingLabel === 'orderId') {
      const looseOrderId = extractLooseOrderId(line);
      if (looseOrderId) {
        currentOrderId = looseOrderId;
        pendingLabel = '';
        continue;
      }
      pendingLabel = '';
    }

    const orderId = extractOrderId(line);
    if (orderId) currentOrderId = orderId;

    const price = extractPrice(line);
    if (price) currentPrice = price;

    if (/^https?:\/\//.test(line)) currentUrl = line;

    if (!looksLikeProductLine(line)) continue;

    const row = {
      商品名: cleanProductTitle(line),
      購入日: currentDate,
      価格: extractPrice(line) || findNearbyPrice(lines, index) || currentPrice,
      商品URL: currentUrl,
      注文番号: currentOrderId,
      販売元: source,
      メモ: '購入履歴ページ貼り付けから取込'
    };
    if (estimateRegistrationScore(row.商品名, row) < 15) continue;
    rows.push(row);
  }

  const dedupedRows = dedupeRows(rows).slice(0, 300);
  const candidates = dedupedRows.map((row, index) => makeCandidateFromRow(row, index, {
    source,
    importId,
    importedAt,
    headers: ['商品名', '購入日', '価格', '商品URL', '注文番号', '販売元', 'メモ']
  }));

  return {
    importRecord: {
      id: importId,
      source: `${source}貼り付け`,
      importedAt,
      rowCount: candidates.length,
      headers: ['pasted-text']
    },
    candidates
  };
}

function findNearbyPrice(lines, index) {
  for (let offset = 1; offset <= 3; offset++) {
    const next = lines[index + offset];
    if (!next || looksLikeProductLine(next) || extractDate(next) || extractOrderId(next)) break;
    const price = extractPrice(next);
    if (price) return price;
  }
  return '';
}

function looksLikeProductLine(line) {
  const text = line.trim();
  if (text.length < 5 || text.length > 320) return false;
  if (isPureDateLine(text) || isDateLabel(text) || isOrderLabel(text)) return false;
  if (NOISE_PATTERNS.some(pattern => pattern.test(text))) return false;
  if (/^https?:\/\//.test(text)) return false;
  if (/^[\d\s,./年月日:-]+$/.test(text)) return false;

  const hasHint = PRODUCT_HINTS.some(word => text.toLowerCase().includes(word.toLowerCase()));
  const hasModel = /[A-Z]{1,6}[-\s]?[A-Z]?\d{2,6}[A-Z0-9-]*/.test(text);
  const hasUsefulShape = /[ぁ-んァ-ン一-龥]/.test(text) && /[A-Za-z0-9]/.test(text);
  return hasHint || hasModel || (hasUsefulShape && text.length >= 12);
}

function cleanProductTitle(line) {
  return line
    .replace(/^・|^[-*]\s*/, '')
    .replace(/^(商品名|品名|商品|タイトル)\s*[:：]\s*/, '')
    .replace(/^(商品番号|品番)\s*[:：]\s*/, '')
    .replace(/^★[^★]{0,80}★\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDateLabel(line) {
  return /^(注文日|購入日|購入日時)\s*[:：]?$/.test(line.trim());
}

function isOrderLabel(line) {
  return /^(注文番号|注文ID|オーダー番号|受注番号|Order\s*(?:Number|#|ID)?)\s*[:：]?\s*$/i.test(line.trim());
}

function isPureDateLine(line) {
  return /^\d{4}[\/年.-]\s*\d{1,2}[\/月.-]\s*\d{1,2}(?:日)?(?:\([月火水木金土日]\))?$/.test(line.trim());
}

function extractDate(line) {
  const text = line.trim();
  const iso = text.match(/(\d{4})[\/年.-]\s*(\d{1,2})[\/月.-]\s*(\d{1,2})/);
  if (iso) return `${iso[1]}/${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}`;
  const jp = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (jp) return `${jp[1]}/${jp[2].padStart(2, '0')}/${jp[3].padStart(2, '0')}`;
  return '';
}

function extractOrderId(line) {
  const match = line.match(/(?:注文番号|注文ID|オーダー番号|受注番号|Order\s*(?:Number|#|ID)?)[\s:：#-]*([A-Z0-9-]{6,})/i);
  return match?.[1] || '';
}

function extractLooseOrderId(line) {
  const text = line.trim();
  return /^[A-Z0-9][A-Z0-9-]{5,}$/i.test(text) ? text : '';
}

function extractPrice(line) {
  const match = line.match(/[¥￥]\s*([\d,]+)|([\d,]+)\s*円/);
  return match ? (match[1] || match[2] || '').replace(/,/g, '') : '';
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = `${row.商品名}|${row.注文番号}|${row.購入日}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

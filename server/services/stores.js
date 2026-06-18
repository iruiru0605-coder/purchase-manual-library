import Papa from 'papaparse';

// 販売店の正規リスト（表記ゆれ防止のための唯一ソース）。
// CSVの「販売元」とUIの販売元プルダウンはこのリストに統一する。
export const CANONICAL_STORES = ['Amazon', '楽天', 'Yahoo!', 'メルカリ', 'ヨドバシ', 'その他'];

// 既知の販売店バリアント → 正規名 のマッピング。
// 記号・空白・大小を無視して比較し、一致すれば正規名に揃える。
// どれにも一致しなければ入力値をそのまま維持し（自由記述を残す）、強制的に「その他」にはしない。
const STORE_VARIANTS = {
  Amazon: ['amazon', 'アマゾン', 'amazon.co.jp', 'amazon.jp'],
  楽天: ['楽天市場', 'rakuten', 'ラクテン'],
  'Yahoo!': ['yahoo', 'ヤフー', 'ヤフーショッピング', 'yahoo!ショッピング', 'ヤフオク'],
  メルカリ: ['mercari'],
  ヨドバシ: ['yodobashi', 'ヨドバシカメラ']
};

function comparableKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.\-_/!！\s]/g, '');
}

export function normalizeStore(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = comparableKey(raw);
  for (const [canonical, variants] of Object.entries(STORE_VARIANTS)) {
    if (key === comparableKey(canonical)) return canonical;
    if (variants.some(variant => key === comparableKey(variant))) return canonical;
  }
  return raw;
}

const TEMPLATE_HEADERS = [
  '商品名', '購入日', '価格', '商品URL', '注文番号', '販売元',
  'メーカー保証(月)', '延長保証(月)', '紙ファイル置き場', 'メモ'
];

const TEMPLATE_SAMPLE = [
  'Panasonic 食器洗い乾燥機 NP-TZ300', '2026/06/12', '76800',
  'https://example.com/p/12345', '2026-06-12-001', 'ヨドバシ',
  '12', '', 'リビング収納A', '設置済み'
];

// CSVテンプレートを生成（BOMは呼び出し側で付与）。
export function buildTemplateCsv() {
  return Papa.unparse([TEMPLATE_HEADERS, TEMPLATE_SAMPLE]);
}

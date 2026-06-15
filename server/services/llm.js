const PRODUCT_CATEGORIES = [
  'キッチン家電', '生活家電', 'PC・周辺機器', 'スマホ・充電', '家具・設備',
  '工具', '子ども用品', '健康器具', '車用品', 'ソフトウェア', 'その他'
];

export async function enrichCandidateWithLlm(candidate, settings) {
  const llm = settings.llm || {};
  if (!llm.apiKey || !llm.model) {
    return heuristicEnrichment(candidate, 'LLM未設定のため、商品名から推定しました。');
  }

  const apiBaseUrl = String(llm.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: [
            'あなたは家庭用品の取扱説明書ライブラリ作成を支援するアシスタントです。',
            '購入履歴の1行から、メーカー、型番、カテゴリ、登録要否、公式マニュアル探索用クエリを推定してください。',
            '事実と推定を混ぜず、不確かな型番は confidence を下げ、needsReview を true にしてください。',
            '出力はJSONのみです。'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: candidate.title,
            source: candidate.source,
            seller: candidate.seller,
            price: candidate.price,
            sourceUrl: candidate.sourceUrl,
            raw: candidate.raw,
            allowedCategories: PRODUCT_CATEGORIES
          })
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM APIエラー: ${response.status} ${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || '{}';
  const parsed = parseJsonObject(content);
  return normalizeEnrichment(parsed, candidate);
}

export function heuristicEnrichment(candidate, note = '商品名から推定しました。') {
  const title = candidate.title || '';
  const raw = candidate.raw || {};
  const maker = pickRaw(raw, ['メーカー', 'manufacturer', 'Maker', 'Brand']) || inferMaker(title, candidate.seller);
  const model = pickRaw(raw, ['型番', 'model', 'Model', 'Model Number', '品番']) || inferModel(title);
  const category = pickRaw(raw, ['カテゴリ', 'category', 'Category']) || inferCategory(title);
  const productName = pickRaw(raw, ['商品名', '品名', 'Product Name', 'Item Name', 'Title']) || title
    .replace(maker, '')
    .replace(model, '')
    .replace(/\s+/g, ' ')
    .trim() || title;

  return normalizeEnrichment({
    maker,
    productName,
    model,
    category,
    shouldRegister: candidate.registrationScore >= 50,
    confidence: maker && model ? 0.72 : model ? 0.58 : 0.42,
    needsReview: !model || !maker,
    reason: note,
    searchQueries: buildSearchQueries({ maker, productName, model, title })
  }, candidate);
}

function pickRaw(raw, keys) {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim()) {
      return String(raw[key]).trim();
    }
  }
  const normalized = keys.map(key => key.toLowerCase().replace(/\s+/g, ''));
  for (const [key, value] of Object.entries(raw)) {
    if (normalized.includes(String(key).toLowerCase().replace(/\s+/g, '')) && String(value || '').trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function normalizeEnrichment(raw, candidate) {
  const maker = text(raw.maker || raw.manufacturer);
  const productName = text(raw.productName || raw.name || candidate.title);
  const model = text(raw.model || raw.modelNumber || raw.partNumber);
  const category = PRODUCT_CATEGORIES.includes(raw.category) ? raw.category : inferCategory(`${candidate.title} ${productName}`);
  const queries = Array.isArray(raw.searchQueries) && raw.searchQueries.length > 0
    ? raw.searchQueries.map(text).filter(Boolean).slice(0, 8)
    : buildSearchQueries({ maker, productName, model, title: candidate.title });

  return {
    maker,
    productName,
    model,
    category,
    shouldRegister: Boolean(raw.shouldRegister ?? true),
    confidence: clamp(Number(raw.confidence ?? 0.5), 0, 1),
    needsReview: Boolean(raw.needsReview ?? (!maker || !model)),
    reason: text(raw.reason || ''),
    searchQueries: queries,
    updatedAt: new Date().toISOString()
  };
}

function buildSearchQueries({ maker, productName, model, title }) {
  const core = [maker, model, productName].filter(Boolean).join(' ') || title;
  return [
    `${core} 取扱説明書 PDF 公式`,
    `${core} マニュアル PDF`,
    `${core} 公式 サポート 取扱説明書`,
    `${core} 設置説明書 PDF`,
    `${core} クイックガイド PDF`
  ];
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = String(content).match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM応答からJSONを読み取れませんでした。');
    return JSON.parse(match[0]);
  }
}

function inferMaker(title, seller) {
  const textValue = `${title} ${seller || ''}`;
  const known = [
    'Panasonic', 'Sony', 'Anker', 'Apple', 'Dell', 'HP', 'Lenovo', 'Makita', 'Bosch',
    'HIKOKI', 'Yamaha', 'Canon', 'Epson', 'Brother', 'Nintendo', 'IKEA', 'Dyson',
    'TOSHIBA', 'Sharp', 'HITACHI', 'アイリスオーヤマ', '山善', 'ニトリ', 'カシオ'
  ];
  return known.find(name => textValue.toLowerCase().includes(name.toLowerCase())) || '';
}

function inferModel(title) {
  const patterns = [
    /\b[A-Z]{1,5}[-\s]?[A-Z]?\d{2,5}[A-Z0-9-]*\b/g,
    /\b\d{2,4}[A-Z]{1,4}[-\s]?[A-Z0-9-]{2,}\b/g
  ];
  for (const pattern of patterns) {
    const match = String(title).match(pattern);
    if (match?.[0]) return match[0].replace(/\s+/g, '-');
  }
  return '';
}

function inferCategory(title) {
  const lower = String(title || '').toLowerCase();
  if (/炊飯器|レンジ|食洗機|冷蔵庫|トースター|キッチン/.test(lower)) return 'キッチン家電';
  if (/洗濯|掃除|空気清浄|照明|扇風機|ヒーター/.test(lower)) return '生活家電';
  if (/pc|パソコン|モニター|ssd|hdd|プリンタ|ルーター|キーボード|マウス/.test(lower)) return 'PC・周辺機器';
  if (/スマホ|iphone|android|充電|anker|usb|イヤホン|bluetooth/.test(lower)) return 'スマホ・充電';
  if (/家具|椅子|チェア|デスク|机|棚|ラック|ベッド/.test(lower)) return '家具・設備';
  if (/工具|ドリル|ドライバー|makita|bosch|hikoki/.test(lower)) return '工具';
  if (/子ども|ベビー|チャイルド|ベビーカー|おもちゃ/.test(lower)) return '子ども用品';
  if (/健康|体温計|血圧|マッサージ|フィットネス/.test(lower)) return '健康器具';
  if (/車|カー|ドラレコ|ドライブレコーダー|ナビ|タイヤ/.test(lower)) return '車用品';
  if (/ソフトウェア|ライセンス|アプリ|adobe|office/.test(lower)) return 'ソフトウェア';
  return 'その他';
}

function text(value) {
  return String(value || '').trim();
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

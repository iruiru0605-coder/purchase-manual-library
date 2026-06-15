import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePurchaseText } from './textImport.js';

test('Rakuten pasted order text ignores date-only rows and imports product details', () => {
  const pasted = `注文日：
2025/02/06(木)
注文番号：
425489-20250206-0954621472
注文詳細
問い合わせ

その他
商品ページがありません
★新発売 5,999円&P5倍 2/10まで★ モニター 搭載 見守りカメラ ベビーモニター 赤ちゃん 見守り カメラ 猫 犬 ペット 防犯 自動 追跡 自動追跡 動体検知 屋内 留守番 通話 暗視 赤外線 赤外線LED 高画質 スマホ プライバシー モード ペットカメラ 録画 高齢者 会話 できる
5,999円`;

  const parsed = parsePurchaseText(pasted, { source: '楽天' });

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].purchaseDate, '2025/02/06');
  assert.equal(parsed.candidates[0].orderId, '425489-20250206-0954621472');
  assert.equal(parsed.candidates[0].price, 5999);
  assert.match(parsed.candidates[0].title, /ベビーモニター/);
  assert.doesNotMatch(parsed.candidates[0].title, /^2025\/02\/06/);
});

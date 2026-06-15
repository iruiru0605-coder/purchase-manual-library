const SHEET_NAME = '商品一覧';
const BATCH_SHEET_NAME = 'まとめ登録';
const SETTINGS_SHEET_NAME = '設定';
const ROOT_FOLDER_NAME = '購入品マニュアル';
const INBOX_FOLDER_NAME = '_未整理';
const ID_PREFIX = 'P';

// 空欄の場合は実行ユーザーのメールアドレスを使います。
const NOTIFY_EMAIL = '';
const NOTIFY_DAYS = 30;

const COL = {
  ID: 1,
  STATUS: 2,
  PURCHASE_DATE: 3,
  MAKER: 4,
  NAME: 5,
  MODEL: 6,
  CATEGORY: 7,
  PURCHASE_SOURCE: 8,
  PRICE: 9,
  WARRANTY_MONTHS: 10,
  EXTENDED_WARRANTY_MONTHS: 11,
  WARRANTY_LIMIT: 12,
  WARRANTY_STATUS: 13,
  FOLDER_LINK: 14,
  LOCATION: 15,
  MEMO: 16,
  MANUAL_STATUS: 17,
  PAPER_STORAGE: 18,
  OFFICIAL_MANUAL_URL: 19,
  SCAN_STATUS: 20,
};

const BATCH_COL = {
  IMPORT_STATUS: 1,
  PURCHASE_DATE: 2,
  MAKER: 3,
  NAME: 4,
  MODEL: 5,
  CATEGORY: 6,
  PURCHASE_SOURCE: 7,
  PRICE: 8,
  WARRANTY_MONTHS: 9,
  EXTENDED_WARRANTY_MONTHS: 10,
  LOCATION: 11,
  MANUAL_STATUS: 12,
  PAPER_STORAGE: 13,
  OFFICIAL_MANUAL_URL: 14,
  SCAN_STATUS: 15,
  MEMO: 16,
  GENERATED_ID: 17,
  FOLDER_LINK: 18,
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('マニュアル管理')
    .addItem('初期セットアップ（親フォルダ＋_未整理作成）', 'setupManualLibrary')
    .addSeparator()
    .addItem('この行を登録（ID採番＋フォルダ作成）', 'registerRow')
    .addItem('まとめ登録を取り込む', 'registerBatchRows')
    .addItem('選択行の紙ファイル置き場を採番', 'assignPaperStorageForActiveRow')
    .addSeparator()
    .addItem('保証期限チェックを今すぐ実行', 'checkWarrantyExpiry')
    .addItem('週次通知トリガーを作成', 'createWeeklyWarrantyTrigger')
    .addToUi();
}

function setupManualLibrary() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  let rootFolder = getFolderFromProperty_('PARENT_FOLDER_ID');

  if (!rootFolder) {
    rootFolder = getOrCreateFolderByName_(ROOT_FOLDER_NAME);
    props.setProperty('PARENT_FOLDER_ID', rootFolder.getId());
  }

  const inboxFolder = getOrCreateChildFolder_(rootFolder, INBOX_FOLDER_NAME);
  props.setProperty('INBOX_FOLDER_ID', inboxFolder.getId());
  writeSetupLinks_(rootFolder, inboxFolder);

  ui.alert(
    '初期セットアップが完了しました。\n\n' +
    '親フォルダ:\n' + rootFolder.getUrl() + '\n\n' +
    '_未整理:\n' + inboxFolder.getUrl()
  );
}

function registerRow() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const ui = SpreadsheetApp.getUi();

    if (!sheet) {
      ui.alert('シート「' + SHEET_NAME + '」が見つかりません。');
      return;
    }

    if (ss.getActiveSheet().getName() !== SHEET_NAME) {
      ui.alert('「' + SHEET_NAME + '」シートで登録したい行を選択してください。');
      return;
    }

    const row = sheet.getActiveCell().getRow();
    if (row < 2) {
      ui.alert('データ行を選択してください。');
      return;
    }

    const result = registerProductRow_(sheet, row);
    ui.alert('登録しました:\n' + result.folderName + '\n\n紙ファイル置き場:\n' + (result.paperStorage || '未設定'));
  } finally {
    lock.releaseLock();
  }
}

function registerBatchRows() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const productSheet = ss.getSheetByName(SHEET_NAME);
    const batchSheet = ss.getSheetByName(BATCH_SHEET_NAME);
    const ui = SpreadsheetApp.getUi();

    if (!productSheet || !batchSheet) {
      ui.alert('「' + SHEET_NAME + '」または「' + BATCH_SHEET_NAME + '」シートが見つかりません。');
      return;
    }

    if (!getParentFolderOrAlert_()) return;

    const lastRow = batchSheet.getLastRow();
    if (lastRow < 2) {
      ui.alert('まとめ登録に取り込む行がありません。');
      return;
    }

    const rows = batchSheet.getRange(2, 1, lastRow - 1, BATCH_COL.FOLDER_LINK).getValues();
    const errors = [];
    let imported = 0;

    rows.forEach((values, index) => {
      const sourceRow = index + 2;
      const importStatus = String(values[BATCH_COL.IMPORT_STATUS - 1] || '').trim();

      if (importStatus === '登録済' || importStatus === 'スキップ') return;
      if (isBatchRowEmpty_(values)) return;

      const purchaseDate = values[BATCH_COL.PURCHASE_DATE - 1];
      const maker = values[BATCH_COL.MAKER - 1];
      const name = values[BATCH_COL.NAME - 1];

      if (!purchaseDate || !maker || !name) {
        errors.push(sourceRow + '行目: 購入日・メーカー・商品名が必要です。');
        batchSheet.getRange(sourceRow, BATCH_COL.IMPORT_STATUS).setValue('要確認');
        return;
      }

      const targetRow = findNextProductRow_(productSheet);
      ensureRows_(productSheet, targetRow);
      writeBatchValuesToProductRow_(productSheet, targetRow, values);

      try {
        const result = registerProductRow_(productSheet, targetRow, { skipRequiredAlert: true });
        batchSheet.getRange(sourceRow, BATCH_COL.IMPORT_STATUS).setValue('登録済');
        batchSheet.getRange(sourceRow, BATCH_COL.GENERATED_ID).setValue(result.id);
        batchSheet.getRange(sourceRow, BATCH_COL.FOLDER_LINK).setValue(result.folderUrl);
        imported++;
      } catch (error) {
        errors.push(sourceRow + '行目: ' + error.message);
        batchSheet.getRange(sourceRow, BATCH_COL.IMPORT_STATUS).setValue('要確認');
      }
    });

    const message = [
      'まとめ登録の取り込みが完了しました。',
      '登録: ' + imported + '件',
      '要確認: ' + errors.length + '件',
    ];
    if (errors.length > 0) message.push('\n' + errors.slice(0, 10).join('\n'));
    ui.alert(message.join('\n'));
  } finally {
    lock.releaseLock();
  }
}

function assignPaperStorageForActiveRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const ui = SpreadsheetApp.getUi();

  if (!sheet || SpreadsheetApp.getActiveSheet().getName() !== SHEET_NAME) {
    ui.alert('「' + SHEET_NAME + '」シートで採番したい行を選択してください。');
    return;
  }

  const row = sheet.getActiveCell().getRow();
  if (row < 2) {
    ui.alert('データ行を選択してください。');
    return;
  }

  const existing = sheet.getRange(row, COL.PAPER_STORAGE).getValue();
  if (existing) {
    ui.alert('紙ファイル置き場は既に入力されています:\n' + existing);
    return;
  }

  const category = sheet.getRange(row, COL.CATEGORY).getValue();
  if (!category) {
    ui.alert('カテゴリを先に入力してください。');
    return;
  }

  const paperStorage = issuePaperStorage_(sheet, category);
  sheet.getRange(row, COL.PAPER_STORAGE).setValue(paperStorage);
  ui.alert('紙ファイル置き場を入力しました:\n' + paperStorage);
}

function registerProductRow_(sheet, row, options) {
  const ui = SpreadsheetApp.getUi();
  const opts = options || {};

  const existingId = sheet.getRange(row, COL.ID).getValue();
  if (existingId) {
    throw new Error('この行は登録済みです（ID: ' + existingId + '）。');
  }

  const date = sheet.getRange(row, COL.PURCHASE_DATE).getValue();
  const maker = sheet.getRange(row, COL.MAKER).getValue();
  const name = sheet.getRange(row, COL.NAME).getValue();

  if (!date || !maker || !name) {
    const message = '購入日・メーカー・商品名を先に入力してください。';
    if (!opts.skipRequiredAlert) ui.alert(message);
    throw new Error(message);
  }

  const parentFolder = getParentFolderOrAlert_();
  if (!parentFolder) throw new Error('親フォルダが未設定です。');

  const newId = issueNextId_(sheet);
  const dateStr = Utilities.formatDate(new Date(date), 'Asia/Tokyo', 'yyyy-MM-dd');
  const folderName = [newId, dateStr, sanitizeDriveName_(maker), sanitizeDriveName_(name)].join('_');
  const folder = parentFolder.createFolder(folderName);
  const folderUrl = folder.getUrl();

  sheet.getRange(row, COL.ID).setValue(newId);
  sheet.getRange(row, COL.FOLDER_LINK).setValue(folderUrl);

  if (!sheet.getRange(row, COL.STATUS).getValue()) {
    sheet.getRange(row, COL.STATUS).setValue('使用中');
  }

  if (!sheet.getRange(row, COL.MANUAL_STATUS).getValue()) {
    sheet.getRange(row, COL.MANUAL_STATUS).setValue('未確認');
  }

  const manualStatus = String(sheet.getRange(row, COL.MANUAL_STATUS).getValue() || '');
  if (!sheet.getRange(row, COL.SCAN_STATUS).getValue() && shouldDefaultToUnscanned_(manualStatus)) {
    sheet.getRange(row, COL.SCAN_STATUS).setValue('未スキャン');
  }

  const category = sheet.getRange(row, COL.CATEGORY).getValue();
  let paperStorage = sheet.getRange(row, COL.PAPER_STORAGE).getValue();
  if (!paperStorage && category) {
    paperStorage = issuePaperStorage_(sheet, category);
    sheet.getRange(row, COL.PAPER_STORAGE).setValue(paperStorage);
  }

  ensureRowFormulas_(sheet, row);
  return { id: newId, folderUrl: folderUrl, folderName: folderName, paperStorage: paperStorage };
}

function writeBatchValuesToProductRow_(sheet, row, values) {
  sheet.getRange(row, COL.STATUS).setValue('使用中');
  sheet.getRange(row, COL.PURCHASE_DATE).setValue(values[BATCH_COL.PURCHASE_DATE - 1]);
  sheet.getRange(row, COL.MAKER).setValue(values[BATCH_COL.MAKER - 1]);
  sheet.getRange(row, COL.NAME).setValue(values[BATCH_COL.NAME - 1]);
  sheet.getRange(row, COL.MODEL).setValue(values[BATCH_COL.MODEL - 1]);
  sheet.getRange(row, COL.CATEGORY).setValue(values[BATCH_COL.CATEGORY - 1]);
  sheet.getRange(row, COL.PURCHASE_SOURCE).setValue(values[BATCH_COL.PURCHASE_SOURCE - 1]);
  sheet.getRange(row, COL.PRICE).setValue(values[BATCH_COL.PRICE - 1]);
  sheet.getRange(row, COL.WARRANTY_MONTHS).setValue(values[BATCH_COL.WARRANTY_MONTHS - 1]);
  sheet.getRange(row, COL.EXTENDED_WARRANTY_MONTHS).setValue(values[BATCH_COL.EXTENDED_WARRANTY_MONTHS - 1]);
  sheet.getRange(row, COL.LOCATION).setValue(values[BATCH_COL.LOCATION - 1]);
  sheet.getRange(row, COL.MEMO).setValue(values[BATCH_COL.MEMO - 1]);
  sheet.getRange(row, COL.MANUAL_STATUS).setValue(values[BATCH_COL.MANUAL_STATUS - 1] || '未確認');
  sheet.getRange(row, COL.PAPER_STORAGE).setValue(values[BATCH_COL.PAPER_STORAGE - 1]);
  sheet.getRange(row, COL.OFFICIAL_MANUAL_URL).setValue(values[BATCH_COL.OFFICIAL_MANUAL_URL - 1]);
  sheet.getRange(row, COL.SCAN_STATUS).setValue(values[BATCH_COL.SCAN_STATUS - 1]);
}

function checkWarrantyExpiry() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート「' + SHEET_NAME + '」が見つかりません。');

  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = row[COL.ID - 1];
    const status = row[COL.STATUS - 1];
    const maker = row[COL.MAKER - 1];
    const name = row[COL.NAME - 1];
    const model = row[COL.MODEL - 1];
    const limit = row[COL.WARRANTY_LIMIT - 1];
    const folderUrl = row[COL.FOLDER_LINK - 1];
    const paperStorage = row[COL.PAPER_STORAGE - 1];

    if (status !== '使用中' || !(limit instanceof Date)) continue;

    const days = Math.floor((limit.getTime() - today.getTime()) / 86400000);
    if (days >= 0 && days <= NOTIFY_DAYS) {
      const limitText = Utilities.formatDate(limit, 'Asia/Tokyo', 'yyyy/MM/dd');
      const modelText = model ? '（' + model + '）' : '';
      const paperText = paperStorage ? '\n  紙: ' + paperStorage : '';
      const linkText = folderUrl ? '\n  Drive: ' + folderUrl : '';
      alerts.push(
        '・' + id + ' ' + maker + ' ' + name + modelText +
        ': あと' + days + '日（' + limitText + 'まで）' + paperText + linkText
      );
    }
  }

  if (alerts.length === 0) return;

  MailApp.sendEmail(
    getNotifyEmail_(),
    '【取説ライブラリ】保証期限が近い商品が' + alerts.length + '件あります',
    alerts.join('\n') + '\n\n不具合がないか今のうちに確認しましょう。'
  );
}

function createWeeklyWarrantyTrigger() {
  const ui = SpreadsheetApp.getUi();
  const existing = ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'checkWarrantyExpiry');

  existing.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('checkWarrantyExpiry')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  ui.alert('週次通知トリガーを作成しました（月曜 8時台）。');
}

function issueNextId_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  const values = sheet.getRange(2, COL.ID, maxRows, 1).getValues().flat();
  const pattern = new RegExp('^' + ID_PREFIX + '(\\d+)$');
  const maxNum = values.reduce((max, value) => {
    const match = String(value || '').trim().match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return ID_PREFIX + String(maxNum + 1).padStart(4, '0');
}

function issuePaperStorage_(sheet, category) {
  const categoryText = String(category || '').trim();
  if (!categoryText) return '';

  const code = getPaperCodeForCategory_(categoryText);
  const escapedCode = escapeRegExp_(code);
  const pattern = new RegExp('（' + escapedCode + '）の(\\d+)');
  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  const values = sheet.getRange(2, COL.PAPER_STORAGE, maxRows, 1).getValues().flat();
  const maxNum = values.reduce((max, value) => {
    const match = String(value || '').match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return categoryText + '（' + code + '）の' + String(maxNum + 1).padStart(3, '0');
}

function getPaperCodeForCategory_(category) {
  const settings = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!settings) return 'OT';

  const lastRow = Math.max(settings.getLastRow(), 2);
  const values = settings.getRange(2, 2, lastRow - 1, 3).getValues();
  for (const row of values) {
    const categoryName = String(row[0] || '').trim();
    const code = String(row[2] || '').trim();
    if (categoryName === String(category).trim() && code) return code;
  }

  return 'OT';
}

function ensureRowFormulas_(sheet, row) {
  sheet.getRange(row, COL.WARRANTY_LIMIT).setFormulaR1C1(
    '=IF(OR(RC[-9]="",RC[-2]=""),"",EDATE(RC[-9],MAX(RC[-2],N(RC[-1])))-1)'
  );
  sheet.getRange(row, COL.WARRANTY_STATUS).setFormulaR1C1(
    '=IF(RC[-1]="","",IF(RC[-11]<>"使用中","─",IF(TODAY()>RC[-1],"期限切れ",IF(RC[-1]-TODAY()<=30,"あと"&(RC[-1]-TODAY())&"日","保証中"))))'
  );
}

function findNextProductRow_(sheet) {
  const maxRows = sheet.getMaxRows();
  const width = COL.SCAN_STATUS;
  const values = sheet.getRange(2, 1, Math.max(maxRows - 1, 1), width).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const meaningful = [
      row[COL.ID - 1],
      row[COL.STATUS - 1],
      row[COL.PURCHASE_DATE - 1],
      row[COL.MAKER - 1],
      row[COL.NAME - 1],
      row[COL.MODEL - 1],
      row[COL.CATEGORY - 1],
      row[COL.PURCHASE_SOURCE - 1],
      row[COL.PRICE - 1],
      row[COL.WARRANTY_MONTHS - 1],
      row[COL.EXTENDED_WARRANTY_MONTHS - 1],
      row[COL.FOLDER_LINK - 1],
      row[COL.LOCATION - 1],
      row[COL.MEMO - 1],
      row[COL.MANUAL_STATUS - 1],
      row[COL.PAPER_STORAGE - 1],
      row[COL.OFFICIAL_MANUAL_URL - 1],
      row[COL.SCAN_STATUS - 1],
    ];
    if (meaningful.every(value => value === '' || value === null)) return i + 2;
  }

  return maxRows + 1;
}

function ensureRows_(sheet, row) {
  if (row <= sheet.getMaxRows()) return;
  sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
}

function isBatchRowEmpty_(values) {
  const requiredArea = values.slice(BATCH_COL.PURCHASE_DATE - 1, BATCH_COL.MEMO);
  return requiredArea.every(value => value === '' || value === null);
}

function shouldDefaultToUnscanned_(manualStatus) {
  return ['紙あり', '後でスキャン', '公式なし'].includes(String(manualStatus || '').trim());
}

function getParentFolderOrAlert_() {
  const folder = getFolderFromProperty_('PARENT_FOLDER_ID');
  if (folder) return folder;

  SpreadsheetApp.getUi().alert(
    '親フォルダが未設定です。\n' +
    '先に「マニュアル管理 > 初期セットアップ」を実行してください。'
  );
  return null;
}

function getFolderFromProperty_(propertyName) {
  const folderId = PropertiesService.getDocumentProperties().getProperty(propertyName);
  if (!folderId) return null;

  try {
    return DriveApp.getFolderById(folderId);
  } catch (error) {
    return null;
  }
}

function getOrCreateFolderByName_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function getOrCreateChildFolder_(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function sanitizeDriveName_(value) {
  return String(value)
    .trim()
    .replace(/[\\/:*?"<>|#{}\[\]\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNotifyEmail_() {
  const email = NOTIFY_EMAIL || Session.getActiveUser().getEmail();
  if (!email) throw new Error('通知先メールアドレスを設定してください。');
  return email;
}

function writeSetupLinks_(rootFolder, inboxFolder) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) return;

  sheet.getRange('F2').setValue(rootFolder.getUrl());
  sheet.getRange('F3').setValue(inboxFolder.getUrl());
  sheet.getRange('F4').setValue(getNotifyEmail_());
  sheet.getRange('F5').setValue(NOTIFY_DAYS);
}

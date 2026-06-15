import fs from 'node:fs';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { GOOGLE_TOKENS_PATH } from '../config.js';
import { makeSafeSegment, readSettings } from '../lib/storage.js';

const DRIVE_SCOPE = ['https://www.googleapis.com/auth/drive.file'];

export async function getDriveStatus() {
  const settings = await readSettings({ revealSecrets: true });
  const configured = Boolean(settings.googleDrive?.clientId && settings.googleDrive?.clientSecret);
  const authenticated = fs.existsSync(GOOGLE_TOKENS_PATH);
  return {
    configured,
    authenticated,
    rootFolderName: settings.googleDrive?.rootFolderName || '取扱説明書ライブラリ',
    redirectUri: settings.googleDrive?.redirectUri
  };
}

export async function makeGoogleAuthUrl() {
  const auth = await makeOAuthClient();
  return auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: DRIVE_SCOPE
  });
}

export async function handleGoogleOAuthCallback(code) {
  const auth = await makeOAuthClient();
  const { tokens } = await auth.getToken(code);
  await fs.promises.writeFile(GOOGLE_TOKENS_PATH, `${JSON.stringify(tokens, null, 2)}\n`);
  return tokens;
}

export async function uploadPdfToDrive({ product, manual, buffer }) {
  const auth = await makeAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });
  const settings = await readSettings({ revealSecrets: true });
  const rootName = settings.googleDrive?.rootFolderName || '取扱説明書ライブラリ';
  const rootFolderId = await getOrCreateFolder(drive, rootName);
  const categoryFolderId = await getOrCreateFolder(drive, makeSafeSegment(product.category || 'その他'), rootFolderId);
  const productFolderName = makeSafeSegment(`${product.productId}_${product.maker || ''}_${product.name || ''}_${product.model || ''}`);
  const productFolderId = await getOrCreateFolder(drive, productFolderName, categoryFolderId);
  const filename = `${makeSafeSegment(manual.type || 'manual')}_${makeSafeSegment(manual.title || '取扱説明書')}.pdf`;

  const uploaded = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [productFolderId],
      mimeType: 'application/pdf'
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(buffer)
    },
    fields: 'id,name,webViewLink,webContentLink'
  });

  return {
    storage: 'google-drive',
    fileId: uploaded.data.id,
    name: uploaded.data.name,
    webViewLink: uploaded.data.webViewLink,
    webContentLink: uploaded.data.webContentLink,
    folderId: productFolderId
  };
}

async function makeOAuthClient() {
  const settings = await readSettings({ revealSecrets: true });
  const { clientId, clientSecret, redirectUri } = settings.googleDrive || {};
  if (!clientId || !clientSecret) {
    throw new Error('Google DriveのOAuthクライアントIDとシークレットを設定してください。');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function makeAuthenticatedClient() {
  const auth = await makeOAuthClient();
  if (!fs.existsSync(GOOGLE_TOKENS_PATH)) {
    throw new Error('Google Driveにまだログインしていません。');
  }
  const tokens = JSON.parse(await fs.promises.readFile(GOOGLE_TOKENS_PATH, 'utf8'));
  auth.setCredentials(tokens);
  auth.on('tokens', async nextTokens => {
    const merged = { ...tokens, ...nextTokens };
    await fs.promises.writeFile(GOOGLE_TOKENS_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  });
  return auth;
}

async function getOrCreateFolder(drive, name, parentId = null) {
  const queryParts = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false'
  ];
  if (parentId) queryParts.push(`'${parentId}' in parents`);

  const existing = await drive.files.list({
    q: queryParts.join(' and '),
    spaces: 'drive',
    fields: 'files(id,name)',
    pageSize: 1
  });
  if (existing.data.files?.[0]?.id) return existing.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    },
    fields: 'id'
  });
  return created.data.id;
}

function escapeDriveQuery(value) {
  return String(value).replace(/'/g, "\\'");
}

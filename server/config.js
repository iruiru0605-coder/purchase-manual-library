import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export const PORT = Number(process.env.PORT || 5174);
export const DATA_DIR = process.env.MANUAL_LIBRARY_DATA_DIR || path.join(repoRoot, '.manual-library');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
export const GOOGLE_TOKENS_PATH = path.join(DATA_DIR, 'google-tokens.json');
export const MAX_PDF_BYTES = 80 * 1024 * 1024;

export const DEFAULT_CATEGORIES = [
  { name: 'キッチン家電', box: 'BOX-01', code: 'KI' },
  { name: '生活家電', box: 'BOX-02', code: 'SE' },
  { name: 'PC・周辺機器', box: 'BOX-03', code: 'PC' },
  { name: 'スマホ・充電', box: 'BOX-04', code: 'SM' },
  { name: '家具・設備', box: 'BOX-05', code: 'FU' },
  { name: '工具', box: 'BOX-06', code: 'TO' },
  { name: '子ども用品', box: 'BOX-07', code: 'KD' },
  { name: '健康器具', box: 'BOX-08', code: 'HE' },
  { name: '車用品', box: 'BOX-09', code: 'CA' },
  { name: 'ソフトウェア', box: 'BOX-10', code: 'SW' },
  { name: 'その他', box: 'BOX-99', code: 'OT' }
];

export const DEFAULT_SETTINGS = {
  llm: {
    providerName: 'OpenAI互換API',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: ''
  },
  googleDrive: {
    clientId: '',
    clientSecret: '',
    redirectUri: `http://localhost:${PORT}/api/google/oauth/callback`,
    rootFolderName: '取扱説明書ライブラリ'
  },
  app: {
    libraryTitle: '取説ライブラリ',
    archiveMode: 'local-only'
  },
  categories: DEFAULT_CATEGORIES
};

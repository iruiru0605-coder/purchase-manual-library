import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bot,
  Check,
  ChevronRight,
  Database,
  ExternalLink,
  FileSearch,
  FolderSync,
  HardDrive,
  Library,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Upload,
  X
} from 'lucide-react';
import { apiGet, apiPost, apiUploadCsv } from './api.js';

const TABS = [
  { id: 'inbox', label: '購入履歴Inbox', icon: Upload },
  { id: 'library', label: 'ライブラリ', icon: Library },
  { id: 'settings', label: '設定', icon: Settings }
];

const STATUS_LABELS = {
  suggested: '登録候補',
  accepted: '登録する',
  rejected: '不要',
  later: '後で確認',
  review: '未判定',
  registered: '登録済み'
};

export default function App() {
  const [state, setState] = useState(null);
  const [activeTab, setActiveTab] = useState('inbox');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  const candidates = state?.candidates || [];
  const selectedCandidate = candidates.find(item => item.id === selectedId) || candidates[0] || null;

  useEffect(() => {
    if (!selectedId && candidates[0]) setSelectedId(candidates[0].id);
  }, [candidates, selectedId]);

  async function refresh() {
    setError('');
    const next = await apiGet('/api/state').catch(handleError);
    if (next) setState(next);
  }

  function handleError(err) {
    setError(err.message || String(err));
    return null;
  }

  async function run(label, action) {
    setBusy(label);
    setMessage('');
    setError('');
    try {
      const result = await action();
      await refresh();
      setMessage(result?.message || '完了しました。');
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><FileSearch size={22} /></div>
          <div>
            <strong>取説ライブラリ</strong>
            <span>購入履歴から自動登録</span>
          </div>
        </div>
        <nav>
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <div><Database size={16} /> 候補 {candidates.length}件</div>
          <div><Archive size={16} /> 登録済み {state?.products?.length || 0}件</div>
          <div><HardDrive size={16} /> Drive {state?.drive?.authenticated ? '接続済み' : '未接続'}</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{TABS.find(tab => tab.id === activeTab)?.label}</h1>
            <p>{subtitleFor(activeTab)}</p>
          </div>
          <button className="icon-button" onClick={refresh} title="再読み込み">
            <RefreshCw size={18} />
          </button>
        </header>

        {error && <div className="notice error"><X size={16} />{error}</div>}
        {message && <div className="notice success"><Check size={16} />{message}</div>}
        {busy && <div className="notice working"><Loader2 className="spin" size={16} />{busy}</div>}

        {activeTab === 'inbox' && (
          <Inbox
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            setSelectedId={setSelectedId}
            onRun={run}
            busy={busy}
          />
        )}
        {activeTab === 'library' && (
          <LibraryView products={state?.products || []} query={query} setQuery={setQuery} />
        )}
        {activeTab === 'settings' && (
          <SettingsView state={state} onRun={run} />
        )}
      </main>
    </div>
  );
}

function Inbox({ candidates, selectedCandidate, setSelectedId, onRun, busy }) {
  const [source, setSource] = useState('Amazon');
  const [file, setFile] = useState(null);
  const visible = useMemo(() => candidates.filter(item => item.status !== 'registered'), [candidates]);

  async function uploadCsv() {
    if (!file) throw new Error('CSVファイルを選択してください。');
    const result = await apiUploadCsv(file, source);
    return { message: `${result.candidates.length}件を取り込みました。` };
  }

  return (
    <div className="inbox-layout">
      <section className="panel import-panel">
        <div className="panel-head">
          <h2><Upload size={18} />CSV取り込み</h2>
          <span>Amazon優先。楽天・メルカリも同じ入口で受けます。</span>
        </div>
        <div className="import-controls">
          <select value={source} onChange={event => setSource(event.target.value)}>
            <option>Amazon</option>
            <option>楽天</option>
            <option>メルカリ</option>
            <option>手入力CSV</option>
          </select>
          <label className="file-picker">
            <input type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)} />
            {file ? file.name : 'CSVを選択'}
          </label>
          <button className="primary" onClick={() => onRun('CSVを取り込んでいます...', uploadCsv)} disabled={Boolean(busy)}>
            <Upload size={16} />取り込む
          </button>
        </div>
      </section>

      <section className="candidate-grid">
        <div className="candidate-list panel">
          <div className="panel-head compact">
            <h2><ShieldCheck size={18} />登録候補</h2>
            <span>{visible.length}件</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>状態</th>
                  <th>商品</th>
                  <th>購入元</th>
                  <th>推定</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(candidate => (
                  <tr key={candidate.id} className={selectedCandidate?.id === candidate.id ? 'selected' : ''}>
                    <td><StatusBadge status={candidate.status} /></td>
                    <td>
                      <button className="link-button product-title" onClick={() => setSelectedId(candidate.id)}>
                        {candidate.title || '商品名未設定'}
                      </button>
                      <small>{candidate.purchaseDate || '購入日不明'} {candidate.price ? ` / ${candidate.price.toLocaleString()}円` : ''}</small>
                    </td>
                    <td>{candidate.source}</td>
                    <td>{candidate.registrationScore}</td>
                    <td><ChevronRight size={16} /></td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan="5" className="empty">CSVを取り込むと、ここに登録候補が表示されます。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <CandidateDetail candidate={selectedCandidate} onRun={onRun} busy={busy} />
      </section>
    </div>
  );
}

function CandidateDetail({ candidate, onRun, busy }) {
  if (!candidate) {
    return (
      <section className="panel detail-panel empty-detail">
        <FileSearch size={32} />
        <p>候補を選択してください。</p>
      </section>
    );
  }

  const selectedManualIds = candidate.selectedManualIds || (candidate.manualCandidates || []).filter(item => item.selected).map(item => item.id);

  const isRegistered = candidate.status === 'registered';

  function setStatus(status) {
    return onRun('状態を更新しています...', async () => {
      await apiPost(`/api/candidates/${candidate.id}/status`, { status });
      return { message: `「${STATUS_LABELS[status]}」にしました。` };
    });
  }

  function enrich() {
    return onRun('AIで商品情報を補完しています...', async () => {
      await apiPost(`/api/candidates/${candidate.id}/enrich`);
      return { message: '商品情報を補完しました。' };
    });
  }

  function searchManuals() {
    return onRun('公式マニュアル候補を探しています...', async () => {
      await apiPost(`/api/candidates/${candidate.id}/search-manuals`);
      return { message: 'マニュアル候補を更新しました。' };
    });
  }

  function toggleManual(manualId) {
    const next = selectedManualIds.includes(manualId)
      ? selectedManualIds.filter(id => id !== manualId)
      : [...selectedManualIds, manualId];
    return onRun('PDF候補の選択を保存しています...', async () => {
      await apiPost(`/api/candidates/${candidate.id}/select-manuals`, { selectedManualIds: next });
      return { message: 'PDF候補の選択を保存しました。' };
    });
  }

  function register() {
    return onRun('登録し、PDFを保存しています...', async () => {
      await apiPost(`/api/candidates/${candidate.id}/register`, { selectedManualIds });
      return { message: 'ライブラリへ登録しました。' };
    });
  }

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <StatusBadge status={candidate.status} />
          <h2>{candidate.title}</h2>
          <p>{candidate.source} / {candidate.purchaseDate || '購入日不明'}</p>
        </div>
        {candidate.sourceUrl && (
          <a className="icon-button" href={candidate.sourceUrl} target="_blank" rel="noreferrer" title="購入ページを開く">
            <ExternalLink size={17} />
          </a>
        )}
      </div>

      <div className="action-row">
        <button onClick={() => setStatus('accepted')} disabled={Boolean(busy) || isRegistered}><Check size={16} />登録する</button>
        <button onClick={() => setStatus('later')} disabled={Boolean(busy) || isRegistered}>後で確認</button>
        <button onClick={() => setStatus('rejected')} disabled={Boolean(busy) || isRegistered}><X size={16} />不要</button>
      </div>

      <div className="section-block">
        <div className="section-title">
          <h3><Bot size={17} />商品情報補完</h3>
          <button onClick={enrich} disabled={Boolean(busy)}><Bot size={16} />AI補完</button>
        </div>
        {candidate.enrichment ? (
          <dl className="metadata-grid">
            <div><dt>メーカー</dt><dd>{candidate.enrichment.maker || '要確認'}</dd></div>
            <div><dt>商品名</dt><dd>{candidate.enrichment.productName}</dd></div>
            <div><dt>型番</dt><dd>{candidate.enrichment.model || '要確認'}</dd></div>
            <div><dt>カテゴリ</dt><dd>{candidate.enrichment.category}</dd></div>
            <div><dt>信頼度</dt><dd>{Math.round((candidate.enrichment.confidence || 0) * 100)}%</dd></div>
            <div><dt>確認</dt><dd>{candidate.enrichment.needsReview ? '要確認' : '概ねOK'}</dd></div>
          </dl>
        ) : (
          <p className="muted">AI補完を実行すると、メーカー・型番・カテゴリ・検索語を推定します。</p>
        )}
      </div>

      <div className="section-block">
        <div className="section-title">
          <h3><FileSearch size={17} />PDF候補</h3>
          <button onClick={searchManuals} disabled={Boolean(busy)}><Search size={16} />候補を探す</button>
        </div>
        <div className="manual-list">
          {(candidate.manualCandidates || []).map(manual => (
            <label key={manual.id} className="manual-row">
              <input
                type="checkbox"
                checked={selectedManualIds.includes(manual.id)}
                onChange={() => toggleManual(manual.id)}
              />
              <span>
                <strong>{manual.type}</strong>
                <b>{manual.title}</b>
                <small>{manual.sourceHost} / {manual.sourceType} / score {manual.score}</small>
              </span>
              <a href={manual.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} title="PDFを開く">
                <ExternalLink size={16} />
              </a>
            </label>
          ))}
          {(candidate.manualCandidates || []).length === 0 && (
            <p className="muted">候補探索を実行すると、公式サイト優先でPDFを探します。</p>
          )}
        </div>
      </div>

      <button className="register-button" onClick={register} disabled={Boolean(busy) || candidate.status === 'rejected' || isRegistered}>
        <FolderSync size={18} />{isRegistered ? '登録済み' : '選択したPDFを保存して登録'}
      </button>
    </section>
  );
}

function LibraryView({ products, query, setQuery }) {
  const filtered = products.filter(product => {
    const text = `${product.maker} ${product.name} ${product.model} ${product.category} ${product.paperStorage}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div className="library-layout">
      <div className="searchbar">
        <Search size={18} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="商品名、型番、カテゴリ、紙の保管先で検索" />
      </div>
      <div className="product-list">
        {filtered.map(product => (
          <article className="product-card" key={product.id}>
            <div className="product-main">
              <span className="product-id">{product.productId}</span>
              <h2>{product.maker} {product.name}</h2>
              <p>{product.model || '型番未設定'} / {product.category}</p>
              <div className="paper-storage">{product.paperStorage}</div>
            </div>
            <div className="manual-chip-list">
              {(product.manuals || []).map(manual => (
                <a key={manual.id} href={manual.archive?.webViewLink || manual.url} target="_blank" rel="noreferrer" className={manual.archiveStatus === 'saved' ? 'manual-chip' : 'manual-chip failed'}>
                  {manual.type}
                </a>
              ))}
              {(product.manuals || []).length === 0 && <span className="muted">PDF未保存</span>}
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="panel empty-library">
            <Smartphone size={36} />
            <p>登録済みの商品はまだありません。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ state, onRun }) {
  const [settings, setSettings] = useState(state?.settings || null);

  useEffect(() => {
    setSettings(state?.settings || null);
  }, [state]);

  if (!settings) return null;

  function update(path, value) {
    setSettings(current => {
      const next = structuredClone(current);
      const [section, key] = path.split('.');
      next[section][key] = value;
      return next;
    });
  }

  function save() {
    return onRun('設定を保存しています...', async () => {
      await apiPost('/api/settings', settings);
      return { message: '設定を保存しました。' };
    });
  }

  function googleLogin() {
    return onRun('Google認証URLを作成しています...', async () => {
      const result = await apiGet('/api/google/oauth/start');
      window.open(result.url, '_blank', 'noopener,noreferrer');
      return { message: 'Google認証タブを開きました。認証後に再読み込みしてください。' };
    });
  }

  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2><Bot size={18} />LLM設定</h2>
          <span>DeepSeekなどOpenAI互換APIを指定できます。</span>
        </div>
        <Field label="Provider名" value={settings.llm.providerName} onChange={value => update('llm.providerName', value)} />
        <Field label="API Base URL" value={settings.llm.apiBaseUrl} onChange={value => update('llm.apiBaseUrl', value)} />
        <Field label="Model Name" value={settings.llm.model} onChange={value => update('llm.model', value)} />
        <Field label="API Key" type="password" value={settings.llm.apiKey} onChange={value => update('llm.apiKey', value)} />
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2><HardDrive size={18} />Google Drive</h2>
          <span>{state?.drive?.authenticated ? 'OAuth認証済み' : '未認証。未認証時はローカル保存します。'}</span>
        </div>
        <Field label="OAuth Client ID" value={settings.googleDrive.clientId} onChange={value => update('googleDrive.clientId', value)} />
        <Field label="OAuth Client Secret" type="password" value={settings.googleDrive.clientSecret} onChange={value => update('googleDrive.clientSecret', value)} />
        <Field label="Redirect URI" value={settings.googleDrive.redirectUri} onChange={value => update('googleDrive.redirectUri', value)} />
        <Field label="Driveルートフォルダ名" value={settings.googleDrive.rootFolderName} onChange={value => update('googleDrive.rootFolderName', value)} />
        <div className="action-row">
          <button className="primary" onClick={save}><Settings size={16} />設定を保存</button>
          <button onClick={googleLogin}><HardDrive size={16} />Google Driveにログイン</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ''} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

function subtitleFor(tab) {
  if (tab === 'inbox') return 'CSVから登録候補を作り、必要な商品だけライブラリへ送ります。';
  if (tab === 'library') return 'スマホでも探しやすい、登録済み取扱説明書の一覧です。';
  return 'LLMとGoogle Driveの接続を設定します。';
}

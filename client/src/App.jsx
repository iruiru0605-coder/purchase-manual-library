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
  Save,
  Smartphone,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { apiDelete, apiGet, apiImportText, apiPatch, apiPost, apiUploadCsv, apiUploadManual } from './api.js';

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
          <LibraryView
            products={state?.products || []}
            categories={state?.settings?.categories || []}
            query={query}
            setQuery={setQuery}
            onRun={run}
          />
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
  const [pastedText, setPastedText] = useState('');
  const visible = useMemo(() => candidates.filter(item => item.status !== 'registered'), [candidates]);

  async function uploadCsv() {
    if (!file) throw new Error('CSVファイルを選択してください。');
    const result = await apiUploadCsv(file, source);
    return { message: `${result.candidates.length}件を取り込みました。` };
  }

  async function importPastedText() {
    const result = await apiImportText(pastedText, source);
    setPastedText('');
    return { message: `${result.candidates.length}件を貼り付けテキストから取り込みました。` };
  }

  return (
    <div className="inbox-layout">
      <section className="panel import-panel">
        <div className="panel-head">
          <h2><Upload size={18} />取り込み</h2>
          <span>CSVがなくても、購入履歴ページのコピー貼り付けで候補化できます。</span>
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
        <div className="paste-import">
          <div>
            <strong>購入履歴ページを貼り付け</strong>
            <span>Amazonや楽天の購入履歴画面で、注文カード周辺を選択してコピーし、ここへ貼り付けます。</span>
          </div>
          <textarea
            value={pastedText}
            onChange={event => setPastedText(event.target.value)}
            placeholder={'例:\n注文日 2026年6月12日\n注文番号 123-4567890-1234567\nPanasonic 食器洗い乾燥機 NP-TZ300-W\n￥76,800'}
          />
          <button onClick={() => onRun('貼り付けテキストを解析しています...', importPastedText)} disabled={Boolean(busy) || !pastedText.trim()}>
            <FileSearch size={16} />貼り付けから取り込む
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

  function deleteCandidate() {
    return onRun('取り込み候補を削除しています...', async () => {
      await apiDelete(`/api/candidates/${candidate.id}`);
      return { message: '取り込み候補を削除しました。' };
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
        {!isRegistered && <button onClick={deleteCandidate} disabled={Boolean(busy)}><Trash2 size={16} />削除</button>}
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

function LibraryView({ products, categories, query, setQuery, onRun }) {
  const [categoryFilter, setCategoryFilter] = useState('');
  const filtered = products.filter(product => {
    const text = `${product.maker} ${product.name} ${product.model} ${product.category} ${product.paperStorage}`.toLowerCase();
    const categoryOk = !categoryFilter || product.category === categoryFilter;
    return categoryOk && text.includes(query.toLowerCase());
  });

  return (
    <div className="library-layout">
      <div className="searchbar">
        <Search size={18} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="商品名、型番、カテゴリ、紙の保管先で検索" />
        <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} aria-label="カテゴリで絞り込み">
          <option value="">すべてのカテゴリ</option>
          {categories.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
        </select>
      </div>
      <div className="product-list">
        {filtered.map(product => (
          <ProductCard key={product.id} product={product} categories={categories} onRun={onRun} />
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

function ProductCard({ product, categories, onRun }) {
  const [draft, setDraft] = useState(product);
  const [manualFile, setManualFile] = useState(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualType, setManualType] = useState('取扱説明書');

  useEffect(() => {
    setDraft(product);
  }, [product]);

  function setField(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function saveProduct() {
    return onRun('商品情報を保存しています...', async () => {
      await apiPatch(`/api/products/${product.id}`, draft);
      return { message: '商品情報を保存しました。' };
    });
  }

  function deleteProduct() {
    return onRun('商品を削除しています...', async () => {
      await apiDelete(`/api/products/${product.id}`);
      return { message: '商品を削除しました。' };
    });
  }

  function uploadManual() {
    return onRun('PDFをアップロードしています...', async () => {
      if (!manualFile) throw new Error('PDFファイルを選択してください。');
      await apiUploadManual(product.id, manualFile, { title: manualTitle, type: manualType });
      setManualFile(null);
      setManualTitle('');
      return { message: 'PDFを追加しました。' };
    });
  }

  function deleteManual(manualId) {
    return onRun('PDF情報を削除しています...', async () => {
      await apiDelete(`/api/products/${product.id}/manuals/${manualId}`);
      return { message: 'PDF情報を削除しました。' };
    });
  }

  return (
    <article className="product-card editable-product">
      <div className="product-main">
        <span className="product-id">{product.productId}</span>
        <div className="product-edit-grid">
          <Field label="メーカー" value={draft.maker} onChange={value => setField('maker', value)} />
          <Field label="商品名" value={draft.name} onChange={value => setField('name', value)} />
          <Field label="型番・品番" value={draft.model} onChange={value => setField('model', value)} />
          <label className="field">
            <span>カテゴリ</span>
            <select value={draft.category || ''} onChange={event => setField('category', event.target.value)}>
              <option value="">未設定</option>
              {categories.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
            </select>
          </label>
          <Field label="購入日" value={draft.purchaseDate} onChange={value => setField('purchaseDate', value)} />
          <Field label="メーカー保証(月)" value={draft.warrantyMonths || ''} onChange={value => setField('warrantyMonths', value)} />
          <Field label="延長保証(月)" value={draft.extendedWarrantyMonths || ''} onChange={value => setField('extendedWarrantyMonths', value)} />
          <Field label="紙マニュアル保管先" value={draft.paperStorage} onChange={value => setField('paperStorage', value)} />
        </div>
        <div className="warranty-line">
          保証期限: <strong>{product.warrantyExpiresAt || '未設定'}</strong>
        </div>
        <label className="field product-note-field">
          <span>メモ</span>
          <textarea value={draft.notes || ''} onChange={event => setField('notes', event.target.value)} />
        </label>
        <div className="action-row">
          <button className="primary" onClick={saveProduct}><Save size={16} />保存</button>
          <button onClick={deleteProduct}><Trash2 size={16} />商品を削除</button>
        </div>
      </div>
      <div className="manual-manager">
        <div className="manual-upload">
          <strong>PDF追加・入れ替え</strong>
          <span>公式PDFがない場合は、スキャンPDFをここから追加します。入れ替えは旧PDFを削除してから追加します。</span>
          <select value={manualType} onChange={event => setManualType(event.target.value)}>
            <option>取扱説明書</option>
            <option>設置説明書</option>
            <option>クイックガイド</option>
            <option>保証関連</option>
            <option>その他</option>
          </select>
          <input value={manualTitle} onChange={event => setManualTitle(event.target.value)} placeholder="PDF表示名" />
          <label className="file-picker">
            <input type="file" accept="application/pdf,.pdf" onChange={event => setManualFile(event.target.files?.[0] || null)} />
            {manualFile ? manualFile.name : 'PDFを選択'}
          </label>
          <button onClick={uploadManual}><Upload size={16} />PDFを追加</button>
        </div>
        <div className="manual-chip-list">
          {(product.manuals || []).map(manual => (
            <div key={manual.id} className={manual.archiveStatus === 'saved' ? 'manual-chip-row' : 'manual-chip-row failed'}>
              <a href={manualHref(product, manual)} target="_blank" rel="noreferrer">{manual.type}: {manual.title}</a>
              <button className="small-icon-button" onClick={() => deleteManual(manual.id)} title="PDF情報を削除"><Trash2 size={14} /></button>
            </div>
          ))}
          {(product.manuals || []).length === 0 && <span className="muted">PDF未保存。手元のPDFを追加できます。</span>}
        </div>
      </div>
    </article>
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

  function applyDeepSeekDefaults() {
    setSettings(current => ({
      ...current,
      llm: {
        ...current.llm,
        providerName: 'DeepSeek',
        apiBaseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash'
      }
    }));
  }

  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2><Bot size={18} />LLM設定</h2>
          <span>DeepSeekなどOpenAI互換APIを指定できます。</span>
        </div>
        <div className="action-row">
          <button onClick={applyDeepSeekDefaults}><Bot size={16} />DeepSeek v4 推奨値を入力</button>
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

function manualHref(product, manual) {
  if (manual.archive?.webViewLink) return manual.archive.webViewLink;
  if (manual.archive?.storage === 'local') return `/api/products/${product.id}/manuals/${manual.id}/file`;
  return manual.url || `/api/products/${product.id}/manuals/${manual.id}/file`;
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

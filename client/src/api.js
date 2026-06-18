export async function apiGet(path) {
  const response = await safeFetch(path);
  return parseResponse(response);
}

export async function apiPost(path, body) {
  return apiRequest(path, 'POST', body);
}

export async function apiPatch(path, body) {
  return apiRequest(path, 'PATCH', body);
}

export async function apiDelete(path) {
  const response = await safeFetch(path, { method: 'DELETE' });
  return parseResponse(response);
}

export async function apiRequest(path, method, body) {
  const response = await safeFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

export async function apiUploadCsv(file, source) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);
  const response = await safeFetch('/api/imports/csv', {
    method: 'POST',
    body: formData
  });
  return parseResponse(response);
}

export async function apiImportText(text, source) {
  return apiPost('/api/imports/text', { text, source });
}

export async function apiUploadManual(productId, file, { title, type }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title || file.name.replace(/\.pdf$/i, ''));
  formData.append('type', type || '取扱説明書');
  const response = await safeFetch(`/api/products/${productId}/manuals/upload`, {
    method: 'POST',
    body: formData
  });
  return parseResponse(response);
}

export async function apiUploadProductImage(productId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await safeFetch(`/api/products/${productId}/image`, {
    method: 'POST',
    body: formData
  });
  return parseResponse(response);
}

async function safeFetch(path, options) {
  try {
    return await fetch(path, options);
  } catch (error) {
    throw new Error('アプリのAPIに接続できません。開発サーバーを再起動してから、ページを再読み込みしてください。');
  }
}

async function parseResponse(response) {
  const text = await response.text().catch(() => '');
  const payload = text ? parseJson(text) : {};
  if (!response.ok) {
    const detail = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : text.trim();
    throw new Error(detail || `APIエラーが発生しました。(${response.status})`);
  }
  return payload;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

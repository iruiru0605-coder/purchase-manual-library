export async function apiGet(path) {
  const response = await fetch(path);
  return parseResponse(response);
}

export async function apiPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return parseResponse(response);
}

export async function apiUploadCsv(file, source) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);
  const response = await fetch('/api/imports/csv', {
    method: 'POST',
    body: formData
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'APIエラーが発生しました。');
  }
  return payload;
}

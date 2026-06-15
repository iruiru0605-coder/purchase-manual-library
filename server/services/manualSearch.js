import * as cheerio from 'cheerio';
import { makeManualId } from '../lib/storage.js';
import { MAX_PDF_BYTES } from '../config.js';

const BLOCKED_HOST_HINTS = [
  'manualslib.com', 'manualzz.com', 'scribd.com', 'slideshare.net', 'facebook.com',
  'x.com', 'twitter.com', 'amazon.', 'rakuten.', 'mercari.'
];

export async function searchManualCandidates(candidate) {
  const enrichment = candidate.enrichment || {};
  const queries = enrichment.searchQueries?.length
    ? enrichment.searchQueries
    : [`${candidate.title} 取扱説明書 PDF 公式`, `${candidate.title} マニュアル PDF`];

  const seen = new Set();
  const manualCandidates = [];
  const pagesToInspect = [];

  for (const query of queries.slice(0, 6)) {
    const results = await duckDuckGoSearch(query);
    for (const result of results.slice(0, 8)) {
      if (!result.url || seen.has(result.url)) continue;
      seen.add(result.url);

      if (isPdfUrl(result.url)) {
        manualCandidates.push(makeManualCandidate(result.url, result.title, result.snippet, candidate, 'search-result-pdf'));
      } else if (shouldInspectPage(result.url, candidate)) {
        pagesToInspect.push(result);
      }
    }
  }

  for (const page of pagesToInspect.slice(0, 10)) {
    const links = await extractPdfLinksFromPage(page.url);
    for (const link of links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      manualCandidates.push(makeManualCandidate(link.url, link.title || page.title, page.snippet, candidate, 'official-page-link'));
    }
  }

  return manualCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map((manual, index) => ({ ...manual, rank: index + 1 }));
}

export async function downloadPdf(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': userAgent() }
  });
  if (!response.ok) {
    throw new Error(`PDFを取得できませんでした: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_PDF_BYTES) {
    throw new Error('PDFが大きすぎます。');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error('PDFが大きすぎます。');
  }
  if (!contentType.includes('pdf') && !url.toLowerCase().includes('.pdf')) {
    throw new Error('取得先がPDFではない可能性があります。');
  }
  return buffer;
}

async function duckDuckGoSearch(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent() }
  });
  if (!response.ok) return [];
  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_, element) => {
    const link = $(element).find('.result__a').first();
    const title = link.text().trim();
    const href = unwrapDuckDuckGoUrl(link.attr('href') || '');
    const snippet = $(element).find('.result__snippet').text().trim();
    if (title && href) results.push({ title, url: href, snippet });
  });

  return results;
}

async function extractPdfLinksFromPage(pageUrl) {
  try {
    const first = await collectPdfAndFollowLinks(pageUrl);
    const secondary = [];
    for (const followUrl of first.followUrls.slice(0, 5)) {
      const nested = await collectPdfAndFollowLinks(followUrl);
      secondary.push(...nested.pdfs);
    }
    return dedupeLinks([...first.pdfs, ...secondary]).slice(0, 25);
  } catch {
    return [];
  }
}

async function collectPdfAndFollowLinks(pageUrl) {
  const response = await fetch(pageUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(10000)
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('html')) return { pdfs: [], followUrls: [] };
  const html = await response.text();
  const $ = cheerio.load(html);
  const base = new URL(response.url || pageUrl);
  const pdfs = [];
  const followUrls = [];

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const absolute = new URL(href, base).toString();
    const label = $(element).text().trim().replace(/\s+/g, ' ') || pathTail(absolute);
    const signal = `${href} ${label}`;
    if (isPdfUrl(absolute)) {
      pdfs.push({ url: absolute, title: label });
      return;
    }
    if (/取扱|説明書|マニュアル|設置|ガイド|manual|support|download|サポート|ダウンロード/i.test(signal)) {
      followUrls.push(absolute);
    }
  });

  const derivedUrls = deriveLikelySupportUrls(response.url || pageUrl);
  return { pdfs: dedupeLinks(pdfs), followUrls: [...new Set([...derivedUrls, ...followUrls])] };
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter(link => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function deriveLikelySupportUrls(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const productMatch = url.pathname.match(/^(.*\/products\/)([^/.]+)\.html$/);
    if (!productMatch) return [];
    const [, prefix, slug] = productMatch;
    return [
      new URL(`${prefix}${slug}/support.html`, url.origin).toString(),
      new URL(`${prefix}${slug}/manual.html`, url.origin).toString()
    ];
  } catch {
    return [];
  }
}

function makeManualCandidate(url, title, snippet, candidate, discoveryMethod) {
  const enrichment = candidate.enrichment || {};
  const type = classifyManual(title, url);
  const hostname = safeHostname(url);
  const officialLikely = isOfficialLike(hostname, enrichment.maker);
  const manualLike = isManualLike(title, url);
  const pressLike = /news|press|ニュース|発売|発表|newsroom/i.test(`${title} ${url} ${snippet || ''}`);
  const thirdPartyPenalty = BLOCKED_HOST_HINTS.some(host => hostname.includes(host)) ? -45 : 0;
  const modelBoost = enrichment.model && `${title} ${url}`.toLowerCase().includes(enrichment.model.toLowerCase()) ? 18 : 0;
  const officialBoost = officialLikely ? 35 : 0;
  const pdfBoost = isPdfUrl(url) ? 15 : 0;
  const manualBoost = manualLike ? 18 : -25;
  const pressPenalty = pressLike ? -45 : 0;
  const score = 40 + officialBoost + modelBoost + pdfBoost + manualBoost + thirdPartyPenalty + pressPenalty;

  return {
    id: makeManualId(),
    title: cleanTitle(title) || pathTail(url) || '取扱説明書候補',
    url,
    type,
    sourceHost: hostname,
    sourceType: officialLikely ? 'official-likely' : 'unverified',
    discoveryMethod,
    snippet: snippet || '',
    score,
    selected: manualLike && !pressLike && (officialLikely || score >= 70),
    status: 'candidate',
    checkedAt: new Date().toISOString()
  };
}

function classifyManual(title, url) {
  const text = `${title} ${url}`.toLowerCase();
  if (/設置|施工|installation|install/.test(text)) return '設置説明書';
  if (/quick|かんたん|簡単|start|スタート|guide/.test(text)) return 'クイックガイド';
  if (/保証|warranty/.test(text)) return '保証関連';
  if (/software|driver|ソフト|ドライバ/.test(text)) return 'ソフトウェアマニュアル';
  if (/parts|部品|分解/.test(text)) return '部品表';
  if (/取扱|説明書|manual|instruction/.test(text)) return '取扱説明書';
  return '資料PDF';
}

function isManualLike(title, url) {
  return /取扱|説明書|マニュアル|manual|instruction|設置|施工|クイック|かんたん|guide|保証|warranty|部品|parts|software|driver|ドライバ/i
    .test(`${title} ${url}`);
}

function shouldInspectPage(url, candidate) {
  const host = safeHostname(url);
  if (!host || BLOCKED_HOST_HINTS.some(blocked => host.includes(blocked))) return false;
  const text = `${url} ${candidate.enrichment?.maker || ''}`.toLowerCase();
  return /support|manual|download|取扱|説明|サポート|dl|pdf/.test(text) || isOfficialLike(host, candidate.enrichment?.maker);
}

function isOfficialLike(hostname, maker) {
  const makerText = String(maker || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hostText = String(hostname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!makerText || makerText.length < 3) {
    return /(support|www)\./.test(hostname) && !BLOCKED_HOST_HINTS.some(host => hostname.includes(host));
  }
  return hostText.includes(makerText) && !BLOCKED_HOST_HINTS.some(host => hostname.includes(host));
}

function unwrapDuckDuckGoUrl(href) {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const wrapped = url.searchParams.get('uddg');
    return wrapped ? decodeURIComponent(wrapped) : url.toString();
  } catch {
    return '';
  }
}

function isPdfUrl(url) {
  return /\.pdf(?:$|[?#])/i.test(String(url || ''));
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function pathTail(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    return '';
  }
}

function userAgent() {
  return 'Mozilla/5.0';
}

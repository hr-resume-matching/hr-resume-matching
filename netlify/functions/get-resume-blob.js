// v4.5.10 新增：管理者專用——下載企業履歷封存庫中「單一一份」檔案的實際內容（還原成原本的
// PDF/HTML檔案，觸發瀏覽器下載）。搭配 get-resume-archive.js 的清單頁使用：清單頁列出所有
// 檔案的中繼資料，這支函式才負責把使用者點的「那一筆」的完整檔案內容吐回來。
const { getStore, connectLambda } = require('@netlify/blobs');
// v4.5.24 fix: MissingBlobsEnvironmentError — Netlify only auto-injects the Blobs siteID/token
// into functions written in the newer ESM "Functions v2" style. This file uses the classic
// `exports.handler = async (event, context) => {...}` signature (Netlify's own docs call this
// "Lambda compatibility mode"), where that auto-injection does NOT happen automatically — the
// environment has to be wired up manually by calling connectLambda(event) first, immediately
// before any getStore() call. Confirmed against Netlify's own @netlify/blobs README, not a guess.
const { isAdmin, ADMIN_REQUIRED_MESSAGE } = require('./_admin-auth');

exports.handler = async (event, context) => {
  connectLambda(event); // must run before any getStore() call below
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '請先登入才能查看' })
    };
  }
  if (!isAdmin(user.email)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: ADMIN_REQUIRED_MESSAGE })
    };
  }
  const key = (event.queryStringParameters || {}).key;
  if (!key) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '缺少 key 參數' })
    };
  }
  try {
    const store = getStore('resume-archive');
    const rec = await store.get(key, { type: 'json' });
    if (!rec) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: '找不到此檔案，可能已被清除' })
      };
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': rec.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(rec.fileName || 'resume')}"`
      },
      body: rec.base64Data,
      isBase64Encoded: true
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

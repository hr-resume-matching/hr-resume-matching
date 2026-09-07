// v4.5.26 新增：管理者專用——從企業履歷封存庫中「刪除」單一一份檔案（連同中繼資料一起，整筆從
// Netlify Blobs 移除，非軟刪除，刪除後無法復原）。搭配 get-resume-archive.js 的清單頁使用：
// 管理者在後台「履歷封存」分頁按下「刪除」，前端呼叫這支函式，帶上該筆記錄的 key。
//
// 權限套用與 get-resume-archive.js / get-resume-blob.js 完全一致（同一份 isAdmin 檢查、同一份
// ADMIN_EMAILS 名單）——刪除是比讀取／下載更高風險的動作，因此沿用同一套「登入 + 在管理者名單」
// 的雙重檢查，不額外放寬，也不額外收緊（避免出現「看得到卻刪不掉」或「刪得掉卻看不到」的不一致）。
const { getStore, connectLambda } = require('@netlify/blobs');
// v4.5.24 fix (沿用): MissingBlobsEnvironmentError — Netlify only auto-injects the Blobs
// siteID/token into functions written in the newer ESM "Functions v2" style. This file uses the
// classic `exports.handler = async (event, context) => {...}` signature ("Lambda compatibility
// mode"), where that auto-injection does NOT happen automatically — the environment has to be
// wired up manually by calling connectLambda(event) first, immediately before any getStore() call.
const { isAdmin, ADMIN_REQUIRED_MESSAGE } = require('./_admin-auth');

exports.handler = async (event, context) => {
  connectLambda(event); // must run before any getStore() call below
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '請先登入才能操作' })
    };
  }
  if (!isAdmin(user.email)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: ADMIN_REQUIRED_MESSAGE })
    };
  }
  // key 可能來自 query string（?key=...，配合 DELETE）或 JSON body（配合 POST），兩種都接受，
  // 前端目前用 DELETE + query string，body 只是備援，避免日後改法時要動到這支函式。
  const queryKey = (event.queryStringParameters || {}).key;
  let bodyKey;
  if (event.body) {
    try { bodyKey = JSON.parse(event.body).key; } catch (e) { /* 忽略無法解析的 body，改用 query key */ }
  }
  const key = queryKey || bodyKey;
  if (!key) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '缺少 key 參數' })
    };
  }
  try {
    const store = getStore('resume-archive');
    const existing = await store.get(key, { type: 'json' });
    if (!existing) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: '找不到此檔案，可能已被刪除過了' })
      };
    }
    await store.delete(key);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

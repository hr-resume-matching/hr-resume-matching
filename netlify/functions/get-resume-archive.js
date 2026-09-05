// v4.5.10 新增：管理者專用——列出企業履歷封存庫中所有檔案的「清單」（不含檔案本身內容，只有
// 檔名、上傳者、時間、大小等中繼資料），下載實際檔案內容請改用 get-resume-blob.js。
// 分成兩支函式是刻意的：清單頁需要快速載入很多筆，若每筆都夾帶完整 base64 檔案內容，資料量會
// 暴增、拖慢管理者後台，因此清單只回傳中繼資料，真正下載時才單獨抓那一筆的完整內容。
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
  try {
    const store = getStore('resume-archive');
    const { blobs } = await store.list();
    const records = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec) {
        records.push({
          key: b.key,
          fileName: rec.fileName,
          candidateLabel: rec.candidateLabel,
          uploaderEmail: rec.uploaderEmail,
          uploaderName: rec.uploaderName,
          ts: rec.ts,
          sizeBytes: rec.sizeBytes,
          mimeType: rec.mimeType
        });
      }
    }
    records.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, records })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

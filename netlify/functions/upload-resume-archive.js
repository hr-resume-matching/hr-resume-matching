// v4.5.10 新增：企業履歷封存（選填功能，預設關閉）。
// 只有當 HR 在主系統「企業進階功能」勾選啟用封存時，前端才會呼叫這支函式，把上傳的履歷原始檔案
// （PDF 或 HTML，轉成 base64）連同「誰上傳的、什麼時候」一起保存下來，供管理者事後查閱／下載。
//
// 重要：這份履歷原始檔案含有應徵者的完整個人資料，一旦啟用即會集中保存在企業後台，請企業自行
// 依當地個資法規（例如台灣個資法）規劃保存期限、告知應徵者、以及誰有權限存取，本功能只負責
// 技術上的保存與稽核，不能取代企業自己的個資治理政策。
const { getStore, connectLambda } = require('@netlify/blobs');
// v4.5.24 fix: MissingBlobsEnvironmentError — Netlify only auto-injects the Blobs siteID/token
// into functions written in the newer ESM "Functions v2" style. This file uses the classic
// `exports.handler = async (event, context) => {...}` signature (Netlify's own docs call this
// "Lambda compatibility mode"), where that auto-injection does NOT happen automatically — the
// environment has to be wired up manually by calling connectLambda(event) first, immediately
// before any getStore() call. Confirmed against Netlify's own @netlify/blobs README, not a guess.

const MAX_BYTES = 8 * 1024 * 1024; // 8MB 上限：一般履歷PDF遠小於此，避免有人上傳超大檔案塞爆儲存空間

exports.handler = async (event, context) => {
  connectLambda(event); // must run before any getStore() call below
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  // 封存動作一定要求登入——匿名訪客不應該能把檔案寫進企業後台。
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '請先登入才能使用企業封存功能' })
    };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, mimeType, base64Data, candidateLabel } = body;
    if (!base64Data || !fileName) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: '缺少檔案內容或檔名' })
      };
    }
    const approxBytes = Math.ceil(base64Data.length * 3 / 4);
    if (approxBytes > MAX_BYTES) {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: `檔案過大（約 ${(approxBytes / 1024 / 1024).toFixed(1)}MB），企業封存單檔上限為 8MB` })
      };
    }
    const store = getStore('resume-archive');
    const key = 'resume-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await store.setJSON(key, {
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      base64Data,
      candidateLabel: candidateLabel || fileName,
      uploaderEmail: user.email,
      uploaderName: (user.user_metadata && user.user_metadata.full_name) || '',
      ts: new Date().toISOString(),
      sizeBytes: approxBytes
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, key })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

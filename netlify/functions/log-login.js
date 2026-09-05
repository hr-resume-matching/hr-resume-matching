// 這個檔案會在你按下Google登入成功後，自動被呼叫一次，把「誰、什麼時候、從哪個IP、用什麼瀏覽器
// 登入」記下來。不需要修改這個檔案裡的任何內容，原封不動放到指定資料夾即可。
//
// v4.5.10：新增 IP 位址與瀏覽器（User-Agent）紀錄。這兩項刻意從「伺服器收到的請求本身」讀取，
// 不是由瀏覽器端 JavaScript 回報——因為瀏覽器端的值使用者自己就能竄改，從請求本身讀到的
// 才是後台真正收到這次連線的來源，才有稽核意義。
const { getStore, connectLambda } = require('@netlify/blobs');
// v4.5.24 fix: MissingBlobsEnvironmentError — Netlify only auto-injects the Blobs siteID/token
// into functions written in the newer ESM "Functions v2" style. This file uses the classic
// `exports.handler = async (event, context) => {...}` signature (Netlify's own docs call this
// "Lambda compatibility mode"), where that auto-injection does NOT happen automatically — the
// environment has to be wired up manually by calling connectLambda(event) first, immediately
// before any getStore() call. Confirmed against Netlify's own @netlify/blobs README, not a guess.

exports.handler = async (event) => {
  connectLambda(event); // must run before any getStore() call below
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const email = body.email || '未知使用者';
    const name = body.name || '';
    const headers = event.headers || {};
    // x-nf-client-connection-ip 是 Netlify 平台自己加上的真實來源IP，優先使用；
    // x-forwarded-for 是其他代理伺服器/CDN常見的寫法，作為備援（可能包含多個IP，取第一個）。
    const ip = headers['x-nf-client-connection-ip']
      || (headers['x-forwarded-for'] || '').split(',')[0].trim()
      || '未知';
    const userAgent = headers['user-agent'] || '未知';
    const store = getStore('login-logs');
    const key = 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await store.setJSON(key, { email, name, ip, userAgent, ts: new Date().toISOString() });
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

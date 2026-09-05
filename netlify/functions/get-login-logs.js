// 這個檔案負責把記錄過的登入紀錄「讀出來」給後台頁面顯示。
// 不需要修改這個檔案裡的任何內容，原封不動放到指定資料夾即可。
//
// v4.5.10：加上「只有管理者名單裡的人才能看」的檢查（isAdmin，定義在 _admin-auth.js）。
// 舊版只檢查「有沒有登入」，代表任何一個用Google帳號登入過的同事都能看到全公司所有人的登入
// 紀錄——這對企業內部工具來說權限範圍太大，現在改成只有 ADMIN_EMAILS 名單內的人才能查看。
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
      body: JSON.stringify({ ok: false, error: '請先登入才能查看紀錄' })
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
    const store = getStore('login-logs');
    const { blobs } = await store.list();
    const records = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec) records.push(rec);
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

// v4.5.11 新增：每次呼叫AI後，前端會把這次用了多少token回報到這裡，讓管理者能在後台看到
// 「全公司」的AI使用量，而不是只有自己瀏覽器裡的數字（重新整理頁面就消失）。
// 不需要登入也能使用主系統分析功能——這支函式只有在使用者已用Google帳號登入時才會被呼叫，
// 沒有登入的使用者的token用量不會被記錄（因為沒有帳號可歸屬）。
const { getStore, connectLambda } = require('@netlify/blobs');
// v4.5.24 fix: MissingBlobsEnvironmentError — Netlify only auto-injects the Blobs siteID/token
// into functions written in the newer ESM "Functions v2" style. This file uses the classic
// `exports.handler = async (event, context) => {...}` signature (Netlify's own docs call this
// "Lambda compatibility mode"), where that auto-injection does NOT happen automatically — the
// environment has to be wired up manually by calling connectLambda(event) first, immediately
// before any getStore() call. Confirmed against Netlify's own @netlify/blobs README, not a guess.

exports.handler = async (event, context) => {
  connectLambda(event); // must run before any getStore() call below
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '請先登入' })
    };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const provider = body.provider || '未知';
    const inputTokens = Number(body.inputTokens) || 0;
    const outputTokens = Number(body.outputTokens) || 0;
    const store = getStore('ai-usage-logs');
    const key = 'usage-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    await store.setJSON(key, {
      email: user.email,
      name: (user.user_metadata && user.user_metadata.full_name) || '',
      provider,
      inputTokens,
      outputTokens,
      ts: new Date().toISOString()
    });
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

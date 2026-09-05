// v4.5.11 新增：管理者專用——把所有人回報的AI token用量彙總，依「使用者」與「AI服務商」分組，
// 方便回答「這個月哪個部門/哪個人用最多」。故意不換算成金額——不同服務商、不同模型的每百萬token
// 價格常常調整，寫死一個價格在程式碼裡很快就會過時、誤導判斷；管理者若要換算成費用，可以自行
// 依照目前公告的價格乘算，或在後台頁面自行輸入單價再計算（見 admin-login-log.html 的說明文字）。
const { getStore } = require('@netlify/blobs');
const { isAdmin, ADMIN_REQUIRED_MESSAGE } = require('./_admin-auth');

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: '請先登入' })
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
    const store = getStore('ai-usage-logs');
    const { blobs } = await store.list();
    const records = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec) records.push(rec);
    }
    // 依使用者彙總
    const byUser = {};
    // 依服務商彙總
    const byProvider = {};
    let totalInputTokens = 0, totalOutputTokens = 0, totalCalls = 0;
    records.forEach(r => {
      totalInputTokens += r.inputTokens || 0;
      totalOutputTokens += r.outputTokens || 0;
      totalCalls += 1;
      const uKey = r.email || '未知';
      if (!byUser[uKey]) byUser[uKey] = { email: uKey, name: r.name || '', inputTokens: 0, outputTokens: 0, calls: 0 };
      byUser[uKey].inputTokens += r.inputTokens || 0;
      byUser[uKey].outputTokens += r.outputTokens || 0;
      byUser[uKey].calls += 1;
      const pKey = r.provider || '未知';
      if (!byProvider[pKey]) byProvider[pKey] = { provider: pKey, inputTokens: 0, outputTokens: 0, calls: 0 };
      byProvider[pKey].inputTokens += r.inputTokens || 0;
      byProvider[pKey].outputTokens += r.outputTokens || 0;
      byProvider[pKey].calls += 1;
    });
    const byUserList = Object.values(byUser).sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));
    const byProviderList = Object.values(byProvider).sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        totals: { totalInputTokens, totalOutputTokens, totalCalls },
        byUser: byUserList,
        byProvider: byProviderList
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

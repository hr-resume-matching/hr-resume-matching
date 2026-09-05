// 從104職缺網址／代碼，嘗試代HR向104抓取職缺標題與說明文字，回填到「輸入職缺」表單，
// 省去人資手動重貼一次的功夫。
//
// 重要誠實聲明（部署前務必讓使用者知道）：104沒有公開官方API，這裡呼叫的是104網頁本身
// 在瀏覽器打開職缺頁時，背景會呼叫的內部資料端點（/job/ajax/content/{id}）。104對這類非
// 瀏覽器的請求可能會有防爬蟲保護（Cloudflare等），不保證每次都能成功；本函式會清楚回傳
// 是否成功，前端在失敗時會提示HR改用「複製貼上」，而不是卡住或顯示看不懂的錯誤。
// 這個函式只讀取104公開職缺頁面本身會顯示的資訊，不會登入、不會繞過任何付費或會員限制。

function extractJobId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  // 直接就是代碼（英數字，104職缺代碼常見長度5~10）
  if (/^[a-zA-Z0-9]{4,12}$/.test(trimmed)) return trimmed;
  // 完整網址，例如 https://www.104.com.tw/job/7pq1a 或帶查詢字串 /job/7pq1a?jobsource=...
  const m = trimmed.match(/104\.com\.tw\/job\/([a-zA-Z0-9]{4,12})/);
  return m ? m[1] : null;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  const raw = (event.queryStringParameters && event.queryStringParameters.id) || '';
  const jobId = extractJobId(raw);
  if (!jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'invalid_input', message: '無法辨識104職缺網址或代碼，請確認貼上的是完整職缺連結（例如 https://www.104.com.tw/job/7pq1a）。' }) };
  }

  try {
    const upstream = await fetch(`https://www.104.com.tw/job/ajax/content/${jobId}`, {
      headers: {
        'Referer': `https://www.104.com.tw/job/${jobId}`,
        'Accept-Language': 'zh-TW',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !contentType.includes('json')) {
      // 最常見狀況：104的防爬蟲機制擋下非瀏覽器請求（例如回傳403或一段驗證用的HTML）。
      return {
        statusCode: 502, headers,
        body: JSON.stringify({
          ok: false, error: 'blocked_or_unavailable',
          message: '104暫時無法自動擷取此職缺（可能是防爬蟲保護、職缺已下架，或編號有誤），請改用「複製貼上」：直接到104職缺頁面全選複製，貼到下方職缺說明欄，系統會自動幫你抓出標題。'
        })
      };
    }

    const data = await upstream.json();
    const header = data.header || {};
    const jobDetail = data.jobDetail || {};
    const condition = data.condition || {};

    const title = header.jobName || '';
    if (!title) {
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'empty_result', message: '取得回應但找不到職缺標題，可能此職缺已下架或連結有誤，請改用複製貼上。' }) };
    }

    const lines = [];
    if (jobDetail.jobDescription) lines.push(jobDetail.jobDescription.replace(/\r\n/g, '\n'));
    if (condition.workExp) lines.push(`\n所需年資：${condition.workExp}`);
    if (condition.edu) lines.push(`要求學歷：${condition.edu}`);
    if (condition.major && condition.major.length) lines.push(`科系要求：${(Array.isArray(condition.major)?condition.major:[condition.major]).join('、')}`);
    if (condition.specialty) lines.push(`擅長工具／技能：${condition.specialty}`);
    if (jobDetail.salaryDesc || (jobDetail.salaryLow!=null)) {
      lines.push(`待遇：${jobDetail.salaryDesc || `${jobDetail.salaryLow||''}~${jobDetail.salaryHigh||''}`}`);
    }
    if (header.custName) lines.push(`\n（企業名稱：${header.custName}，僅供HR比對用，不會出現在AI配對分析中）`);

    let salaryMax = null;
    if (typeof jobDetail.salaryHigh === 'number' && jobDetail.salaryHigh > 0 && jobDetail.salaryType === 50) {
      salaryMax = jobDetail.salaryHigh; // 50 = 月薪，其餘（時薪/年薪等）不代入月薪上限欄位避免誤導
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        title,
        text: lines.join('\n').trim(),
        salaryMax,
        sourceUrl: `https://www.104.com.tw/job/${jobId}`
      })
    };
  } catch (e) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ ok: false, error: 'fetch_failed', message: '擷取過程發生錯誤，請改用複製貼上，或稍後再試一次。' })
    };
  }
};

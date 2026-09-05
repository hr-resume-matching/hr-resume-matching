// 共用的「這個人是不是管理者」檢查，被 get-login-logs.js、get-resume-archive.js、get-resume-blob.js
// 一起使用，確保三個後台功能套用同一套管理者名單，不會各自為政、其中一個忘記檢查。
//
// 管理者名單「不寫死在程式碼裡」，而是透過 Netlify 網站後台的環境變數 ADMIN_EMAILS 設定
// （Site settings → Environment variables），用逗號分隔多個 email，例如：
//   boss@company.com,hr-manager@company.com
// 這樣企業可以自行增減管理者，不需要請人改程式碼、重新部署。
//
// 安全預設：故意「預設拒絕」而不是「預設允許」——如果還沒設定 ADMIN_EMAILS，任何人都不能看
// 登入紀錄或履歷封存，而不是反過來讓所有登入過的人都能看到全公司的資料。原因：這兩份資料含有
// 其他同事的個資與應徵者的履歷全文，寧可管理者一開始要多做一個設定步驟才能看到，也不要在忘記
// 設定的狀態下，變成「每個登入過的人都能看到所有人的履歷」這種資安/個資外洩事故。
function isAdmin(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes((email || '').toLowerCase());
}

const ADMIN_REQUIRED_MESSAGE = '此頁面僅限管理者查看。若您是系統管理者但看到此訊息，請確認已在 Netlify 後台的 Environment variables 設定 ADMIN_EMAILS（見「設定教學」文件），並填入您自己的登入 email。';

module.exports = { isAdmin, ADMIN_REQUIRED_MESSAGE };

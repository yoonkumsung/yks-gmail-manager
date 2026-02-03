/**
 * 텔레그램 알림 전송
 *
 * 환경변수:
 * - TELEGRAM_BOT_TOKEN: 봇 토큰 (BotFather에서 발급)
 * - TELEGRAM_CHAT_ID: 알림 받을 채팅 ID
 */

const https = require('https');

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('텔레그램 설정 없음, 알림 건너뜀');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const data = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('텔레그램 알림 전송 완료');
          resolve(JSON.parse(body));
        } else {
          console.error('텔레그램 오류:', body);
          reject(new Error(body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// CLI 실행
if (require.main === module) {
  const args = process.argv.slice(2);

  // 인자 파싱
  let status = 'success';
  let itemCount = 0;
  let pagesUrl = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--status') status = args[++i];
    if (args[i] === '--items') itemCount = parseInt(args[++i]) || 0;
    if (args[i] === '--url') pagesUrl = args[++i];
  }

  // 날짜 (KST)
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().split('T')[0];

  let message;
  if (status === 'success') {
    message = `<b>📬 메일 다이제스트 완료</b>

📅 ${dateStr}
📊 총 ${itemCount}개 아이템 정리됨

${pagesUrl ? `🔗 <a href="${pagesUrl}">결과 보기</a>` : ''}`;
  } else {
    message = `<b>⚠️ 메일 다이제스트 실패</b>

📅 ${dateStr}
GitHub Actions 로그를 확인하세요.`;
  }

  sendTelegram(message).catch(err => {
    console.error('알림 전송 실패:', err.message);
    process.exit(1);
  });
}

module.exports = { sendTelegram };

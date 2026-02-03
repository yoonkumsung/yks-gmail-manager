/**
 * Gmail OAuth 2.0 인증 스크립트
 *
 * 사용법: node scripts/auth.js
 *
 * 이 스크립트는 OAuth 인증 흐름을 실행하고 refresh_token을 획득합니다.
 * 획득한 토큰은 config/credentials/token.json에 저장됩니다.
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 경로 설정
const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'credentials', 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'credentials', 'token.json');

// OAuth 설정
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels'
];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// 자격 증명 로드
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('오류: client_secret.json 파일을 찾을 수 없습니다.');
    console.error('경로:', CREDENTIALS_PATH);
    process.exit(1);
  }

  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content).installed;
}

// 인증 URL 생성
function getAuthUrl(credentials) {
  const params = new URLSearchParams({
    client_id: credentials.client_id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });

  return `${credentials.auth_uri}?${params.toString()}`;
}

// 브라우저 열기 (Windows)
function openBrowser(url) {
  exec(`start "" "${url}"`, (error) => {
    if (error) {
      console.log('\n브라우저를 자동으로 열 수 없습니다.');
      console.log('아래 URL을 직접 브라우저에 붙여넣어 주세요:\n');
      console.log(url);
    }
  });
}

// 토큰 교환
async function exchangeCodeForToken(code, credentials) {
  const params = new URLSearchParams({
    code: code,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  });

  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`토큰 교환 실패: ${error}`);
  }

  return response.json();
}

// 토큰 저장
function saveToken(token) {
  // credentials 디렉토리 확인
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 만료 시간 계산
  token.expiry_date = Date.now() + (token.expires_in * 1000);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log('\n토큰이 저장되었습니다:', TOKEN_PATH);
}

// 메인 함수
async function main() {
  console.log('Gmail OAuth 2.0 인증을 시작합니다...\n');

  const credentials = loadCredentials();
  const authUrl = getAuthUrl(credentials);

  // 콜백 서버 시작
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/callback') {
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>인증 실패</h1><p>오류: ${error}</p>`);
        console.error('\n인증 실패:', error);
        server.close();
        process.exit(1);
      }

      if (code) {
        try {
          console.log('인증 코드를 받았습니다. 토큰을 교환합니다...');
          const token = await exchangeCodeForToken(code, credentials);
          saveToken(token);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <head><title>인증 완료</title></head>
              <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h1>인증 완료!</h1>
                <p>이 창을 닫아도 됩니다.</p>
              </body>
            </html>
          `);

          console.log('\n인증이 완료되었습니다!');
          console.log('이제 Gmail API를 사용할 수 있습니다.');

          server.close();
          process.exit(0);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>토큰 교환 실패</h1><p>${err.message}</p>`);
          console.error('\n토큰 교환 실패:', err.message);
          server.close();
          process.exit(1);
        }
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(REDIRECT_PORT, () => {
    console.log(`콜백 서버가 포트 ${REDIRECT_PORT}에서 대기 중입니다...`);
    console.log('\n브라우저에서 Google 계정으로 로그인하세요.');
    openBrowser(authUrl);
  });
}

main().catch(console.error);

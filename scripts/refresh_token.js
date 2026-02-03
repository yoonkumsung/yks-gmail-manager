/**
 * Gmail OAuth 토큰 갱신 스크립트
 *
 * 사용법: node scripts/refresh_token.js
 *
 * 이 스크립트는 만료된 access_token을 갱신합니다.
 * PowerShell에서 직접 호출하거나 Claude Code에서 사용할 수 있습니다.
 */

const fs = require('fs');
const path = require('path');

// 경로 설정
const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'credentials', 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'credentials', 'token.json');

// 자격 증명 로드
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('client_secret.json 파일을 찾을 수 없습니다.');
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).installed;
}

// 토큰 로드
function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('token.json 파일을 찾을 수 없습니다. 먼저 auth.js를 실행하세요.');
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

// 토큰 저장
function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

// 토큰 갱신
async function refreshAccessToken() {
  const credentials = loadCredentials();
  const token = loadToken();

  // 토큰이 아직 유효한지 확인 (5분 여유)
  const now = Date.now();
  const expiryBuffer = 5 * 60 * 1000; // 5분

  if (token.expiry_date && (token.expiry_date - expiryBuffer) > now) {
    // 토큰이 아직 유효함
    return {
      access_token: token.access_token,
      refreshed: false
    };
  }

  // 토큰 갱신 필요
  if (!token.refresh_token) {
    throw new Error('refresh_token이 없습니다. auth.js를 다시 실행하세요.');
  }

  const params = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
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
    throw new Error(`토큰 갱신 실패: ${error}`);
  }

  const newToken = await response.json();

  // 기존 refresh_token 유지 (갱신 응답에 없을 수 있음)
  const updatedToken = {
    ...token,
    access_token: newToken.access_token,
    expiry_date: Date.now() + (newToken.expires_in * 1000)
  };

  if (newToken.refresh_token) {
    updatedToken.refresh_token = newToken.refresh_token;
  }

  saveToken(updatedToken);

  return {
    access_token: newToken.access_token,
    refreshed: true
  };
}

// 현재 유효한 access_token 가져오기
async function getAccessToken() {
  const result = await refreshAccessToken();
  return result.access_token;
}

// CLI 실행
async function main() {
  try {
    const result = await refreshAccessToken();

    if (result.refreshed) {
      console.log('토큰이 갱신되었습니다.');
    } else {
      console.log('토큰이 아직 유효합니다.');
    }

    // access_token 출력 (PowerShell에서 캡처 가능)
    console.log('\nAccess Token:');
    console.log(result.access_token);

  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

// 모듈 내보내기
module.exports = { getAccessToken, refreshAccessToken };

// 직접 실행시
if (require.main === module) {
  main();
}

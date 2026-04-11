/**
 * Google Drive 업로드 스크립트
 *
 * 환경변수:
 *   GDRIVE_SERVICE_ACCOUNT_KEY - Service Account JSON 키 (전체 내용)
 *   GDRIVE_FOLDER_ID - 부모 폴더 ID (예: Newsletter 폴더)
 *
 * 사용법:
 *   node scripts/upload_to_drive.js <local_md_path> [target_filename]
 *
 * 동작:
 *   1. GDRIVE_FOLDER_ID 아래에 연도 하위 폴더 (예: 2026) 자동 생성/탐색
 *   2. MD 파일 업로드 (동일 이름 존재 시 update, 없으면 create)
 *   3. 업로드 결과 출력 (file ID, 웹 URL)
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ============================================
// 인증 (Service Account)
// ============================================

function getDriveClient() {
  const keyJson = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error('GDRIVE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.');
  }

  let credentials;
  try {
    credentials = JSON.parse(keyJson);
  } catch (e) {
    throw new Error(`GDRIVE_SERVICE_ACCOUNT_KEY 파싱 실패: ${e.message}`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  return google.drive({ version: 'v3', auth });
}

// ============================================
// 연도 하위 폴더 찾기/생성
// ============================================

async function getOrCreateYearFolder(drive, parentId, year) {
  // 동일 이름의 폴더 검색
  const escaped = String(year).replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 10
  });

  if (res.data.files && res.data.files.length > 0) {
    console.log(`[Drive] 기존 ${year} 폴더 사용 (id: ${res.data.files[0].id})`);
    return res.data.files[0].id;
  }

  // 없으면 생성
  const folder = await drive.files.create({
    requestBody: {
      name: String(year),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });

  console.log(`[Drive] ${year} 폴더 새로 생성 (id: ${folder.data.id})`);
  return folder.data.id;
}

// ============================================
// MD 파일 업로드 (existing → update, else → create)
// ============================================

async function uploadMarkdownFile(drive, localPath, folderId, targetName) {
  if (!fs.existsSync(localPath)) {
    throw new Error(`로컬 파일 없음: ${localPath}`);
  }

  const fileName = targetName || path.basename(localPath);
  const escapedName = fileName.replace(/'/g, "\\'");

  // 동일 이름 파일 검색
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name='${escapedName}' and trashed=false`,
    fields: 'files(id, name, webViewLink)',
    pageSize: 10
  });

  const media = {
    mimeType: 'text/markdown',
    body: fs.createReadStream(localPath)
  };

  if (existing.data.files && existing.data.files.length > 0) {
    // 업데이트
    const fileId = existing.data.files[0].id;
    const updated = await drive.files.update({
      fileId,
      media,
      fields: 'id, name, webViewLink, modifiedTime'
    });
    console.log(`[Drive] 업데이트 완료: ${fileName} (id: ${fileId})`);
    return { id: fileId, webViewLink: updated.data.webViewLink, action: 'updated' };
  } else {
    // 생성
    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media,
      fields: 'id, name, webViewLink'
    });
    console.log(`[Drive] 새 파일 생성: ${fileName} (id: ${created.data.id})`);
    return { id: created.data.id, webViewLink: created.data.webViewLink, action: 'created' };
  }
}

// ============================================
// 메인: 파일을 GDRIVE_FOLDER_ID/{연도}/에 업로드
// ============================================

async function uploadToYearFolder(localPath, targetName, year) {
  const parentId = process.env.GDRIVE_FOLDER_ID;
  if (!parentId) {
    throw new Error('GDRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.');
  }

  const drive = getDriveClient();

  // 연도 폴더 찾기/생성
  const yearFolderId = await getOrCreateYearFolder(drive, parentId, year);

  // 업로드
  const result = await uploadMarkdownFile(drive, localPath, yearFolderId, targetName);
  return result;
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('사용법: node scripts/upload_to_drive.js <local_md_path> [target_filename] [year]');
    process.exit(1);
  }

  const localPath = args[0];
  const targetName = args[1] || path.basename(localPath);

  // 연도 결정: 인자로 받거나, 파일명에서 추출(YYMMDD 또는 YYYY-MM-DD), 또는 현재 연도
  let year = args[2];
  if (!year) {
    const fname = path.basename(localPath);
    // YYYY-MM-DD 형식
    let m = fname.match(/(\d{4})-\d{2}-\d{2}/);
    if (m) {
      year = m[1];
    } else {
      // YYMMDD 형식
      m = fname.match(/^(\d{2})(\d{2})(\d{2})/);
      if (m) {
        year = '20' + m[1];
      } else {
        year = String(new Date().getFullYear());
      }
    }
  }

  try {
    const result = await uploadToYearFolder(localPath, targetName, year);
    console.log('\n=== 업로드 완료 ===');
    console.log(`파일: ${targetName}`);
    console.log(`연도 폴더: ${year}`);
    console.log(`동작: ${result.action}`);
    console.log(`File ID: ${result.id}`);
    if (result.webViewLink) {
      console.log(`Web URL: ${result.webViewLink}`);
    }
  } catch (error) {
    console.error('업로드 실패:', error.message);
    if (error.errors) {
      console.error('상세:', JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

module.exports = {
  getDriveClient,
  getOrCreateYearFolder,
  uploadMarkdownFile,
  uploadToYearFolder
};

if (require.main === module) {
  main();
}

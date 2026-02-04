/**
 * 스킬 파일 이름 마이그레이션 스크립트
 * 기존: 이메일 로컬파트 기준 (noreply, newsletter 등)
 * 신규: 도메인 우선, 중복 시 도메인_사용자 조합
 */

const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '..', 'config');
const skillsDir = path.join(__dirname, '..', 'skills', 'newsletters');
const catalogPath = path.join(configDir, 'newsletters.json');

// 일반적인 사용자명 목록 (의미 없는 이름들)
const genericNames = new Set([
  'noreply', 'no_reply', 'no-reply', 'newsletter', 'newsletters',
  'hello', 'info', 'news', 'support', 'team', 'mail', 'contact',
  'admin', 'help', 'notification', 'notifications', 'updates',
  'digest', 'alert', 'alerts', 'reply', 'mailer', 'sender',
  'marketing', 'sales', 'service', 'customer', 'feedback'
]);

/**
 * 새 ID 생성 규칙
 */
function generateNewId(email, existingIds) {
  const emailClean = email.toLowerCase().trim();
  const parts = emailClean.split('@');
  if (parts.length !== 2) {
    return emailClean.replace(/[^a-z0-9]/g, '_').substring(0, 40);
  }

  const localPart = parts[0];
  const domain = parts[1];

  // 도메인에서 ID 추출 (서브도메인 제외)
  const domainParts = domain.split('.');
  let mainDomain;
  if (domainParts.length >= 2) {
    const genericSubdomains = new Set(['mail', 'e', 'www', 'news', 'email', 'newsletter', 'send', 'bounce']);
    if (domainParts.length > 2 && genericSubdomains.has(domainParts[0])) {
      mainDomain = domainParts[1];
    } else {
      mainDomain = domainParts[0];
    }
  } else {
    mainDomain = domainParts[0];
  }
  const domainId = mainDomain.replace(/[^a-z0-9]/g, '_');

  // 사용자명 정리
  const localId = localPart.replace(/[^a-z0-9]/g, '_');
  const isGenericLocal = genericNames.has(localId) || genericNames.has(localPart.replace(/-/g, '_'));

  // ID 결정
  let id;
  if (!existingIds.has(domainId)) {
    id = domainId;
  } else if (isGenericLocal) {
    // 도메인 중복 + 일반명이면 도메인_숫자
    let counter = 2;
    while (existingIds.has(`${domainId}_${counter}`)) {
      counter++;
    }
    id = `${domainId}_${counter}`;
  } else {
    // 도메인 중복 + 고유 사용자명이면 도메인_사용자
    const candidateId = `${domainId}_${localId}`;
    if (existingIds.has(candidateId)) {
      let counter = 2;
      while (existingIds.has(`${candidateId}_${counter}`)) {
        counter++;
      }
      id = `${candidateId}_${counter}`;
    } else {
      id = candidateId;
    }
  }

  return id.substring(0, 40);
}

/**
 * 마이그레이션 실행
 */
function migrate() {
  console.log('=== 스킬 파일 마이그레이션 시작 ===\n');

  // 1. 카탈로그 로드
  if (!fs.existsSync(catalogPath)) {
    console.log('newsletters.json이 없습니다.');
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const newsletters = catalog.newsletters;

  console.log(`총 ${newsletters.length}개 뉴스레터 발견\n`);

  // 2. 새 ID 생성 (순서대로 처리하여 중복 방지)
  const existingIds = new Set();
  const migrations = [];

  for (const newsletter of newsletters) {
    const oldId = newsletter.id;
    const newId = generateNewId(newsletter.sender, existingIds);
    existingIds.add(newId);

    const oldSkillFile = `skills/newsletters/SKILL_${oldId}.md`;
    const newSkillFile = `skills/newsletters/SKILL_${newId}.md`;

    migrations.push({
      email: newsletter.sender,
      name: newsletter.name,
      oldId,
      newId,
      oldSkillFile,
      newSkillFile,
      changed: oldId !== newId
    });
  }

  // 3. 변경 사항 출력
  console.log('=== 변경 예정 ===\n');

  const changes = migrations.filter(m => m.changed);
  const unchanged = migrations.filter(m => !m.changed);

  console.log(`변경: ${changes.length}개`);
  console.log(`유지: ${unchanged.length}개\n`);

  for (const m of changes) {
    console.log(`[변경] ${m.email}`);
    console.log(`       ${m.oldId} → ${m.newId}`);
    console.log('');
  }

  // 4. 실제 마이그레이션 수행
  console.log('\n=== 마이그레이션 실행 ===\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newsletters.length; i++) {
    const newsletter = newsletters[i];
    const migration = migrations[i];

    if (!migration.changed) {
      continue;
    }

    try {
      // 4.1 스킬 파일 이름 변경
      const oldPath = path.join(__dirname, '..', migration.oldSkillFile);
      const newPath = path.join(__dirname, '..', migration.newSkillFile);

      if (fs.existsSync(oldPath)) {
        // 파일 내용 읽기
        let content = fs.readFileSync(oldPath, 'utf8');

        // 파일 내용에서 SKILL_xxx 참조 업데이트
        content = content.replace(
          new RegExp(`SKILL_${migration.oldId}`, 'g'),
          `SKILL_${migration.newId}`
        );

        // 새 파일로 저장
        fs.writeFileSync(newPath, content, 'utf8');

        // 기존 파일 삭제 (새 파일과 다른 경우만)
        if (oldPath !== newPath) {
          fs.unlinkSync(oldPath);
        }

        console.log(`[파일] ${migration.oldId}.md → ${migration.newId}.md`);
      } else {
        console.log(`[스킵] 파일 없음: ${migration.oldSkillFile}`);
      }

      // 4.2 카탈로그 업데이트
      newsletter.id = migration.newId;
      newsletter.skill_file = migration.newSkillFile;

      successCount++;

    } catch (error) {
      console.error(`[에러] ${migration.email}: ${error.message}`);
      errorCount++;
    }
  }

  // 5. 카탈로그 저장
  catalog.last_scan = new Date().toISOString();
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log('\n[저장] newsletters.json 업데이트 완료');

  // 6. 결과 출력
  console.log('\n=== 마이그레이션 완료 ===');
  console.log(`성공: ${successCount}개`);
  console.log(`에러: ${errorCount}개`);
  console.log(`유지: ${unchanged.length}개`);
}

// 실행
migrate();

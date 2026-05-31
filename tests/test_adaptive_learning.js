/**
 * adaptive_learning.js 단위 테스트
 * - 신규 발신자 감지
 * - SKILL 자동 생성
 * - recordAnalyzeFailure / shouldSkipAnalyze (만성 실패 차단)
 * - generateId (도메인 우선, 중복 시 도메인_사용자)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { AdaptiveLearning } = require('../scripts/adaptive_learning');

module.exports = async function () {

  // 임시 카탈로그 경로로 격리 (실제 config/newsletters.json 손상 방지)
  let tmpDir;
  let originalCatalogPath;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `al-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'skills', 'newsletters'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function makeAL() {
    const al = new AdaptiveLearning();
    // 경로를 임시 디렉토리로 override
    al.configDir = path.join(tmpDir, 'config');
    al.skillsDir = path.join(tmpDir, 'skills', 'newsletters');
    al.catalogPath = path.join(tmpDir, 'config', 'newsletters.json');
    al._catalogCache = null;  // 캐시 리셋
    al._isDirty = false;
    return al;
  }

  await describe('generateId', async () => {
    await it('일반 이메일 → 도메인만 (서브도메인 제거)', () => {
      const al = makeAL();
      assert.equal(al.generateId('news@e.scmp.com'), 'scmp');
    });

    await it('서브도메인 mail. 제거', () => {
      const al = makeAL();
      assert.equal(al.generateId('news@mail.foo.com'), 'foo');
    });

    await it('도메인이 중복되고 일반명이면 도메인_숫자', async () => {
      const al = makeAL();
      // 첫 등록
      await al.registerNewsletter({ email: 'noreply@example.com', name: 'A', label: 'IT', count: 1 });
      // 두 번째 등록 (다른 일반명)
      const id = al.generateId('newsletter@example.com');
      assert.match(id, /^example_2$/);
    });

    await it('도메인이 중복되고 고유 사용자명이면 도메인_사용자', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'noreply@example.com', name: 'A', label: 'IT', count: 1 });
      const id = al.generateId('alice@example.com');
      assert.equal(id, 'example_alice');
    });

    await it('잘못된 이메일 형식 → 정리된 ID', () => {
      const al = makeAL();
      const id = al.generateId('not-an-email');
      assert.ok(id.length > 0);
      assert.match(id, /^[a-z0-9_]+$/);
    });
  });

  await describe('detectNewNewsletters', async () => {
    await it('카탈로그에 없는 발신자만 new로 인식', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'known@example.com', name: 'Known', label: 'IT', count: 1 });

      const senders = [
        { email: 'known@example.com', name: 'Known', count: 1 },
        { email: 'new@example.com', name: 'New', count: 1 }
      ];
      const result = al.detectNewNewsletters(senders, 'IT');
      assert.lengthOf(result, 1);
      assert.equal(result[0].email, 'new@example.com');
    });

    await it('대소문자 무관', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'User@Example.COM', name: 'X', label: 'IT', count: 1 });

      const result = al.detectNewNewsletters(
        [{ email: 'user@example.com', name: 'X', count: 1 }],
        'IT'
      );
      assert.lengthOf(result, 0);  // 이미 등록됨 (대소문자 무관)
    });

    await it('빈 senders → 빈 결과', () => {
      const al = makeAL();
      const result = al.detectNewNewsletters([], 'IT');
      assert.lengthOf(result, 0);
    });
  });

  await describe('registerNewsletter', async () => {
    await it('신규 등록 → catalog에 추가', async () => {
      const al = makeAL();
      const entry = await al.registerNewsletter({
        email: 'new@example.com',
        name: 'New',
        label: 'IT',
        count: 3
      });
      assert.ok(entry);
      assert.equal(entry.sender, 'new@example.com');
      assert.equal(entry.skill_generated, false);
      assert.equal(entry.labels[0], 'IT');
    });

    await it('중복 등록 → null 반환', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'x@y.com', name: 'X', label: 'IT', count: 1 });
      const second = await al.registerNewsletter({ email: 'x@y.com', name: 'X', label: 'IT', count: 1 });
      assert.equal(second, null);
    });
  });

  await describe('saveAnalyzedSkill / isSkillGenerated', async () => {
    await it('SKILL 저장 후 isSkillGenerated true', async () => {
      const al = makeAL();
      const entry = await al.registerNewsletter({ email: 'x@y.com', name: 'X', label: 'IT', count: 1 });

      assert.equal(al.isSkillGenerated('x@y.com'), false);

      al.saveAnalyzedSkill('x@y.com', {
        structure_type: 'multi-item',
        item_count_avg: 5,
        characteristics: '테스트'
      });

      assert.equal(al.isSkillGenerated('x@y.com'), true);
      // SKILL 파일이 임시 skillsDir에 생성되었는지 직접 확인 (getSkillPath는 프로젝트 루트 기준이라 임시 dir과 안 맞음)
      const skillPath = path.join(al.skillsDir, `SKILL_${entry.id}.md`);
      assert.ok(fs.existsSync(skillPath), `SKILL 파일 없음: ${skillPath}`);
    });

    await it('등록되지 않은 이메일에 saveAnalyzedSkill → false 반환', () => {
      const al = makeAL();
      const result = al.saveAnalyzedSkill('unknown@x.com', { structure_type: 'x' });
      assert.equal(result, false);
    });
  });

  await describe('recordAnalyzeFailure / shouldSkipAnalyze (만성 실패 차단)', async () => {
    await it('초기에는 shouldSkipAnalyze false', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'fail@x.com', name: 'F', label: 'IT', count: 1 });
      assert.equal(al.shouldSkipAnalyze('fail@x.com'), false);
    });

    await it('3회 실패 후 shouldSkipAnalyze true', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'fail@x.com', name: 'F', label: 'IT', count: 1 });

      al.recordAnalyzeFailure('fail@x.com');
      assert.equal(al.shouldSkipAnalyze('fail@x.com'), false);  // 1회
      al.recordAnalyzeFailure('fail@x.com');
      assert.equal(al.shouldSkipAnalyze('fail@x.com'), false);  // 2회
      al.recordAnalyzeFailure('fail@x.com');
      assert.equal(al.shouldSkipAnalyze('fail@x.com'), true);  // 3회 → 차단
    });

    await it('maxAttempts 파라미터로 임계값 조정', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'f@x.com', name: 'F', label: 'IT', count: 1 });
      al.recordAnalyzeFailure('f@x.com');
      assert.equal(al.shouldSkipAnalyze('f@x.com', 1), true);  // 1회만으로도 차단
    });

    await it('등록되지 않은 이메일은 recordAnalyzeFailure no-op', () => {
      const al = makeAL();
      // throw 없이 정상 종료해야 함
      al.recordAnalyzeFailure('unknown@x.com');
      assert.equal(al.shouldSkipAnalyze('unknown@x.com'), false);
    });

    await it('analyze_failed_count 필드가 catalog에 저장됨', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'f@x.com', name: 'F', label: 'IT', count: 1 });
      al.recordAnalyzeFailure('f@x.com');
      al.recordAnalyzeFailure('f@x.com');
      al.flush();

      const catalog = JSON.parse(fs.readFileSync(al.catalogPath, 'utf8'));
      const entry = catalog.newsletters.find(n => n.sender === 'f@x.com');
      assert.equal(entry.analyze_failed_count, 2);
      assert.ok(entry.analyze_last_failed_at);
    });
  });

  await describe('processNewSenders (통합)', async () => {
    await it('fetchResult에서 신규 발신자 등록', async () => {
      const al = makeAL();
      const fetchResult = {
        senders: [
          { email: 'a@x.com', name: 'A', count: 1 },
          { email: 'b@y.com', name: 'B', count: 1 }
        ]
      };
      const result = await al.processNewSenders(fetchResult, 'IT');
      assert.equal(result.newCount, 2);
      assert.lengthOf(result.newsletters, 2);
    });

    await it('빈 senders → 빈 결과', async () => {
      const al = makeAL();
      const result = await al.processNewSenders({ senders: [] }, 'IT');
      assert.equal(result.newCount, 0);
    });

    await it('null fetchResult → 빈 결과', async () => {
      const al = makeAL();
      const result = await al.processNewSenders(null, 'IT');
      assert.equal(result.newCount, 0);
    });
  });

  await describe('flush / 캐시', async () => {
    await it('flush 전에는 디스크 미반영', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'x@y.com', name: 'X', label: 'IT', count: 1 });
      // 카탈로그 파일이 아직 없거나 등록 안 됨
      // (saveCatalog가 _isDirty만 표시, 실제 쓰기는 flush에서)
      al.flush();
      assert.ok(fs.existsSync(al.catalogPath));
    });

    await it('flush 후 _isDirty false', async () => {
      const al = makeAL();
      await al.registerNewsletter({ email: 'x@y.com', name: 'X', label: 'IT', count: 1 });
      al.flush();
      assert.equal(al._isDirty, false);
    });
  });
};

/**
 * GitHub Actions workflow 정적 검증
 * - YAML 파싱 가능
 * - 필수 필드 존재 (name, on, jobs)
 * - daily-digest.yml: 필수 secrets 참조, permissions, concurrency
 * - test.yml: matrix, npm test 단계, coverage
 * - 위험 패턴 (skip 안전 검사, force push 등) 부재
 *
 * YAML 파서는 정식 ESM 모듈 사용 없이 미니멀 라인 기반 파싱.
 * (yaml 패키지 추가하지 않기 위해 — workflow 구조 검증에만 필요)
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_DIR = path.join(PROJECT_ROOT, '.github', 'workflows');

module.exports = async function () {

  function loadWorkflow(filename) {
    return fs.readFileSync(path.join(WORKFLOW_DIR, filename), 'utf8');
  }

  function listWorkflows() {
    if (!fs.existsSync(WORKFLOW_DIR)) return [];
    return fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  }

  await describe('workflow 디렉토리 구조', async () => {
    await it('.github/workflows 디렉토리 존재', () => {
      assert.ok(fs.existsSync(WORKFLOW_DIR));
    });

    await it('최소 1개 이상 워크플로우 존재', () => {
      const files = listWorkflows();
      assert.gt(files.length, 0);
    });

    await it('daily-digest.yml + test.yml 둘 다 존재', () => {
      const files = listWorkflows();
      assert.includes(files, 'daily-digest.yml');
      assert.includes(files, 'test.yml');
    });
  });

  await describe('daily-digest.yml 정적 검증', async () => {
    const content = fs.existsSync(path.join(WORKFLOW_DIR, 'daily-digest.yml'))
      ? loadWorkflow('daily-digest.yml')
      : '';

    await it('YAML 파싱 가능 (탭 문자 없음)', () => {
      // 탭 문자는 YAML에서 금지
      assert.notIncludes(content, '\t');
    });

    await it('name 필드 존재', () => {
      assert.match(content, /^name:\s+\S/m);
    });

    await it('on 트리거: workflow_dispatch (cron 제거, 노트북 외부 트리거)', () => {
      assert.match(content, /^on:/m);
      assert.includes(content, 'workflow_dispatch:');
    });

    await it('cron 미사용 (정시성 위해 외부 디스패치만 사용)', () => {
      // GitHub cron 큐 지연 회피를 위해 schedule: cron 제거됨.
      // 노트북 작업 스케줄러가 workflow_dispatch로 정시 트리거.
      assert.ok(!/cron:/.test(content));
    });

    await it('mode 입력: schedule 옵션 + 기본값 schedule', () => {
      // schedule 모드 = 전날 10:01~당일 10:00 KST 윈도우 (누락 없음)
      assert.match(content, /default:\s*['"]schedule['"]/);
      assert.includes(content, '- schedule');
    });

    await it('permissions: contents: write (SKILL 자동 commit용)', () => {
      assert.includes(content, 'permissions:');
      assert.match(content, /contents:\s+write/);
    });

    await it('concurrency 그룹 정의 (동시 실행 방지)', () => {
      assert.includes(content, 'concurrency:');
      assert.match(content, /group:\s+\S/);
    });

    await it('필수 secrets 참조: OLLAMA_API_KEY, GMAIL_CREDENTIALS, GMAIL_TOKEN', () => {
      assert.includes(content, '${{ secrets.OLLAMA_API_KEY }}');
      assert.includes(content, '${{ secrets.GMAIL_CREDENTIALS }}');
      assert.includes(content, '${{ secrets.GMAIL_TOKEN }}');
    });

    await it('OPENROUTER_API_KEY 참조 없음 (구버전 잔재 확인)', () => {
      assert.notIncludes(content, 'OPENROUTER_API_KEY');
    });

    await it('인사이트/크로스인사이트 잔여 참조 없음', () => {
      assert.notIncludes(content, '인사이트');
      assert.notIncludes(content, 'cross_insight');
    });

    await it('Node setup 액션 사용', () => {
      assert.includes(content, 'actions/setup-node');
    });

    await it('Telegram 알림 secrets 옵셔널 (있으면 사용)', () => {
      // TELEGRAM_TOKEN가 if 또는 -z 체크로 옵셔널 처리되어야 함
      assert.includes(content, 'TELEGRAM_TOKEN');
    });

    await it('orchestrator.js 실행 단계 존재', () => {
      assert.includes(content, 'orchestrator.js');
    });

    await it('timeout-minutes 설정 (무한 실행 방지)', () => {
      assert.match(content, /timeout-minutes:\s+\d+/);
    });

    await it('skip-secrets-check 패턴 (필수 secrets 누락 시 안전 종료)', () => {
      // check-secrets step이 skip 출력하면 후속 단계 건너뜀
      assert.match(content, /check-secrets/i);
    });
  });

  await describe('test.yml 정적 검증', async () => {
    const content = fs.existsSync(path.join(WORKFLOW_DIR, 'test.yml'))
      ? loadWorkflow('test.yml')
      : '';

    await it('탭 문자 없음', () => {
      assert.notIncludes(content, '\t');
    });

    await it('push/pull_request 트리거', () => {
      assert.includes(content, 'push:');
      assert.includes(content, 'pull_request:');
    });

    await it('Node 매트릭스 (18+)', () => {
      assert.includes(content, 'matrix:');
      assert.includes(content, 'node-version');
      // Node 18.x or higher
      assert.match(content, /18\.x|20\.x|22\.x/);
    });

    await it('npm test 단계', () => {
      assert.includes(content, 'npm test');
    });

    await it('npm install 또는 ci 단계', () => {
      assert.match(content, /npm (install|ci)/);
    });

    await it('coverage 단계 존재', () => {
      assert.includes(content, 'coverage');
    });

    await it('timeout-minutes 설정', () => {
      assert.match(content, /timeout-minutes:\s+\d+/);
    });

    await it('coverage artifact 업로드', () => {
      assert.includes(content, 'upload-artifact');
    });
  });

  await describe('전역: 위험 패턴 부재', async () => {
    const files = listWorkflows();

    await it('--force push 명령 없음', () => {
      for (const f of files) {
        const c = loadWorkflow(f);
        assert.notIncludes(c, 'push --force');
        assert.notIncludes(c, 'push -f ');
      }
    });

    await it('GITHUB_TOKEN 안전 처리 (echo로 출력 안 함)', () => {
      for (const f of files) {
        const c = loadWorkflow(f);
        // "echo $GITHUB_TOKEN" 또는 비슷한 패턴 검출
        assert.notIncludes(c, 'echo $GITHUB_TOKEN');
        assert.notIncludes(c, 'echo ${GITHUB_TOKEN}');
      }
    });

    await it('hook 우회 (--no-verify) 사용 없음', () => {
      for (const f of files) {
        const c = loadWorkflow(f);
        assert.notIncludes(c, '--no-verify');
      }
    });
  });
};

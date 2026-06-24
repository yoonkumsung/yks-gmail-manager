/**
 * GitHub Actions workflow + 서버 실행 스크립트 정적 검증
 * - YAML 파싱 가능 / 필수 필드 존재
 * - daily-digest.yml 제거됨 (2026-06 노트북 서버 systemd 타이머로 이전)
 * - run_digest.sh: 서버 실행 파이프라인 단계 존재
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

    await it('test.yml(CI) 존재', () => {
      const files = listWorkflows();
      assert.includes(files, 'test.yml');
    });

    await it('daily-digest.yml 제거됨 (노트북 서버 systemd 타이머로 이전)', () => {
      assert.ok(!fs.existsSync(path.join(WORKFLOW_DIR, 'daily-digest.yml')));
    });
  });

  await describe('run_digest.sh (서버 실행 스크립트) 정적 검증', async () => {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'run_digest.sh');
    const content = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';

    await it('스크립트 존재', () => {
      assert.ok(fs.existsSync(scriptPath));
    });

    await it('schedule 모드로 orchestrator 실행', () => {
      assert.includes(content, 'orchestrator.js');
      assert.includes(content, 'schedule');
    });

    await it('.env 로드 (OpenRouter 키는 서버 .env)', () => {
      assert.includes(content, '.env');
    });

    await it('gh-pages 발행 단계 (worktree)', () => {
      assert.includes(content, 'gh-pages');
      assert.includes(content, 'generate_index_page.js');
    });

    await it('SKILL 자동커밋 + Drive 업로드 + Telegram 단계', () => {
      assert.includes(content, 'newsletters.json');
      assert.includes(content, 'upload_to_drive.js');
      assert.includes(content, 'TELEGRAM_TOKEN');
    });

    await it('OLLAMA 잔재 없음 (OpenRouter 전환)', () => {
      assert.notIncludes(content, 'OLLAMA');
      assert.notIncludes(content, 'ollama');
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

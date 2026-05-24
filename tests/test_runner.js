/**
 * 미니멀 테스트 러너 (외부 의존성 없음)
 * 사용법: node tests/test_runner.js [파일패턴]
 *   node tests/test_runner.js                    # 전체 실행
 *   node tests/test_runner.js agent_runner       # 파일명 포함 필터
 *   node tests/test_runner.js --live             # 통합 테스트 포함 (Gmail API 필요)
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 테스트 프레임워크
// ============================================

let currentSuite = '';
let currentTest = '';
let results = { passed: 0, failed: 0, skipped: 0, errors: [] };
let suiteSetup = null;
let suiteTeardown = null;

async function describe(name, fn) {
  const prevSuite = currentSuite;
  currentSuite = prevSuite ? `${prevSuite} > ${name}` : name;
  console.log(`\n  ${currentSuite}`);
  const prevSetup = suiteSetup;
  const prevTeardown = suiteTeardown;
  // 자식 describe는 부모 setup/teardown 상속
  await fn();
  suiteSetup = prevSetup;
  suiteTeardown = prevTeardown;
  currentSuite = prevSuite;
}

function beforeEach(fn) {
  suiteSetup = fn;
}

function afterEach(fn) {
  suiteTeardown = fn;
}

async function it(name, fn) {
  currentTest = name;
  try {
    if (suiteSetup) await suiteSetup();
    await fn();
    if (suiteTeardown) await suiteTeardown();
    results.passed++;
    console.log(`    \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.failed++;
    const location = `${currentSuite} > ${name}`;
    results.errors.push({ location, message: err.message, stack: err.stack });
    console.log(`    \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      \x1b[31m${err.message}\x1b[0m`);
  }
}

function skip(name) {
  results.skipped++;
  console.log(`    \x1b[33m- ${name} (skipped)\x1b[0m`);
}

// ============================================
// Assertions
// ============================================

const assert = {
  equal(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(msg || `Deep equal failed:\n  actual:   ${a}\n  expected: ${e}`);
    }
  },
  ok(value, msg) {
    if (!value) throw new Error(msg || `Expected truthy, got ${JSON.stringify(value)}`);
  },
  notOk(value, msg) {
    if (value) throw new Error(msg || `Expected falsy, got ${JSON.stringify(value)}`);
  },
  throws(fn, msg) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg || 'Expected function to throw');
  },
  async asyncThrows(fn, msg) {
    let threw = false;
    try { await fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg || 'Expected async function to throw');
  },
  gt(actual, threshold, msg) {
    if (!(actual > threshold)) throw new Error(msg || `Expected ${actual} > ${threshold}`);
  },
  gte(actual, threshold, msg) {
    if (!(actual >= threshold)) throw new Error(msg || `Expected ${actual} >= ${threshold}`);
  },
  lt(actual, threshold, msg) {
    if (!(actual < threshold)) throw new Error(msg || `Expected ${actual} < ${threshold}`);
  },
  lte(actual, threshold, msg) {
    if (!(actual <= threshold)) throw new Error(msg || `Expected ${actual} <= ${threshold}`);
  },
  includes(haystack, needle, msg) {
    if (typeof haystack === 'string') {
      if (!haystack.includes(needle)) throw new Error(msg || `"${haystack.slice(0, 100)}..." does not include "${needle}"`);
    } else if (Array.isArray(haystack)) {
      if (!haystack.includes(needle)) throw new Error(msg || `Array does not include ${JSON.stringify(needle)}`);
    } else {
      throw new Error('includes: first argument must be string or array');
    }
  },
  notIncludes(haystack, needle, msg) {
    if (typeof haystack === 'string' && haystack.includes(needle)) {
      throw new Error(msg || `String should not include "${needle}"`);
    }
    if (Array.isArray(haystack) && haystack.includes(needle)) {
      throw new Error(msg || `Array should not include ${JSON.stringify(needle)}`);
    }
  },
  match(str, regex, msg) {
    if (!regex.test(str)) throw new Error(msg || `"${str}" does not match ${regex}`);
  },
  lengthOf(arr, len, msg) {
    if (arr.length !== len) throw new Error(msg || `Expected length ${len}, got ${arr.length}`);
  },
  closeTo(actual, expected, delta, msg) {
    if (Math.abs(actual - expected) > delta) {
      throw new Error(msg || `Expected ${actual} to be within ${delta} of ${expected}`);
    }
  },
  type(value, typeName, msg) {
    if (typeof value !== typeName) {
      throw new Error(msg || `Expected type ${typeName}, got ${typeof value}`);
    }
  }
};

// ============================================
// 메인 러너
// ============================================

async function runTests() {
  const args = process.argv.slice(2);
  const filter = args.find(a => !a.startsWith('--')) || '';
  const isLive = args.includes('--live');

  console.log('\n\x1b[1m=== YKS Gmail Manager 테스트 ===\x1b[0m');
  if (filter) console.log(`필터: "${filter}"`);
  if (isLive) console.log('\x1b[33m⚠ LIVE 모드: Gmail API 연동 테스트 포함\x1b[0m');

  // 테스트 파일 탐색
  const testDir = __dirname;
  const testFiles = fs.readdirSync(testDir)
    .filter(f => f.startsWith('test_') && f.endsWith('.js') && f !== 'test_runner.js' && f !== 'test_all_newsletters.js')
    .filter(f => !filter || f.includes(filter));

  if (testFiles.length === 0) {
    console.log('\n테스트 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log(`테스트 파일 ${testFiles.length}개 발견\n`);

  // 글로벌 내보내기
  global.describe = describe;
  global.it = it;
  global.skip = skip;
  global.assert = assert;
  global.beforeEach = beforeEach;
  global.afterEach = afterEach;
  global.IS_LIVE = isLive;

  for (const file of testFiles) {
    console.log(`\n\x1b[1m━━━ ${file} ━━━\x1b[0m`);
    const testModule = require(path.join(testDir, file));
    if (typeof testModule === 'function') {
      await testModule();
    }
  }

  // 결과 요약
  console.log('\n\x1b[1m━━━ 결과 ━━━\x1b[0m');
  console.log(`  \x1b[32m${results.passed} passed\x1b[0m`);
  if (results.failed > 0) console.log(`  \x1b[31m${results.failed} failed\x1b[0m`);
  if (results.skipped > 0) console.log(`  \x1b[33m${results.skipped} skipped\x1b[0m`);

  if (results.errors.length > 0) {
    console.log('\n\x1b[31m실패 상세:\x1b[0m');
    for (const err of results.errors) {
      console.log(`\n  \x1b[31m✗ ${err.location}\x1b[0m`);
      console.log(`    ${err.message}`);
    }
  }

  const total = results.passed + results.failed;
  console.log(`\n총 ${total}개 테스트, 통과율 ${total > 0 ? Math.round(results.passed / total * 100) : 0}%\n`);

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('테스트 러너 오류:', err);
  process.exit(1);
});

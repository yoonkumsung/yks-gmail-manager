#!/bin/bash
# ---------------------------------------------------------------------------
# 뉴스레터 다이제스트 — 서버(노트북) 정시 실행 스크립트
#
# GitHub Actions(daily-digest.yml)를 대체한다. WSL Ubuntu의 systemd user 타이머
# (yks-newsletter.timer)가 매일 10:00 KST에 yks-newsletter.service를 통해 호출.
#
# 단계: git pull → deps → 추출 실행 → SKILL 자동커밋(main) → gh-pages 발행
#       → Google Drive 업로드 → Telegram 알림.  (실패 시 Telegram 에러 알림)
#
# 필요 환경: 레포 클론 + .env(OPENROUTER_API_KEY 등) + config/credentials/{client_secret,token}.json
#            + git push 자격증명(PAT/SSH). 자세한 셋업은 docs/SERVER_SETUP.md.
# ---------------------------------------------------------------------------
set -uo pipefail

# 레포 루트 = 이 스크립트의 상위 디렉토리
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# .env 로드 (OPENROUTER_API_KEY, TELEGRAM_*, GDRIVE_FOLDER_ID 등)
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

START_EPOCH=$(date +%s)
RUN_ID=$(TZ='Asia/Seoul' date '+%Y%m%d')
DATE_DASH=$(TZ='Asia/Seoul' date '+%Y-%m-%d')
RUN_DIR="output/final/${RUN_ID}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# --- 실패 시 Telegram 에러 알림 (trap) ---------------------------------------
notify_error() {
  local rc=$1
  if [ -n "${TELEGRAM_TOKEN:-}" ]; then
    local elapsed=$(( $(date +%s) - START_EPOCH ))
    local msg
    msg=$(printf "%s 뉴스레터 정리 실패(exit %s).\n소요: %d분 %d초\n서버 로그: journalctl --user -u yks-newsletter -n 100" \
      "$DATE_DASH" "$rc" $(( elapsed / 60 )) $(( elapsed % 60 )))
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$msg" >/dev/null || true
  fi
}
trap 'rc=$?; if [ $rc -ne 0 ]; then log "실패(exit $rc)"; notify_error $rc; fi' EXIT

# --- 1) 코드 최신화 ----------------------------------------------------------
log "git pull"
git fetch -q origin main && git pull --ff-only -q || log "pull 건너뜀(로컬 변경/오프라인)"

# --- 2) 의존성 (package-lock 미커밋 → install) -------------------------------
log "npm install"
npm install --no-audit --no-fund

# --- 3) 추출 파이프라인 (schedule 모드: 전날 10:01~당일 10:00 KST) -----------
MODE="${1:-schedule}"
log "orchestrator 실행 (mode=$MODE)"
node scripts/orchestrator.js --mode "$MODE"
ORCH_RC=$?

# 대량 실패(추출 전량 실패/고실패율/라벨 예외) 시 orchestrator가 exit≠0으로 종료한다.
# 이 경우 0건/부분 발행을 막기 위해 발행 단계를 건너뛰고 즉시 종료 → trap이 Telegram 에러 알림.
# (정상 0건은 orchestrator가 exit 0으로 끝내므로 여기 안 걸리고, 아래 "처리 0건" 정상 흐름을 탄다.)
if [ "$ORCH_RC" -ne 0 ]; then
  log "orchestrator 비정상 종료(exit $ORCH_RC) → 발행 차단"
  exit "$ORCH_RC"
fi

# --- 4) SKILL/카탈로그 자동 변경 커밋 (main) ---------------------------------
if [ -n "$(git status --porcelain skills/newsletters/ config/newsletters.json 2>/dev/null)" ]; then
  log "SKILL/카탈로그 변경 커밋"
  git add skills/newsletters/*.md config/newsletters.json 2>/dev/null || true
  git diff --staged --quiet || git commit -q -m "chore: 새 뉴스레터 SKILL 자동 생성"
  git push -q origin main || log "main push 실패(자격증명 확인)"
else
  log "SKILL 변경 없음"
fi

# --- 5) GitHub Pages 발행 (gh-pages worktree) --------------------------------
HTML=$(find "$RUN_DIR" -name "*통합*.html" 2>/dev/null | head -1)
if [ -z "$HTML" ]; then
  log "발행할 HTML 없음(처리 0건) → 발행 건너뜀"
else
  log "gh-pages 발행: $DATE_DASH"
  rm -rf ../ghpages 2>/dev/null || true
  git fetch -q origin gh-pages
  git worktree prune
  git worktree add -q ../ghpages gh-pages
  mkdir -p ../ghpages/reports
  cp "$HTML" "../ghpages/reports/$DATE_DASH.html"
  node scripts/generate_index_page.js --base-dir ../ghpages || true
  (
    cd ../ghpages
    git add reports/"$DATE_DASH".html reports/index.html index.html 2>/dev/null || git add -A
    git commit -q -m "report: $DATE_DASH 뉴스레터 리포트" || echo "변경 없음"
    git push -q origin gh-pages || echo "gh-pages push 실패(자격증명 확인)"
  )
  git worktree remove ../ghpages --force 2>/dev/null || true
fi

# --- 6) Google Drive 업로드 (통합 MD) ----------------------------------------
if [ -n "${GDRIVE_FOLDER_ID:-}" ]; then
  MD=$(find "$RUN_DIR" -name "*통합*.md" 2>/dev/null | head -1)
  if [ -n "$MD" ]; then
    log "Drive 업로드: $(basename "$MD")"
    node scripts/upload_to_drive.js "$MD" "$(basename "$MD")" "${RUN_ID:0:4}" || log "Drive 업로드 실패"
  fi
fi

# --- 7) Telegram 완료 알림 + 리포트 파일 전송 --------------------------------
if [ -n "${TELEGRAM_TOKEN:-}" ]; then
  ELAPSED=$(( $(date +%s) - START_EPOCH ))
  EMIN=$(( ELAPSED / 60 )); ESEC=$(( ELAPSED % 60 ))
  if [ ! -d "$RUN_DIR" ]; then
    MSG=$(printf "%s 뉴스레터 정리 완료.\n오늘은 처리할 뉴스레터가 없었습니다.\n소요: %d분 %d초" "$DATE_DASH" "$EMIN" "$ESEC")
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$MSG" >/dev/null || true
  else
    LABEL_COUNT=$(find "$RUN_DIR" -name "*_메일정리.md" 2>/dev/null | grep -v "통합" | wc -l | tr -d ' ')
    LABEL_NAMES=$(find "$RUN_DIR" -name "*_메일정리.md" 2>/dev/null | grep -v "통합" | xargs -I {} basename {} | sed 's/^[0-9]*_//' | sed 's/_메일정리.md$//' | tr '\n' ',' | sed 's/,$//')
    HTML_FILE=$(find "$RUN_DIR" -name "*통합*메일정리.html" 2>/dev/null | head -1)
    MD_FILE=$(find "$RUN_DIR" -name "*통합*메일정리.md" 2>/dev/null | head -1)
    MSG=$(printf "%s 뉴스레터 정리 완료.\n%s 등 %s개 라벨 처리.\n소요: %d분 %d초\n\n아래 리포트를 보내드립니다." "$DATE_DASH" "$LABEL_NAMES" "$LABEL_COUNT" "$EMIN" "$ESEC")
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" -d text="$MSG" >/dev/null || true
    [ -n "$HTML_FILE" ] && curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" \
      -F chat_id="${TELEGRAM_CHAT_ID}" -F document=@"${HTML_FILE}" -F caption="HTML 리포트" >/dev/null || true
    [ -n "$MD_FILE" ] && curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" \
      -F chat_id="${TELEGRAM_CHAT_ID}" -F document=@"${MD_FILE}" -F caption="Markdown 리포트" >/dev/null || true
  fi
fi

log "완료"

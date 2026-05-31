#!/usr/bin/env bash
# GitHub Actions를 통한 날짜별 순차 재처리
# 사용법: bash scripts/batch_reprocess.sh 2026-01-04 2026-04-12 [owner/repo]
# REPO 미지정 시 현재 git remote 'origin'에서 자동 추출
set -euo pipefail

START_DATE="${1:?사용법: bash scripts/batch_reprocess.sh YYYY-MM-DD YYYY-MM-DD [owner/repo]}"
END_DATE="${2:?종료 날짜를 지정하세요}"
WORKFLOW="Gmail 메일 정리"

# REPO 인자 → 환경변수 → git remote 순으로 결정
if [[ -n "${3:-}" ]]; then
  REPO="$3"
elif [[ -n "${GITHUB_REPO:-}" ]]; then
  REPO="$GITHUB_REPO"
else
  # git remote get-url origin → owner/repo 추출
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
  REPO=$(echo "$REMOTE_URL" | sed -E 's#^.*github.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#')
  if [[ -z "$REPO" || "$REPO" == "$REMOTE_URL" ]]; then
    echo "오류: 저장소를 자동 감지할 수 없습니다. 3번째 인자 또는 GITHUB_REPO 환경변수로 'owner/repo'를 지정하세요." >&2
    exit 1
  fi
fi

echo "대상 저장소: $REPO"

echo "=== 재처리: ${START_DATE} ~ ${END_DATE} ==="

# 날짜 범위 생성
current="$START_DATE"
dates=()
while [[ "$current" < "$END_DATE" ]] || [[ "$current" == "$END_DATE" ]]; do
  dates+=("$current")
  current=$(date -j -v+1d -f "%Y-%m-%d" "$current" "+%Y-%m-%d" 2>/dev/null \
    || date -d "$current + 1 day" "+%Y-%m-%d")
done

echo "총 ${#dates[@]}일"
echo ""

for i in "${!dates[@]}"; do
  date="${dates[$i]}"
  echo "[$(( i + 1 ))/${#dates[@]}] ${date}"

  # 워크플로우 트리거
  gh workflow run "$WORKFLOW" -R "$REPO" -f mode=custom -f custom_date="$date"
  echo "  → 트리거 완료"

  # 이전 실행이 끝날 때까지 대기
  sleep 10  # 워크플로우 등록 대기
  while true; do
    # 실행 중인 워크플로우 확인
    running=$(gh run list -R "$REPO" -w "$WORKFLOW" --status in_progress --json databaseId -q 'length' 2>/dev/null || echo "0")
    queued=$(gh run list -R "$REPO" -w "$WORKFLOW" --status queued --json databaseId -q 'length' 2>/dev/null || echo "0")

    if [[ "$running" == "0" && "$queued" == "0" ]]; then
      # 마지막 실행 결과 확인
      last_status=$(gh run list -R "$REPO" -w "$WORKFLOW" --limit 1 --json conclusion -q '.[0].conclusion' 2>/dev/null || echo "unknown")
      if [[ "$last_status" == "success" ]]; then
        echo "  ✅ 완료"
      else
        echo "  ⚠️ 결과: ${last_status}"
      fi
      break
    fi

    sleep 30  # 30초마다 확인
  done

  echo ""
done

echo "=== 전체 완료 ==="

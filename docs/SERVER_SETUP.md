# 서버(노트북) 정시 실행 셋업 — GitHub Actions 대체

> 2026-06 GitHub Actions(`daily-digest.yml`)를 제거하고, 24/7 노트북 서버(WSL Ubuntu)의
> **systemd user 타이머**가 매일 10:00 KST에 다이제스트를 직접 실행하도록 전환했다.
> GitHub은 **코드 보관 + Pages 호스팅(gh-pages)** 용도로만 쓴다.
>
> 실행 주체: `~/yks-gmail-manager/scripts/run_digest.sh` ← `yks-newsletter.service` ← `yks-newsletter.timer`
> (systemd 유닛은 `yks-server/digest/`에 있음 — `yks-bots` autodeploy와 동일 패턴.)

서버 터미널(`ssh yks@laptop`, Tailscale)에서 아래를 **1회** 수행한다.

## 1. 레포 클론 + Node

```bash
cd ~
git clone https://github.com/yoonkumsung/yks-gmail-manager.git
cd ~/yks-gmail-manager

# Node 20+ 필요 (jsdom@29). nvm 권장
node --version || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# (nvm 설치했으면 새 셸 후) nvm install 20
npm install --no-audit --no-fund
```

## 2. 비밀/설정 파일 (서버에 영구 보관)

`.env` 생성 — **OpenRouter 키는 여기에만** 둔다(GitHub 시크릿 불필요):

```bash
cat > .env <<'EOF'
OPENROUTER_API_KEY=sk-or-v1-...        # 본인 OpenRouter 키
OPENROUTER_MODEL=deepseek/deepseek-v4-pro
TELEGRAM_TOKEN=...                      # 선택
TELEGRAM_CHAT_ID=...                    # 선택
GDRIVE_FOLDER_ID=...                    # 선택 (Drive 업로드 시)
EOF
chmod 600 .env
```

Gmail/Drive 자격증명 — **로컬 머신에서 복사**(서버는 헤드리스라 브라우저 OAuth가 번거로움):

```bash
mkdir -p config/credentials
# 로컬(현재 데스크탑)의 config/credentials/{client_secret.json, token.json} 를 서버로 scp
#   예) scp config/credentials/*.json yks@laptop:~/yks-gmail-manager/config/credentials/
```

> token.json은 프로덕션 OAuth라 refresh_token이 만료되지 않음(라이브러리가 access_token 자동 갱신).

## 3. git push 자격증명 (gh-pages 발행 + SKILL 자동커밋용)

서버에서 push가 되는지 먼저 확인:

```bash
cd ~/yks-gmail-manager && git push --dry-run origin main
```

**실패하면** 둘 중 하나 설정:

- **PAT (간단)** — GitHub → Settings → Developer settings → Fine-grained token
  (repo `yks-gmail-manager` Contents: Read/Write). 그 뒤:
  ```bash
  git config --global credential.helper store
  # 다음 push 때 username=깃헙ID, password=PAT 입력하면 ~/.git-credentials에 저장됨
  ```
- **SSH** — `ssh-keygen -t ed25519` → 공개키를 GitHub에 등록 →
  `git remote set-url origin git@github.com:yoonkumsung/yks-gmail-manager.git`

## 4. 타임존 (10:00을 KST로)

```bash
sudo timedatectl set-timezone Asia/Seoul   # 또는 신형 systemd면 timer의 OnCalendar에 TZ 명시
timedatectl                                 # Time zone: Asia/Seoul 확인
```

## 5. systemd user 타이머 설치

```bash
git -C ~/yks-server pull   # 최신 유닛 받기
mkdir -p ~/.config/systemd/user
cp ~/yks-server/digest/yks-newsletter.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now yks-newsletter.timer

# (재부팅/로그아웃 후에도 타이머가 돌도록 — 이미 되어 있을 수 있음)
sudo loginctl enable-linger yks
```

## 6. 검증

```bash
# 타이머 등록·다음 실행 시각 확인
systemctl --user list-timers yks-newsletter.timer

# 수동 1회 실행 (정시 안 기다리고 바로)
systemctl --user start yks-newsletter.service

# 로그 보기
journalctl --user -u yks-newsletter -f
```

성공하면 ① gh-pages에 `reports/<날짜>.html` 푸시 ② (설정 시) Drive 업로드 ③ Telegram 알림이 온다.
Pages 라우팅: `https://yoonkumsung.github.io/yks-gmail-manager/reports/`.

## 운영 메모

- 스케줄 윈도우는 코드가 KST 기준 **전날 10:01 ~ 당일 10:00**으로 계산(누락 없는 24h 타일링).
- 노트북이 10시에 꺼져 있었으면 `Persistent=true`로 **켜진 직후 1회 보충 실행**.
- 코드 업데이트: 데스크탑에서 push → 서버는 `run_digest.sh`가 매 실행 시작에 `git pull`로 자동 최신화.
- 실패 시 Telegram 에러 알림 + `journalctl --user -u yks-newsletter -n 100`로 원인 확인.
- GitHub Actions는 제거됨. 더 이상 GitHub 시크릿(OPENROUTER_API_KEY 등) 불필요.

# Gmail Manager - Project Rules

## Gitignore 파일의 시크릿 배포 규칙

`config/user_profile.json`은 `.gitignore`에 포함된 시크릿 파일이다.
이 파일을 수정한 후 사용자가 커밋/푸시를 요청하면, 반드시 다음을 함께 수행할 것:

1. git 커밋 대상이 아님을 인지 (gitignore 대상)
2. `gh secret set USER_PROFILE < config/user_profile.json` 명령으로 GitHub Secrets에 반영
3. 사용자에게 시크릿 업데이트 완료를 보고

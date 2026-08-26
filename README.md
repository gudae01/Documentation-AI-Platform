# Clinical Documentation AI Platform

병원 내부 진료 흐름을 한 환자 단위로 확인하는 프런트엔드와 Spring Boot 백엔드입니다.

- 프런트엔드: 화면 및 사용자 흐름
- 백엔드: 환자 등록번호 조회, 진료 임시저장/복구, 최종 승인, 첨부파일 저장
- 인증: 카카오 로그인, 계정당 동시 로그인 1개
- 데이터베이스: 로컬 H2 파일 DB
- AI 분석·자동 SOAP·음성 전사: 현재 백엔드 범위에서 제외

## 프런트엔드 실행

```bash
npm ci
npm run dev
```

## 백엔드 실행

Java 17 이상이 필요합니다. Gradle은 Wrapper로 포함되어 별도 설치가 필요 없습니다.

```powershell
cd backend
$env:KAKAO_REST_API_KEY="카카오 REST API 키"
$env:KAKAO_CLIENT_SECRET="카카오 Client Secret"
.\gradlew.bat bootRun
```

테스트:

```powershell
cd backend
.\gradlew.bat test
```

자세한 카카오 설정과 API 사용법은 [백엔드 문서](backend/README.md)를 확인하세요.

## GitHub Pages 배포

`main` 브랜치에 변경사항을 푸시하면 GitHub Actions가 정적 사이트를 빌드하고 GitHub Pages에 배포합니다.

최초 한 번 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택해야 합니다.

배포 주소: <https://gudae01.github.io/Documentation-AI-Platform/>

> 프런트엔드는 아직 백엔드 API와 연결되지 않았습니다. H2와 예시 데이터는 개발용이며, 공개 배포 환경에 실제 환자 개인정보를 저장하면 안 됩니다.

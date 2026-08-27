# MEDIFLOW Backend

Java 17, Spring Boot 4.1, Spring Security, JPA, H2 기반의 파킨슨병 사전 문진·입원 결과 백엔드입니다. AI 생성 기능은 포함하지 않습니다.

## 필수 보안 설정

```powershell
$env:APP_DATA_ENCRYPTION_KEY="32자 이상 무작위 비밀값"
$env:KAKAO_REST_API_KEY="카카오 REST API 키"
$env:KAKAO_CLIENT_SECRET="카카오 Client Secret"
$env:CLINICIAN_KAKAO_IDS="123456789,987654321"
$env:FRONTEND_URL="http://localhost:5173"
$env:CORS_ALLOWED_ORIGINS="http://localhost:5173"
$env:QUESTIONNAIRE_PUBLIC_URL="http://localhost:5173"
.\gradlew.bat bootRun
```

- 암호화 키가 없거나 32자 미만이면 서버는 시작하지 않습니다.
- 허용 목록에 없는 카카오 계정은 의료진 권한을 받지 못합니다.
- 이름, 생년월일 앞 6자리, 연락처, 문진/EMR 원문, 보고서는 AES-256-GCM으로 저장합니다.
- 링크 토큰은 256비트 난수이며 DB에는 SHA-256 해시만 저장합니다.
- 링크는 만료·철회·제출 후 사용할 수 없습니다.
- H2 콘솔은 기본 비활성화하고, 동시 로그인은 계정당 1개로 제한합니다. 유휴시간 자동 로그아웃은 사용하지 않습니다.

## 문진 링크 전송

```powershell
$env:QUESTIONNAIRE_DELIVERY_WEBHOOK_URL="https://messaging.example.org/send"
$env:QUESTIONNAIRE_DELIVERY_WEBHOOK_TOKEN="웹훅 Bearer 토큰"
```

웹훅 요청 본문:

```json
{
  "channel": "SMS",
  "recipient": "01012345678",
  "message": "파킨슨병 사전 문진을 작성해 주세요.",
  "link": "https://service.example.org/?questionnaireToken=..."
}
```

웹훅 URL은 HTTPS만 허용합니다. 미설정 상태는 `NOT_CONFIGURED`, 실패는 `FAILED`, 성공 응답만 `SENT`로 저장합니다.

## 주요 API

| Method | Path | 권한 | 기능 |
|---|---|---|---|
| GET | `/api/auth/me` | 공개 | 로그인 상태 |
| GET | `/api/auth/csrf` | 공개 | CSRF 토큰 |
| POST | `/api/pd/questionnaire-invitations` | 의료진 | 링크 생성·전송 |
| GET | `/api/pd/questionnaire-invitations` | 의료진 | 링크 상태 목록 |
| DELETE | `/api/pd/questionnaire-invitations/{id}` | 의료진 | 링크 철회 |
| GET | `/api/public/questionnaires/{token}` | 토큰 | 링크 확인 |
| PUT | `/api/public/questionnaires/{token}/draft` | 토큰 | 암호화 임시저장 |
| POST | `/api/public/questionnaires/{token}/submit` | 토큰 | 문진 제출 |
| GET | `/api/pd/questionnaires` | 의료진 | 이름·생년월일·성별·예정일·상태 검색 |
| PUT | `/api/pd/questionnaires/{id}/review` | 의료진 | 검토 문안 저장 |
| POST | `/api/pd/admissions` | 의료진 | EMR 저장·구조화·비교 |
| PUT | `/api/pd/admissions/{id}/report` | 의료진 | 보고서 검토 저장 |
| POST | `/api/pd/admissions/{id}/approve` | 의료진 | 보고서 최종 승인 |
| GET | `/api/pd/admissions/{id}/pdf` | 의료진 | 한글 PDF 결과지 다운로드 |
| POST | `/api/pd/admissions/{id}/attachments` | 의료진 | PDF·이미지·텍스트 암호화 첨부 |
| GET | `/api/pd/admissions/{id}/attachments/{attachmentId}` | 의료진 | 첨부 다운로드 |
| GET | `/api/pd/audit-logs` | 의료진 | 감사로그 조회 |

변경 요청은 `/api/auth/csrf`가 반환한 헤더 이름과 토큰을 함께 전송해야 합니다.

## H2

DB 파일은 `backend/data/mediflow.mv.db`에 생성됩니다. 초기 더미 데이터는 넣지 않습니다. H2 콘솔을 필요한 로컬 점검에만 켤 수 있습니다.

```powershell
$env:H2_CONSOLE_ENABLED="true"
```

실제 환자정보를 사용하는 환경에서는 콘솔을 활성화하지 마세요.

## 테스트

```powershell
.\gradlew.bat test
```

테스트는 인증 차단, 기존 임상 워크플로, 토큰/수신처 비노출, 링크 재사용 차단, EMR S/O·NRS·일상생활 파싱을 확인합니다.

## 컨테이너 실행

`publish-backend.yml`은 `main` push 시 `ghcr.io/<owner>/mediflow-backend` 이미지를 발행합니다. 실행 서버에서는 `.env.production.example`을 복사해 실제 Secret 저장소의 값을 주입하고 다음처럼 시작합니다.

```powershell
docker compose --env-file .env.production -f compose.production.yml up -d
```

카카오 REST 키, Client Secret, 데이터 암호화 키, 메시징 웹훅 토큰을 저장소나 Docker 이미지에 넣지 마세요. 카카오 Redirect URI에는 실제 백엔드 HTTPS 주소의 `/login/oauth2/code/kakao`를 등록해야 합니다.

# Mediflow Spring Boot Backend

## 핵심 구성

- Java 17
- Gradle Wrapper 8.14.5
- Spring Boot 4.1.0
- Spring Web MVC, Spring Data JPA, Bean Validation
- Spring Security OAuth2 Client + 카카오 로그인
- H2 파일 데이터베이스

AI 모델, 음성 전사, 자동 SOAP 생성 코드는 포함하지 않습니다. 사용자가 작성한 차트·SOAP·검사 결과를 그대로 저장합니다.

## 카카오 로그인 설정

카카오 개발자 콘솔에서 다음을 설정합니다.

1. 카카오 로그인을 활성화합니다.
2. REST API 키의 Client Secret을 활성화합니다.
3. Redirect URI를 등록합니다.

로컬 Redirect URI:

```text
http://localhost:8080/login/oauth2/code/kakao
```

배포 시에는 백엔드의 실제 HTTPS 주소로 바꿉니다.

```text
https://api.example.com/login/oauth2/code/kakao
```

PowerShell 실행 예시:

```powershell
$env:KAKAO_REST_API_KEY="REST API 키"
$env:KAKAO_CLIENT_SECRET="Client Secret"
$env:FRONTEND_URL="http://localhost:5173"
$env:CORS_ALLOWED_ORIGINS="http://localhost:5173"
.\gradlew.bat bootRun
```

로그인 시작 URL은 `/oauth2/authorization/kakao`입니다. 로그인 성공 후 `FRONTEND_URL`로 이동합니다.

같은 카카오 계정으로 다른 기기에서 로그인하면 기존 세션은 만료됩니다. 따라서 iPad에서 임시저장한 뒤 데스크톱에서 같은 계정으로 로그인하면 데스크톱만 로그인 상태가 되고, 최신 임시저장을 불러올 수 있습니다.

## 브라우저 요청 규칙

세션 쿠키를 사용하므로 프런트엔드 요청에 `credentials: "include"`가 필요합니다. `POST`, `PUT`, `DELETE` 전에는 `/api/auth/csrf`에서 토큰을 받은 뒤 반환된 헤더 이름으로 토큰을 전송합니다.

```javascript
const csrf = await fetch(`${API_URL}/api/auth/csrf`, {
  credentials: "include",
}).then((response) => response.json());

await fetch(`${API_URL}/api/encounters`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    [csrf.headerName]: csrf.token,
  },
  body: JSON.stringify({
    registrationNumber: "P-2024-01842",
    type: "FOLLOW_UP",
  }),
});
```

프런트엔드와 백엔드가 서로 다른 사이트에 배포되면 다음 환경변수도 필요합니다.

```powershell
$env:SESSION_COOKIE_SECURE="true"
$env:SESSION_COOKIE_SAME_SITE="none"
```

운영 환경에서는 HTTPS를 사용해야 합니다.

## 주요 API

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/auth/me` | 현재 카카오 로그인 상태 |
| GET | `/api/auth/csrf` | 변경 요청용 CSRF 토큰 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/patients/{registrationNumber}` | 등록번호가 정확히 일치하는 환자 조회 |
| GET | `/api/patients/{registrationNumber}/records` | 환자의 승인된 진료기록 조회 |
| POST | `/api/encounters` | 진료 작업 시작 |
| GET | `/api/encounters/{id}` | 진료 작업 조회 |
| PUT | `/api/encounters/{id}/draft` | 전체 작업 상태 임시저장 |
| GET | `/api/drafts/latest` | 로그인 계정의 최신 임시저장 조회 |
| POST | `/api/encounters/{id}/approve` | 최종 승인 및 진료기록 생성 |
| POST | `/api/encounters/{id}/attachments` | 녹음/자율신경검사 파일 업로드 |
| GET | `/api/encounters/{id}/attachments` | 첨부파일 목록 |
| GET | `/api/attachments/{id}` | 첨부파일 다운로드 |

재진 진료를 `FOLLOW_UP`으로 생성하면 첫 단계가 `PREVIOUS_DATA`가 되어 환자 정보 캡처를 건너뜁니다. 초진은 `INITIAL`이며 `PATIENT_CAPTURE`에서 시작합니다.

임시저장 요청의 `version` 값을 다시 보내면 다른 기기에서 먼저 수정된 경우 HTTP `409 Conflict`를 반환해 덮어쓰기를 방지합니다. 임시저장을 다시 눌러도 상태창이 사라지는 방식이 아니라 같은 진료 작업이 갱신됩니다.

## H2 데이터베이스

기본 DB 파일:

```text
backend/data/mediflow.mv.db
```

개발용 H2 콘솔:

- URL: `http://localhost:8080/h2-console`
- JDBC URL: `jdbc:h2:file:./data/mediflow;DATABASE_TO_LOWER=TRUE;AUTO_SERVER=TRUE`
- User: `sa`
- Password: 없음

H2 콘솔은 로컬 접속만 허용됩니다. 비활성화하려면 `H2_CONSOLE_ENABLED=false`를 설정하세요. 별도 DB 사용자 역할은 두지 않았지만, 애플리케이션의 환자·진료 API는 반드시 카카오 로그인이 필요합니다.

## 테스트

```powershell
.\gradlew.bat test
```

통합 테스트는 다음을 확인합니다.

- 미로그인 환자 API 접근 차단
- 환자 등록번호 정확 일치 조회
- 재진 시작 시 이전 자료 단계 진입
- iPad 작업 상태를 포함한 임시저장 및 최신 작업 복구
- 최종 승인 후 진료기록 생성

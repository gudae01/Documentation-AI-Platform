# MEDIFLOW 파킨슨병 임상 문서 시스템

사전 문진 링크 전송, 환자 문진 검토, 입원 EMR 구조화와 결과 보고서 승인을 제공하는 React + Spring Boot 애플리케이션입니다. AI 생성 기능은 포함하지 않습니다.

## 제공 기능

- SMS·카카오·이메일 전송 웹훅을 통한 1회용 사전 문진 링크 발급
- 전체 모바일 문진, 암호화 자동 임시저장, 의료진 검색·검토
- 환자 사전 문진·기존 승인 기록·EMR 붙여넣기 원문을 출처별 검사 결과로 통합 표시
- 데스크톱 마이크 장치 확인과 브라우저 실시간 녹음파일 생성
- S/O, 식소대소수, P/I, 첩약·환재, 검사, 특이사항, 퇴원요약 구조화
- 동일 증상·척도와 동일 검사·단위의 명시값 비교
- 입원 첨부파일 암호화 저장, 환자용 결과지 검토·승인·PDF·인쇄
- H2 영속 저장, 민감정보 암호화, 역할 기반 접근, CSRF, 동시 로그인 제한, 감사로그

## 실행

프론트엔드:

```powershell
npm ci
$env:VITE_API_BASE_URL="http://localhost:8080"
npm run dev
```

백엔드:

```powershell
cd backend
$env:APP_DATA_ENCRYPTION_KEY="32자 이상 무작위 비밀값"
$env:KAKAO_REST_API_KEY="카카오 REST API 키"
$env:KAKAO_CLIENT_SECRET="카카오 Client Secret"
$env:CLINICIAN_KAKAO_IDS="허용할 카카오 회원번호"
$env:QUESTIONNAIRE_PUBLIC_URL="http://localhost:5173"
.\gradlew.bat bootRun
```

링크를 실제 전송하려면 `QUESTIONNAIRE_DELIVERY_WEBHOOK_URL`에 HTTPS 웹훅을 설정합니다. 설정이 없으면 시스템은 전송 성공으로 표시하지 않고 복사용 링크만 제공합니다.

## 같은 Wi-Fi의 태블릿에서 개발 화면 확인

PC의 사설 IP가 `192.168.30.33`인 예시는 다음과 같습니다.

```text
화면: http://192.168.30.33:5173/Documentation-AI-Platform/
백엔드: http://192.168.30.33:8080
카카오 Redirect URI: http://192.168.30.33:8080/login/oauth2/code/kakao
```

- Vite는 `0.0.0.0:5173`에서 실행하되 Windows 방화벽은 `Private` 프로필과 `LocalSubnet`에만 5173·8080을 허용합니다.
- Docker의 `BACKEND_BIND_ADDRESS=0.0.0.0`, `CORS_ALLOWED_ORIGINS`와 `QUESTIONNAIRE_PUBLIC_URL`을 현재 사설 IP에 맞춥니다.
- 개발용 HTTP에서는 `SESSION_COOKIE_SECURE=false`, `SESSION_COOKIE_SAME_SITE=lax`를 사용합니다. 공개 배포에서는 반드시 HTTPS와 `Secure` 쿠키로 되돌립니다.
- 마이크 API는 브라우저 보안상 데스크톱의 `http://localhost:5173/Documentation-AI-Platform/` 또는 HTTPS에서만 실행합니다. 태블릿의 LAN HTTP 주소는 조회·문진 테스트용입니다.
- 사설 IP가 바뀌면 `.env.production`과 카카오 Redirect URI를 새 IP로 함께 변경해야 합니다.

## 검증

```powershell
npm run build
npm exec tsc -- --noEmit
npm run lint
cd backend
.\gradlew.bat test
```

## GitHub Actions 배포

- `deploy-pages.yml`: React 프론트엔드를 GitHub Pages에 배포합니다.
- `publish-backend.yml`: Spring Boot 백엔드를 GHCR 컨테이너 이미지로 발행합니다.
- `ci.yml`: 프론트 타입·린트·빌드와 백엔드 테스트를 검증합니다.

저장소 변수 `VITE_API_BASE_URL`에는 외부에서 접근 가능한 HTTPS 백엔드 주소를 설정합니다. 카카오 키와 암호화 키는 Git에 저장하지 않으며, 백엔드 실행 서버의 Secret 저장소나 `compose.production.yml` 환경변수로 전달합니다. H2 데이터는 `/app/data` 영속 볼륨에 보관합니다.

상세 설정과 API는 [백엔드 문서](backend/README.md)를 확인하세요.

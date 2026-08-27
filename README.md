# MEDIFLOW 파킨슨병 임상 문서 시스템

사전 문진 링크 전송, 환자 문진 검토, 입원 EMR 구조화와 결과 보고서 승인을 제공하는 React + Spring Boot 애플리케이션입니다. AI 생성 기능은 포함하지 않습니다.

## 제공 기능

- SMS·카카오·이메일 전송 웹훅을 통한 1회용 사전 문진 링크 발급
- 전체 모바일 문진, 암호화 자동 임시저장, 의료진 검색·검토
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

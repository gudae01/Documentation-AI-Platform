# MEDIFLOW 파킨슨병 임상 문서 시스템

사전 문진 링크 전송, 환자 문진 검토, 자체 음성 전사, 입원 EMR 구조화와 결과 보고서 승인을 제공하는 React + Spring Boot 애플리케이션입니다. LLM 기반 SOAP 자동 생성은 포함하지 않습니다.

## 제공 기능

- 외부 OAuth 연동 없는 고정 의료진 계정 로그인 (기본 아이디 `root`, 비밀번호 `root`)
- SMS·카카오·이메일 전송 웹훅을 통한 1회용 사전 문진 링크 발급
- 회의·현장 접수용 고정 주소(`?questionnaire=write`)에서 직접 작성 후 제출 문진으로 자동 연결
- 로컬 PC 문진, 암호화 자동 임시저장, 의료진 검색·검토
- 환자 사전 문진·기존 승인 기록·EMR 붙여넣기 원문을 출처별 검사 결과로 통합 표시
- 데스크톱 마이크 장치 확인과 브라우저 실시간 녹음파일 생성
- 내부 Faster-Whisper STT와 sherpa-onnx 화자 분리를 통한 한국어 녹취·화자 A/B 자동 구분
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
# 별도 터미널에서 자체 STT 실행
docker build -t mediflow-stt:local stt-service
docker run --rm --name mediflow-stt-local -p 127.0.0.1:8090:8090 -v mediflow-stt-models:/models mediflow-stt:local

# 백엔드 실행
cd backend
$env:APP_DATA_ENCRYPTION_KEY="32자 이상 무작위 비밀값"
$env:QUESTIONNAIRE_PUBLIC_URL="http://localhost:5173"
.\gradlew.bat bootRun
```

Whisper 모델은 첫 전사 때 한 번 내려받아 Docker 볼륨에 보관합니다. 화자 분리 ONNX 모델은 이미지 빌드 시 SHA-256을 확인하여 포함합니다. 이후 녹음 원본은 외부 AI API로 보내지 않고 로컬 STT 컨테이너 안의 임시 파일로만 처리합니다.

링크를 실제 전송하려면 `QUESTIONNAIRE_DELIVERY_WEBHOOK_URL`에 HTTPS 웹훅을 설정합니다. 설정이 없으면 시스템은 전송 성공으로 표시하지 않고 복사용 링크만 제공합니다.

## 로컬 PC 로그인

- 화면: `http://localhost:5173/`, 백엔드: `http://localhost:8080`
- 기본 아이디와 비밀번호는 모두 `root`입니다. 카카오 키·계정·Redirect URI 설정은 필요하지 않습니다.
- 서버에서 BCrypt 비밀번호 검증 후 보안 세션을 발급합니다. 로그인·로그아웃 및 변경 API에 CSRF 보호를 유지합니다.
- 필요하면 서버의 `LOCAL_LOGIN_USERNAME`, `LOCAL_LOGIN_PASSWORD` 환경변수로 계정을 변경할 수 있습니다. 비밀번호를 프론트엔드 환경변수에 넣지 마세요.
- Vite와 직접 실행하는 백엔드는 기본 `127.0.0.1`에 바인딩합니다. Compose는 컨테이너 내부에서만 `0.0.0.0`을 사용하고, 호스트 공개 주소는 `127.0.0.1`로 유지해야 합니다.
- 이 기본 계정은 로컬 전용입니다. 공개 도메인·리버스 프록시·터널에 연결하지 마세요. 이번 로그인 전환만으로 모든 외부 통신이 차단되거나 폐쇄형 전환이 완료된 것은 아닙니다.
- 폐쇄형 운용을 위해 STT 모델·실행 의존성을 사전 준비하고 외부 메시징 웹훅을 사용하지 않아야 합니다. 태블릿·LAN 공유는 운영 대상에서 제외합니다.

## 검증

```powershell
npm run build
npm exec tsc -- --noEmit
npm run lint
cd backend
.\gradlew.bat test
```

## 기존 GitHub Actions 배포 구성 — 참고

- `deploy-pages.yml`: React 프론트엔드를 GitHub Pages에 배포합니다.
- `publish-backend.yml`: Spring Boot 백엔드와 자체 STT를 각각 GHCR 컨테이너 이미지로 발행합니다.
- `ci.yml`: 프론트 타입·린트·빌드와 백엔드 테스트를 검증합니다.

이 워크플로는 기존 외부 배포 구성입니다. 기본 `root / root` 계정을 공개 서비스에 배포하지 마세요. 로컬 사용 시 `VITE_API_BASE_URL`은 로컬 백엔드 주소를 사용합니다. 데이터 암호화 키와 별도로 변경한 로그인 비밀번호는 Git에 저장하지 않으며, 서버 환경변수로 전달합니다. H2 데이터는 `/app/data` 영속 볼륨에 보관합니다.

상세 설정과 API는 [백엔드 문서](backend/README.md)를 확인하세요.

'use client';

import { useState } from 'react';

const navItems = ['홈', '환자', '진료 기록', '검사', '문서함'];

const transcriptFields = [
  {
    speaker: '의사 발화',
    role: 'doctor',
    description: '문진 질문, 진찰 소견, 의사가 언급한 평가와 처방·검사 계획',
  },
  {
    speaker: '환자 발화',
    role: 'patient',
    description: '주호소, 증상 양상과 기간, 과거력, 복약 여부, 생활습관 관련 답변',
  },
  {
    speaker: '화자 미확정',
    role: 'unknown',
    description: '화자 구분 신뢰도가 낮아 의사의 확인이 필요한 발화',
  },
];

const soapDefinitions = [
  {
    letter: 'S',
    label: 'Subjective',
    placeholder: '환자가 말한 주호소, 증상, 발생 시점, 기간, 악화·완화 요인, 과거력, 복약 정보를 입력합니다.',
  },
  {
    letter: 'O',
    label: 'Objective',
    placeholder: '실제 진찰 소견, 활력징후, 검사명, 검사 수치와 단위 등 객관적 정보를 입력합니다.',
  },
  {
    letter: 'A',
    label: 'Assessment',
    placeholder: '의사가 진료 중 직접 언급하거나 확정한 평가·진단만 입력합니다.',
  },
  {
    letter: 'P',
    label: 'Plan',
    placeholder: '의사가 직접 언급한 처방, 검사 계획, 생활 안내, 경과관찰 계획만 입력합니다.',
  },
];

const pipelineSteps = [
  ['파일 확인', '확장자 · MIME type · 실제 Codec · 파일 크기 · Hash'],
  ['Audio 표준화', '16kHz · Mono · PCM WAV 변환'],
  ['음성 구간 탐지', 'VAD · Chunking · Timestamp 정렬'],
  ['STT', '의료진과 환자의 발화를 텍스트로 변환'],
  ['화자 구분', 'DOCTOR · PATIENT · UNKNOWN 분류'],
  ['의료용어 보정', '병원 용어집 · 검사명 · 약품명 · 질환명 적용'],
  ['SOAP 생성', '검증된 Transcript 기반 구조화 초안 생성'],
];

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function EmptyTable({ columns, message }: { columns: string[]; message: string }) {
  return (
    <div className="data-table">
      <div className="table-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(110px, 1fr))` }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      <div className="table-empty">
        <i />
        <strong>표시할 데이터가 없습니다</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function HomeView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const summaryCards = [
    ['오늘 진료', '진료 예정·진행·완료 환자 수', '환자'],
    ['검토 대기', '의사 검토가 필요한 SOAP·문진·검사 설명', '진료 기록'],
    ['Audio 처리', '업로드·STT·화자 구분·의료용어 보정 상태', '진료 기록'],
    ['승인 문서', '최종 승인된 SOAP·환자 리포트·처방 설명서', '문서함'],
  ];
  const quickActions = [
    ['환자 선택', '환자이름 또는 환자등록번호로 진료 대상 선택', '환자'],
    ['실시간 진료 기록', 'Microphone 입력으로 Transcript 생성 시작', '진료 기록'],
    ['녹음파일 가져오기', 'M4A·MP3·WAV·AAC 파일을 SOAP 입력으로 사용', '진료 기록'],
    ['검사 데이터 불러오기', 'EMR·OCR·장비 데이터 구조화 및 Before/After 비교', '검사'],
  ];

  return (
    <section className="overview-page">
      <header className="page-heading hero-heading">
        <div><p className="eyebrow">CLINICAL DOCUMENTATION WORKSPACE</p><h1>진료 문서화 업무</h1><span>진료 데이터 입력부터 AI 초안, 의사 검토와 최종 승인까지 한곳에서 관리합니다.</span></div>
        <div className="local-architecture"><i>✓</i><p><strong>Local First</strong><span>AI 처리 · 데이터 저장 · RAG 검색을 병원 내부에서 수행</span></p></div>
      </header>

      <div className="summary-grid">
        {summaryCards.map(([title, description, target], index) => (
          <button className="summary-card" key={title} onClick={() => onNavigate(target)}>
            <span className={`summary-icon tone-${index}`} aria-hidden="true" />
            <div><strong>{title}</strong><p>{description}</p></div>
            <b>연동 후 표시</b>
          </button>
        ))}
      </div>

      <div className="home-grid">
        <section className="workspace-card quick-card">
          <header><div><p className="eyebrow">QUICK START</p><h2>업무 시작</h2></div></header>
          <div className="quick-actions">
            {quickActions.map(([title, description, target], index) => (
              <button key={title} onClick={() => onNavigate(target)}>
                <i>{index + 1}</i><span><strong>{title}</strong><small>{description}</small></span><b>→</b>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace-card workflow-card">
          <header><div><p className="eyebrow">REVIEW WORKFLOW</p><h2>문서 승인 흐름</h2></div></header>
          <ol>
            {[
              ['AI_GENERATED', 'Transcript·문진·검사 데이터 기반 초안'],
              ['DOCTOR_REVIEWING', '원본과 AI 출력 비교 및 검증'],
              ['DOCTOR_MODIFIED', '의사가 직접 수정한 내용 저장'],
              ['DOCTOR_APPROVED', '담당의 확인 및 승인 기록'],
              ['FINALIZED', '최종 진료 문서·환자용 문서 확정'],
            ].map(([status, description], index) => (
              <li key={status}><i>{index + 1}</i><span><strong>{status}</strong><small>{description}</small></span></li>
            ))}
          </ol>
        </section>
      </div>

      <section className="workspace-card queue-card">
        <header><div><p className="eyebrow">ENCOUNTER QUEUE</p><h2>진료 업무 목록</h2></div><button onClick={() => onNavigate('환자')}>환자 찾기 →</button></header>
        <EmptyTable
          columns={['진료시간', '환자이름', '환자등록번호', '진료구분', '입력 데이터', '문서 상태']}
          message="EMR 또는 진료 일정 연동 후 환자별 진료 업무가 표시됩니다."
        />
      </section>
    </section>
  );
}

function PatientsView({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <section className="overview-page">
      <header className="page-heading">
        <div><p className="eyebrow">PATIENT DIRECTORY</p><h1>환자</h1><span>진료 대상 환자를 검색하고 문진·검사·진료 기록을 확인합니다.</span></div>
        <button className="page-primary" onClick={() => onNavigate('진료 기록')}>환자 선택 후 진료 시작 →</button>
      </header>
      <section className="workspace-card directory-card">
        <div className="directory-tools">
          <label><i /><input placeholder="환자이름 또는 환자등록번호 검색" aria-label="환자 검색" /></label>
          <button>최근 내원순</button><button>담당 진료과</button>
        </div>
        <EmptyTable
          columns={['환자이름', '환자등록번호', '성별 · 나이', '생년월일', '최근 내원일', '주호소', '진료 상태']}
          message="Patient 및 Encounter 데이터 연동 후 환자 목록이 표시됩니다."
        />
      </section>
      <div className="field-guide">
        <strong>환자 화면에 표시되는 데이터</strong>
        <span>기본정보</span><p>환자이름 · 환자등록번호 · 성별 · 생년월일 · 연락처</p>
        <span>진료정보</span><p>초진일 · 최근 내원일 · 담당의 · 진료과 · 주호소</p>
        <span>안전정보</span><p>알레르기 · 복용약 · 중요 주의사항 · 개인정보 동의 상태</p>
      </div>
    </section>
  );
}

function ExamsView() {
  const examTypes = [
    ['자율신경검사', 'HRV · LF · HF · LF/HF · Before/After 값'],
    ['검사 결과', '검사명 · 결과값 · 단위 · Reference Range · 판정'],
    ['EMR 차트 캡처', '화면 캡처 · OCR 원문 · 구조화 JSON · 검증 상태'],
  ];
  return (
    <section className="overview-page">
      <header className="page-heading">
        <div><p className="eyebrow">EXAMINATION DATA</p><h1>검사</h1><span>검사값은 Analysis Engine이 계산하고 Rule Engine이 병원 기준을 적용합니다.</span></div>
        <button className="page-primary">검사 데이터 가져오기</button>
      </header>
      <div className="exam-type-grid">
        {examTypes.map(([title, fields], index) => (
          <section className="workspace-card exam-type" key={title}><i className={`tone-${index}`} /><div><strong>{title}</strong><p>{fields}</p></div><button>입력 구조 보기 →</button></section>
        ))}
      </div>
      <section className="workspace-card comparison-card">
        <header><div><p className="eyebrow">BEFORE / AFTER ANALYSIS</p><h2>자율신경검사 비교</h2></div><span>계산값은 LLM이 변경하지 않음</span></header>
        <EmptyTable
          columns={['검사 지표', 'Before 값', 'After 값', '변화량', '변화율', '방향', 'Rule Flag']}
          message="환자와 검사 회차를 선택하면 Analysis Engine의 계산 결과가 표시됩니다."
        />
      </section>
      <div className="field-guide">
        <strong>검사 데이터 처리 원칙</strong>
        <span>Structured Data</span><p>검사명 · 수치 · 단위 · 검사일시 · 장비 · 원본 참조</p>
        <span>Analysis Engine</span><p>Before/After 변화량 · 변화율 · 증가/감소 방향 계산</p>
        <span>Rule Engine</span><p>Reference Range · 병원 기준 · Warning · Manual Check Flag</p>
      </div>
    </section>
  );
}

function DocumentsView() {
  return (
    <section className="overview-page">
      <header className="page-heading">
        <div><p className="eyebrow">CLINICAL DOCUMENTS</p><h1>문서함</h1><span>AI 초안, 의사 수정본, 최종 승인 문서와 변경 이력을 관리합니다.</span></div>
        <button className="page-primary">문서 내보내기</button>
      </header>
      <div className="document-statuses">
        {['AI 생성', '의사 검토 중', '의사 수정', '최종 승인', '확정 문서'].map((status, index) => <button className={index === 0 ? 'active' : ''} key={status}>{status}<b>연동 후 표시</b></button>)}
      </div>
      <section className="workspace-card directory-card">
        <div className="directory-tools">
          <label><i /><input placeholder="환자이름 · 환자등록번호 · 문서내용 검색" aria-label="문서 검색" /></label>
          <button>문서 종류</button><button>검토 상태</button><button>작성 기간</button>
        </div>
        <EmptyTable
          columns={['문서 종류', '환자이름', '환자등록번호', '진료일', '검토 상태', '담당의', '최종 수정일']}
          message="SOAP, 문진 요약, 검사 설명, 환자 리포트, 처방 설명서가 상태별로 표시됩니다."
        />
      </section>
      <div className="field-guide">
        <strong>문서별 저장 데이터</strong>
        <span>AI 생성값</span><p>모델명 · 모델 버전 · Prompt 버전 · RAG Snapshot · 생성시간</p>
        <span>의사 수정값</span><p>수정 내용 · 수정자 · 수정시간 · 변경 전후 비교</p>
        <span>최종 승인값</span><p>승인 문서 · 승인자 · 승인시간 · 감사 로그 · Finalized 상태</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState('홈');
  const [recording, setRecording] = useState(false);
  const [captureMode, setCaptureMode] = useState<'live' | 'upload'>('live');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [soapValues, setSoapValues] = useState<Record<string, string>>({ S: '', O: '', A: '', P: '' });

  const fileExtension = selectedFile?.name.split('.').pop()?.toUpperCase() || 'AUDIO';

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark" aria-label="MediFlow 홈">M</div>
        <nav aria-label="주요 메뉴">
          {navItems.map((item, index) => (
            <button
              className={activeView === item ? 'nav-item active' : 'nav-item'}
              key={item}
              onClick={() => setActiveView(item)}
            >
              <span className={`nav-icon nav-icon-${index}`} aria-hidden="true" />
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <button className="nav-item nav-bottom">
          <span className="nav-icon nav-icon-settings" aria-hidden="true" />
          <span>설정</span>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="product-name">MEDIFLOW <span>Clinical AI</span></div>
            <div className="local-badge"><i /> 병원 내부망 · Local AI</div>
          </div>
          <label className="patient-search">
            <span aria-hidden="true" />
            <input aria-label="환자 검색" placeholder="환자이름 또는 환자등록번호 검색" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="privacy-note">
            <i>✓</i><span><strong>Local Processing</strong><small>환자 데이터 외부 전송 없음</small></span>
          </div>
        </header>

        {activeView === '홈' && <HomeView onNavigate={setActiveView} />}
        {activeView === '환자' && <PatientsView onNavigate={setActiveView} />}
        {activeView === '검사' && <ExamsView />}
        {activeView === '문서함' && <DocumentsView />}
        {activeView === '진료 기록' && (
          <>
        <div className="patient-bar">
          <div className="patient-avatar">환자</div>
          <div className="patient-identity">
            <div><h1>환자이름</h1><span>성별 · 나이</span><span className="patient-id">환자등록번호</span></div>
            <p>생년월일 <i /> 초진일 <i /> 최근 내원일</p>
          </div>
          <div className="patient-tags">
            <span>주호소 <b>환자가 호소하는 주요 증상</b></span>
            <span>알레르기 <b>약물·음식 알레르기 정보</b></span>
          </div>
          <button className="ghost-button">환자 차트 열기 <b>↗</b></button>
        </div>

        <div className="encounter-head">
          <div>
            <p className="eyebrow">진료일 · 진료시간</p>
            <h2>진료 기록 <span className="visit-chip">초진 / 재진</span></h2>
          </div>
          <div className="workflow-state" aria-label="문서 처리 단계">
            <span className="current"><i>1</i>진료 데이터 입력</span><b />
            <span><i>2</i>AI 초안 생성</span><b />
            <span><i>3</i>의사 검토·승인</span>
          </div>
          <span className="data-state">데이터 입력 대기</span>
        </div>

        <div className="content-grid">
          <section className="panel transcript-panel">
            <header className="panel-title">
              <div><p className="eyebrow">AUDIO INPUT</p><h3>진료 음성 및 Transcript</h3></div>
              <div className="capture-switch" role="tablist" aria-label="오디오 입력 방식">
                <button className={captureMode === 'live' ? 'active' : ''} onClick={() => setCaptureMode('live')}>실시간 녹음</button>
                <button className={captureMode === 'upload' ? 'active' : ''} onClick={() => setCaptureMode('upload')}>파일 업로드</button>
              </div>
            </header>

            {captureMode === 'live' ? (
              <>
                <div className="record-console">
                  <div className="timer"><span>00</span><b>:</b><span>00</span><b>:</b><span>00</span></div>
                  <div className={recording ? 'wave active-wave' : 'wave'} aria-hidden="true">
                    {[18,34,22,48,29,56,31,40,21,51,37,26,45,20,33,49,25,38,17,30].map((height, index) => (
                      <i style={{ height: recording ? height : 4 }} key={index} />
                    ))}
                  </div>
                  <div className="record-controls">
                    <span className={recording ? 'record-status' : 'record-status ready'}><i /> {recording ? '녹음 중' : '녹음 대기'}</span>
                    <button className="stop-recording" onClick={() => setRecording(!recording)}><i /> {recording ? '중지' : '시작'}</button>
                  </div>
                </div>

                <div className="transcript-list schema-list">
                  <div className="empty-state-head"><strong>Transcript 표시 항목</strong><span>녹음을 시작하면 아래 구조로 발화가 표시됩니다.</span></div>
                  {transcriptFields.map((field) => (
                    <article className={`transcript-line ${field.role}`} key={field.speaker}>
                      <div className="speaker-avatar">{field.role === 'doctor' ? '의' : field.role === 'patient' ? '환' : '?'}</div>
                      <div>
                        <div className="speaker-meta"><strong>{field.speaker}</strong><time>시작시간 · 종료시간</time></div>
                        <p>{field.description}</p>
                      </div>
                      <span className="confidence-label">신뢰도</span>
                    </article>
                  ))}
                  <div className="transcript-fields"><span>화자</span><span>Timestamp</span><span>발화 내용</span><span>Confidence</span><span>검토 필요 여부</span></div>
                </div>
              </>
            ) : (
              <div className="upload-workspace">
                {!selectedFile ? (
                  <div className="dropzone">
                    <div className="upload-icon"><i /></div>
                    <h4>진료 녹음파일 가져오기</h4>
                    <p>iPhone 음성 메모 또는 Android 녹음파일을 선택합니다.</p>
                    <label className="file-picker">
                      <input
                        type="file"
                        accept=".m4a,.mp3,.wav,.aac,audio/*"
                        onChange={(event) => {
                          setSelectedFile(event.target.files?.[0] ?? null);
                          setShowPipeline(false);
                        }}
                      />
                      <span>파일 선택</span>
                    </label>
                    <small>입력 데이터: 원본 파일명 · 파일 형식 · 크기 · 재생시간 · Codec · Sample Rate · Hash</small>
                  </div>
                ) : (
                  <>
                    <div className="selected-file">
                      <div className="file-type">{fileExtension}</div>
                      <div><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} <i /> {selectedFile.type || 'MIME type 확인 필요'}</span></div>
                      <span className="secure-file">병원 내부 저장</span>
                      <button aria-label="파일 제거" onClick={() => { setSelectedFile(null); setShowPipeline(false); }}>×</button>
                    </div>
                    {!showPipeline ? (
                      <div className="analysis-ready">
                        <div><i>i</i><p><strong>분석 전 확인 데이터</strong><span>실제 Codec · 재생시간 · Sample Rate · SHA-256 · 악성 파일 여부</span></p></div>
                        <button onClick={() => setShowPipeline(true)}>분석 단계 확인 <span>→</span></button>
                      </div>
                    ) : (
                      <div className="pipeline-card pipeline-schema">
                        <div className="pipeline-heading"><div><strong>Audio 처리 Pipeline</strong><span>Backend 연결 후 각 단계의 상태와 진행률이 표시됩니다.</span></div><b>상태</b></div>
                        <ol>
                          {pipelineSteps.map(([step, data], index) => (
                            <li key={step}><i>{index + 1}</i><span><strong>{step}</strong><small>{data}</small></span><b>처리 예정</b></li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <footer className="transcript-footer">
              <span><i>✓</i> 의료용어 자동 보정</span>
              <span><i>✓</i> DOCTOR · PATIENT · UNKNOWN 구분</span>
              <button>+ 의사 메모 입력</button>
            </footer>
          </section>

          <aside className="panel soap-panel">
            <header className="panel-title soap-title">
              <div><p className="eyebrow">STRUCTURED OUTPUT</p><h3>SOAP 초안</h3></div>
              <span className="waiting-chip"><i /> 입력 대기</span>
            </header>
            <div className="grounding-note pending"><i>i</i><p><strong>Transcript 기반 생성</strong><span>입력에 존재하는 정보만 사용하며, 없는 정보는 생성하지 않습니다.</span></p></div>
            <div className="soap-sections">
              {soapDefinitions.map(({ letter, label, placeholder }) => (
                <label className="soap-field" key={letter}>
                  <span className={`soap-letter soap-${letter.toLowerCase()}`}>{letter}</span>
                  <span className="soap-label">{label}</span>
                  <textarea
                    value={soapValues[letter]}
                    onChange={(event) => setSoapValues({ ...soapValues, [letter]: event.target.value })}
                    aria-label={`${letter} 항목`}
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
            <div className="soap-actions">
              <button className="secondary-button" onClick={() => setReviewOpen(true)}>검토 구조 보기</button>
              <button className="primary-button muted-primary" disabled>Transcript 입력 필요 <span>→</span></button>
            </div>
            <p className="safety-copy"><i>i</i> AI 생성값, 의사 수정값, 최종 승인값은 각각 분리하여 저장됩니다.</p>
          </aside>
        </div>
          </>
        )}
      </section>

      {reviewOpen && (
        <div className="review-layer" role="dialog" aria-modal="true" aria-label="SOAP 검토 구조">
          <button className="layer-backdrop" aria-label="검토 화면 닫기" onClick={() => setReviewOpen(false)} />
          <section className="review-drawer">
            <header>
              <div><p className="eyebrow">DOCTOR REVIEW</p><h3>SOAP 검토 및 승인</h3></div>
              <button aria-label="닫기" onClick={() => setReviewOpen(false)}>×</button>
            </header>
            <div className="review-patient"><span>환자이름 · 환자등록번호</span><b>진료일 · 진료 구분</b><i>DOCTOR_REVIEWING</i></div>
            <div className="review-alert"><i>i</i><p><strong>의사가 원본과 수정본을 비교하는 영역입니다.</strong><span>Transcript의 숫자, 진단, 처방 및 검사계획과 대조합니다.</span></p></div>
            <div className="compare-legend"><span><i className="original" />AI 생성값</span><span><i className="revision" />의사 수정값</span></div>
            <div className="compare-list">
              {soapDefinitions.map(({ letter, label }) => (
                <article className="compare-section" key={letter}>
                  <div className={`soap-letter soap-${letter.toLowerCase()}`}>{letter}</div>
                  <div>
                    <strong>{label}</strong>
                    <div className="compare-grid">
                      <p>AI가 Transcript에서 생성한 {label} 원문</p>
                      <p>{soapValues[letter] || `의사가 확인·수정한 ${label} 내용`}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="validation-card pending-validation"><div><i>i</i><p><strong>Validation 확인 항목</strong><span>입력 근거 · 숫자 · 약품명 · 검사명 · 진단 발화 · SOAP Section</span></p></div><button>검증 결과 표시</button></div>
            <footer>
              <button className="secondary-button" onClick={() => setReviewOpen(false)}>수정 화면으로</button>
              <button className="approve-button" disabled>검토 데이터 입력 필요 <span>✓</span></button>
            </footer>
            <small className="audit-note">최종 승인 시 담당의, 승인시간, 수정 이력, 모델·프롬프트 버전을 감사 로그에 기록합니다.</small>
          </section>
        </div>
      )}
    </main>
  );
}

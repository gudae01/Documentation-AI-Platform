'use client';

import { useState } from 'react';

type StepId = 'patient' | 'emr' | 'audio' | 'data' | 'soap' | 'final';

const flowSteps: { id: StepId; label: string; description: string }[] = [
  { id: 'patient', label: '환자 선택', description: '진료 대상 확인' },
  { id: 'emr', label: 'EMR 캡처', description: '차트 데이터 수집' },
  { id: 'audio', label: '음성 기록', description: '실시간·파일 입력' },
  { id: 'data', label: '데이터 확인', description: '문진·검사·Transcript' },
  { id: 'soap', label: 'SOAP 검토', description: 'AI 초안·의사 수정' },
  { id: 'final', label: '최종 승인', description: '문서 확정' },
];

const soapDefinitions = [
  ['S', 'Subjective', '환자가 말한 주호소, 증상, 발생 시점, 기간, 악화·완화 요인, 과거력과 복약 정보'],
  ['O', 'Objective', '실제 진찰 소견, 활력징후, 검사명, 검사 수치와 단위 등 객관적 정보'],
  ['A', 'Assessment', '의사가 진료 중 직접 언급하거나 확정한 평가·진단'],
  ['P', 'Plan', '의사가 직접 언급한 처방, 검사 계획, 생활 안내와 경과관찰 계획'],
];

const transcriptFields = [
  ['의사 발화', '의', '문진 질문 · 진찰 소견 · 평가 · 처방 및 검사 계획'],
  ['환자 발화', '환', '주호소 · 증상 양상과 기간 · 과거력 · 복약 · 생활습관'],
  ['화자 미확정', '?', '화자 신뢰도가 낮아 의사 확인이 필요한 발화'],
];

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="agent-home">
      <div className="agent-hero">
        <div className="agent-copy">
          <p className="eyebrow">ONE PATIENT · ONE ENCOUNTER</p>
          <h1>한 명의 환자,<br />하나의 진료 흐름</h1>
          <p>환자를 선택하면 EMR 캡처부터 진료 음성, 데이터 확인, SOAP 검토와 최종 승인까지 끊김 없이 이어집니다.</p>
          <button className="hero-start" onClick={onStart}><i>＋</i><span><strong>진료 시작</strong><small>환자 선택부터 시작합니다</small></span><b>→</b></button>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <div className="orbit-center"><i>M</i><strong>Clinical<br />Agent</strong></div>
          {['환자', 'EMR', 'Audio', 'Data', 'SOAP', '승인'].map((label, index) => <span className={`orbit-item orbit-${index}`} key={label}>{label}</span>)}
        </div>
      </div>

      <div className="journey-board">
        <header><div><p className="eyebrow">ENCOUNTER JOURNEY</p><h2>진료가 진행되는 순서</h2></div><span>각 단계의 데이터는 다음 단계로 자동 전달</span></header>
        <div className="journey-steps">
          {flowSteps.map((step, index) => (
            <button key={step.id} onClick={onStart}>
              <i>{index + 1}</i>
              <span><strong>{step.label}</strong><small>{step.description}</small></span>
              {index < flowSteps.length - 1 && <b>→</b>}
            </button>
          ))}
        </div>
      </div>

      <div className="home-bottom-grid">
        <section className="agent-info-card">
          <i className="agent-info-icon local-icon">✓</i>
          <div><strong>모든 처리는 병원 내부에서</strong><p>Audio · Transcript · EMR · AI 생성물은 외부 서비스로 전송하지 않습니다.</p></div>
        </section>
        <section className="agent-info-card">
          <i className="agent-info-icon doctor-icon">D</i>
          <div><strong>AI는 정리하고, 의사가 판단</strong><p>AI 초안은 의사가 직접 수정하고 승인하기 전까지 Final Data가 아닙니다.</p></div>
        </section>
        <section className="active-encounter-card">
          <div><p className="eyebrow">ACTIVE ENCOUNTER</p><strong>진행 중인 진료 없음</strong><span>새 진료를 시작하면 환자와 현재 단계가 여기에 표시됩니다.</span></div>
          <button onClick={onStart}>진료 시작 →</button>
        </section>
      </div>
    </section>
  );
}

function PatientStep() {
  return (
    <div className="step-surface patient-step">
      <header className="step-heading"><div><p className="eyebrow">STEP 1 · PATIENT</p><h2>진료 환자 선택</h2><span>환자이름 또는 환자등록번호로 오늘 진료할 환자를 확인합니다.</span></div><span className="step-status">환자 선택 대기</span></header>
      <section className="patient-search-card">
        <label className="encounter-search"><i /><input placeholder="환자이름 또는 환자등록번호 검색" aria-label="환자 검색" /><kbd>Enter</kbd></label>
        <div className="recent-filter"><button className="active">오늘 진료</button><button>최근 내원</button><button>전체 환자</button></div>
      </section>
      <section className="patient-result-card">
        <div className="patient-result-head"><span>검색 결과</span><b>EMR 연결 후 표시</b></div>
        <div className="patient-result-empty"><i /><strong>환자를 검색해 주세요</strong><span>환자이름 · 환자등록번호 · 성별 · 나이 · 최근 내원일 · 주호소가 표시됩니다.</span></div>
      </section>
      <section className="selected-patient-schema">
        <header><strong>선택 후 진료 세션에 유지되는 환자 정보</strong><span>모든 다음 단계 상단에 고정 표시</span></header>
        <div><span>환자이름</span><span>성별 · 나이</span><span>환자등록번호</span><span>생년월일</span><span>주호소</span><span>알레르기</span><span>초진 / 재진</span><span>담당 진료과</span></div>
      </section>
    </div>
  );
}

function EmrStep({ captured, onCapture }: { captured: boolean; onCapture: () => void }) {
  const extractedGroups = [
    ['환자 기본정보', '환자이름 · 환자등록번호 · 성별 · 생년월일'],
    ['사전 문진', '주호소 · 증상 · 기간 · 과거력 · 복약 · 알레르기'],
    ['검사·차트', '검사명 · 결과값 · 단위 · 검사일 · Reference Range'],
    ['의사 기록', '과거 진단 · 처방 · 치료계획 · 경과 기록'],
  ];
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP 2 · EMR CAPTURE</p><h2>현재 EMR 화면 캡처</h2><span>진료에 필요한 환자·문진·검사·차트 정보를 구조화합니다.</span></div><span className={captured ? 'step-status complete' : 'step-status'}>{captured ? '캡처 구조 확인' : '캡처 대기'}</span></header>
      <div className="emr-layout">
        <section className="emr-capture-zone">
          <div className="capture-window">
            <div className="capture-window-bar"><i /><i /><i /><span>현재 EMR 화면</span></div>
            <div className="capture-placeholder"><i /><strong>EMR 캡처 영역</strong><span>Capture Agent가 현재 활성화된 EMR 화면을 가져옵니다.</span></div>
          </div>
          <div className="capture-actions"><div><i /><span><strong>Capture Agent 연결 상태</strong><small>Windows Host의 EMR 화면 접근 여부</small></span></div><button onClick={onCapture}>{captured ? '다시 캡처' : 'EMR 화면 캡처'}</button></div>
        </section>
        <section className="extract-panel">
          <header><div><p className="eyebrow">STRUCTURED DATA</p><h3>추출 데이터</h3></div><span>{captured ? '구조 확인' : '입력 대기'}</span></header>
          <div className="extract-groups">
            {extractedGroups.map(([title, fields], index) => <article key={title}><i>{index + 1}</i><div><strong>{title}</strong><p>{fields}</p></div><b>{captured ? '확인 필요' : '대기'}</b></article>)}
          </div>
          <div className="capture-policy"><i>i</i><span><strong>숫자와 단위는 별도 Validation</strong><small>OCR 결과를 그대로 확정하지 않고 Pattern · Unit · 범위를 검증합니다.</small></span></div>
        </section>
      </div>
    </div>
  );
}

function AudioStep() {
  const [captureMode, setCaptureMode] = useState<'live' | 'upload'>('live');
  const [recording, setRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileExtension = selectedFile?.name.split('.').pop()?.toUpperCase() || 'AUDIO';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP 3 · AUDIO</p><h2>진료 음성 기록</h2><span>실시간 Microphone 또는 스마트폰 녹음파일 중 하나를 선택합니다.</span></div><div className="capture-switch"><button className={captureMode === 'live' ? 'active' : ''} onClick={() => setCaptureMode('live')}>실시간 녹음</button><button className={captureMode === 'upload' ? 'active' : ''} onClick={() => setCaptureMode('upload')}>파일 업로드</button></div></header>
      <div className="audio-flow-layout">
        <section className="audio-input-panel">
          {captureMode === 'live' ? (
            <>
              <div className="live-recorder">
                <span className={recording ? 'record-orb active' : 'record-orb'}><i /></span>
                <div><p className="eyebrow">RECORDING TIME</p><strong>00 : 00 : 00</strong><small>{recording ? '진료 음성을 기록하고 있습니다' : '녹음 시작을 눌러 진료 기록을 시작하세요'}</small></div>
                <button onClick={() => setRecording(!recording)}>{recording ? '녹음 중지' : '녹음 시작'}</button>
              </div>
              <div className="audio-wave" aria-hidden="true">{[18,34,22,48,29,56,31,40,21,51,37,26,45,20,33,49,25,38,17,30,42,27,50,22].map((height, index) => <i style={{ height: recording ? height : 3 }} key={index} />)}</div>
            </>
          ) : !selectedFile ? (
            <div className="flow-dropzone"><i /><strong>진료 녹음파일 선택</strong><span>M4A · MP3 · WAV · AAC</span><label><input type="file" accept=".m4a,.mp3,.wav,.aac,audio/*" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /><b>파일 선택</b></label><small>원본은 병원 내부 저장소에만 저장됩니다.</small></div>
          ) : (
            <div className="flow-file-selected"><i>{fileExtension}</i><div><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} · {selectedFile.type || 'MIME type 확인 필요'}</span><small>재생시간 · Codec · Sample Rate · Hash는 분석 단계에서 확인</small></div><button onClick={() => setSelectedFile(null)}>×</button></div>
          )}
        </section>
        <section className="live-transcript-panel">
          <header><div><p className="eyebrow">LIVE TRANSCRIPT</p><h3>화자별 Transcript</h3></div><span>입력 대기</span></header>
          <div className="flow-transcript-list">
            {transcriptFields.map(([speaker, avatar, fields], index) => <article key={speaker}><i className={`speaker-${index}`}>{avatar}</i><div><strong>{speaker}<small>Timestamp · Confidence</small></strong><p>{fields}</p></div></article>)}
          </div>
          <footer><span>Medical Term Correction</span><span>Speaker Diarization</span><span>Low Confidence Review</span></footer>
        </section>
      </div>
    </div>
  );
}

function DataStep() {
  const sources = [
    ['사전 문진', 'Questionnaire', '주호소 · 증상 · 기간 · 과거력 · 복약 · 알레르기 · 생활습관'],
    ['EMR · 검사', 'Structured Data', '진찰 소견 · 검사명 · 수치 · 단위 · Reference Range · 과거 차트'],
    ['진료 음성', 'Transcript', '화자 · Timestamp · 발화 · Confidence · 검토 필요 구간'],
  ];
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP 4 · DATA REVIEW</p><h2>SOAP 생성 전 데이터 확인</h2><span>서로 다른 입력을 한 번 확인한 뒤, 검증된 정보만 AI에 전달합니다.</span></div><span className="step-status">검토 대기</span></header>
      <div className="source-review-grid">
        {sources.map(([title, type, fields], index) => <section key={title}><header><i>{index + 1}</i><div><strong>{title}</strong><span>{type}</span></div><b>입력 대기</b></header><p>{fields}</p><button>원본 데이터 확인 →</button></section>)}
      </div>
      <section className="preflight-card">
        <header><div><p className="eyebrow">PRE-GENERATION CHECK</p><h3>SOAP 생성 전 확인 항목</h3></div><span>Validation Layer</span></header>
        <div className="check-matrix">
          {['환자 정보 일치', '숫자와 단위 보존', '약품명 확인', '검사명 확인', '의사 진단 발화 확인', '처방·계획 발화 확인', 'Low Confidence 구간 검토', '입력되지 않은 정보 차단'].map((item) => <span key={item}><i />{item}<b>확인 예정</b></span>)}
        </div>
      </section>
    </div>
  );
}

function SoapStep({ values, onChange }: { values: Record<string, string>; onChange: (letter: string, value: string) => void }) {
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP 5 · DOCTOR REVIEW</p><h2>SOAP 초안 검토</h2><span>AI 생성값과 입력 근거를 확인하고 의사가 직접 수정합니다.</span></div><span className="step-status">AI 생성 전</span></header>
      <div className="soap-flow-layout">
        <section className="soap-editor-card">
          <header><div><p className="eyebrow">STRUCTURED SOAP</p><h3>의사 수정본</h3></div><span>직접 편집 가능</span></header>
          <div className="flow-soap-fields">
            {soapDefinitions.map(([letter, label, placeholder]) => <label key={letter}><i className={`soap-${letter.toLowerCase()}`}>{letter}</i><span><strong>{label}</strong><textarea value={values[letter]} onChange={(event) => onChange(letter, event.target.value)} placeholder={placeholder} /></span></label>)}
          </div>
        </section>
        <aside className="evidence-panel">
          <header><div><p className="eyebrow">GROUNDING</p><h3>입력 근거</h3></div><span>원본 연결</span></header>
          <div className="evidence-empty"><i /><strong>SOAP 문장을 선택하세요</strong><span>선택한 문장의 Transcript, 문진 또는 검사 원본이 여기에 표시됩니다.</span></div>
          <div className="evidence-rules"><strong>생성 제한 규칙</strong>{['입력에 없는 정보 생성 금지', '새로운 확정 진단 생성 금지', '의사가 말하지 않은 처방 금지', '숫자와 단위 변경 금지'].map((rule) => <span key={rule}><i>✓</i>{rule}</span>)}</div>
        </aside>
      </div>
    </div>
  );
}

function FinalStep({ approved, onApprove, onNew }: { approved: boolean; onApprove: () => void; onNew: () => void }) {
  const outputs = [
    ['진료기록', '최종 승인된 SOAP와 의사 수정 이력'],
    ['환자용 리포트', '확정된 진단·검사·치료계획의 쉬운 설명'],
    ['처방 설명서', '확정 처방의 목적·복용법·주의사항'],
  ];
  return (
    <div className="step-surface final-step">
      <header className="step-heading"><div><p className="eyebrow">STEP 6 · FINAL APPROVAL</p><h2>최종 확인 및 승인</h2><span>의사가 승인한 데이터만 Final Data와 환자용 문서에 사용합니다.</span></div><span className={approved ? 'step-status complete' : 'step-status'}>{approved ? 'FINALIZED' : '승인 대기'}</span></header>
      <div className="final-layout">
        <section className="approval-summary">
          <header><div><p className="eyebrow">APPROVAL SUMMARY</p><h3>승인 전 최종 확인</h3></div><i>{approved ? '✓' : '!'}</i></header>
          <div className="approval-checks">
            {['환자 기본정보', 'Transcript 검토 구간', 'SOAP Subjective', 'SOAP Objective', '의사가 확정한 Assessment', '의사가 확정한 Plan', '숫자·단위 Validation', '변경 이력 저장'].map((item) => <span key={item}><i>{approved ? '✓' : '○'}</i>{item}<b>{approved ? '확인' : '검토 필요'}</b></span>)}
          </div>
          <button className="final-approve" disabled={approved} onClick={onApprove}>{approved ? '최종 승인 완료' : '내용을 확인하고 최종 승인'} <b>✓</b></button>
          <small>승인자 · 승인시간 · 모델 버전 · Prompt 버전 · RAG Snapshot · Rule 버전이 Audit Log에 저장됩니다.</small>
        </section>
        <aside className="output-documents">
          <header><p className="eyebrow">FINAL OUTPUT</p><h3>승인 후 생성 문서</h3></header>
          {outputs.map(([title, description], index) => <article key={title}><i>{index + 1}</i><div><strong>{title}</strong><span>{description}</span></div><b>{approved ? '생성 가능' : '승인 후'}</b></article>)}
          {approved && <button onClick={onNew}>새 진료 시작 →</button>}
        </aside>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [emrCaptured, setEmrCaptured] = useState(false);
  const [approved, setApproved] = useState(false);
  const [soapValues, setSoapValues] = useState<Record<string, string>>({ S: '', O: '', A: '', P: '' });

  const currentIndex = activeStep ? flowSteps.findIndex((step) => step.id === activeStep) : -1;
  const goHome = () => setActiveStep(null);
  const startEncounter = () => { setApproved(false); setEmrCaptured(false); setSoapValues({ S: '', O: '', A: '', P: '' }); setActiveStep('patient'); };
  const goNext = () => { if (currentIndex < flowSteps.length - 1) setActiveStep(flowSteps[currentIndex + 1].id); };
  const goPrevious = () => { if (currentIndex > 0) setActiveStep(flowSteps[currentIndex - 1].id); else goHome(); };

  return (
    <main className="flow-app">
      <aside className="flow-rail">
        <button className="flow-brand" onClick={goHome} aria-label="홈">M</button>
        <button className={!activeStep ? 'flow-home-button active' : 'flow-home-button'} onClick={goHome}><i /><span>홈</span></button>
        <div className="flow-rail-line" />
        <nav aria-label="진료 진행 단계">
          {flowSteps.map((step, index) => (
            <button className={activeStep === step.id ? 'flow-step-nav active' : currentIndex > index ? 'flow-step-nav done' : 'flow-step-nav'} key={step.id} onClick={() => activeStep && setActiveStep(step.id)} disabled={!activeStep}>
              <i>{currentIndex > index ? '✓' : index + 1}</i><span>{step.label}</span>
            </button>
          ))}
        </nav>
        {activeStep && <button className="new-encounter" onClick={startEncounter}><i>＋</i><span>새 진료</span></button>}
      </aside>

      <section className="flow-workspace">
        <header className="flow-topbar">
          <div><div className="product-name">MEDIFLOW <span>Clinical AI Agent</span></div><div className="local-badge"><i /> 병원 내부망 · Local AI</div></div>
          {activeStep ? <div className="active-patient-mini"><i>환자</i><span><strong>환자이름</strong><small>성별 · 나이 · 환자등록번호</small></span><b>진료 진행 중</b></div> : <div className="topbar-idle"><i>✓</i><span>환자 데이터 외부 전송 없음</span></div>}
        </header>

        {!activeStep ? <HomeScreen onStart={startEncounter} /> : (
          <>
            <div className="encounter-patient-bar">
              <div className="encounter-patient-avatar">환자</div>
              <div><strong>환자이름</strong><span>성별 · 나이</span><small>환자등록번호</small></div>
              <dl><div><dt>주호소</dt><dd>환자가 호소하는 주요 증상</dd></div><div><dt>알레르기</dt><dd>약물·음식 알레르기 정보</dd></div><div><dt>진료구분</dt><dd>초진 / 재진</dd></div></dl>
              <button onClick={() => setActiveStep('patient')}>환자정보 확인</button>
            </div>

            <div className="flow-progress">
              {flowSteps.map((step, index) => <button className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step.id} onClick={() => setActiveStep(step.id)}><i>{index < currentIndex ? '✓' : index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span>{index < flowSteps.length - 1 && <b />}</button>)}
            </div>

            <div className="flow-content">
              {activeStep === 'patient' && <PatientStep />}
              {activeStep === 'emr' && <EmrStep captured={emrCaptured} onCapture={() => setEmrCaptured(true)} />}
              {activeStep === 'audio' && <AudioStep />}
              {activeStep === 'data' && <DataStep />}
              {activeStep === 'soap' && <SoapStep values={soapValues} onChange={(letter, value) => setSoapValues({ ...soapValues, [letter]: value })} />}
              {activeStep === 'final' && <FinalStep approved={approved} onApprove={() => setApproved(true)} onNew={startEncounter} />}
            </div>

            <footer className="flow-footer-actions">
              <button className="flow-previous" onClick={goPrevious}>← 이전 단계</button>
              <div><span>{currentIndex + 1} / {flowSteps.length}</span><strong>{flowSteps[currentIndex].label}</strong></div>
              {activeStep !== 'final' && <button className="flow-next" onClick={goNext}>{flowSteps[currentIndex + 1].label}로 <b>→</b></button>}
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

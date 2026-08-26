'use client';

import { useState } from 'react';

type StepId = 'emr' | 'tests' | 'audio' | 'soap' | 'final';
type EncounterType = 'new' | 'followup';
type FlowStep = { id: StepId; label: string; description: string };
type PatientRecord = {
  id: string;
  name: string;
  gender: string;
  age: number;
  birthDate: string;
  lastVisit: string;
  visits: number;
  chiefComplaint: string;
  allergies: string;
  department: string;
  diagnoses: string[];
  soap: Record<'S' | 'O' | 'A' | 'P', string>;
  tests: [string, string, string][];
};

const firstVisitSteps: FlowStep[] = [
  { id: 'emr', label: '환자정보 캡처', description: 'EMR 기본정보 확인' },
  { id: 'audio', label: '진료 녹음', description: '문진 · 진찰 대화' },
  { id: 'tests', label: '검사자료 보완', description: '있는 자료만 추가' },
  { id: 'soap', label: '차트 작성', description: '녹음 기반 SOAP' },
  { id: 'final', label: '최종 승인', description: '문서 확정' },
];

const followupVisitSteps: FlowStep[] = [
  { id: 'emr', label: '환자정보 캡처', description: 'EMR 기본정보 확인' },
  { id: 'tests', label: '이전자료 확인', description: '차트 · 검사 이력' },
  { id: 'audio', label: '진료 녹음', description: '오늘 진료 내용' },
  { id: 'soap', label: '차트 작성', description: '비교 · SOAP 초안' },
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

const patientRecords: PatientRecord[] = [
  {
    id: 'P-2024-01842', name: '김민준', gender: '남', age: 47, birthDate: '1979.03.18', lastVisit: '2026.08.12', visits: 8,
    chiefComplaint: '만성 피로와 수면장애', allergies: '페니실린', department: '가정의학과', diagnoses: ['자율신경 기능 이상', '수면장애'],
    soap: {
      S: '최근 3개월간 쉽게 잠들지 못하고 아침 피로가 지속됨. 업무 스트레스가 심한 날 증상이 악화됨.',
      O: '혈압 128/82 mmHg. 자율신경검사 LF/HF 2.41, 스트레스 지수 높음.',
      A: '수면장애 및 스트레스 연관 자율신경 불균형 경과 관찰.',
      P: '수면위생 교육, 카페인 섭취 조절. 4주 후 자율신경검사 재평가.',
    },
    tests: [['2026.08.12', '자율신경검사', 'LF/HF 2.41 · 스트레스 지수 높음'], ['2026.05.02', '혈액검사', 'CBC · 갑상선 기능 정상 범위']],
  },
  {
    id: 'P-2025-00671', name: '이서연', gender: '여', age: 34, birthDate: '1992.11.07', lastVisit: '2026.08.05', visits: 4,
    chiefComplaint: '두통과 어지럼', allergies: '없음', department: '신경과', diagnoses: ['긴장형 두통'],
    soap: {
      S: '오후에 양측 관자놀이가 조이는 두통이 주 3회 발생. 구토나 시야 이상은 없음.',
      O: '신경학적 진찰 특이소견 없음. 혈압 116/74 mmHg.',
      A: '긴장형 두통 양상. 위험 징후는 현재 확인되지 않음.',
      P: '두통 일지 작성, 수분 섭취와 스트레칭 안내. 증상 악화 시 조기 내원.',
    },
    tests: [['2026.08.05', '신경학적 진찰', '국소 신경학적 결손 없음'], ['2026.04.19', '뇌 MRI', '특이 병변 없음']],
  },
  {
    id: 'P-2023-03109', name: '박지훈', gender: '남', age: 58, birthDate: '1968.01.22', lastVisit: '2026.07.29', visits: 12,
    chiefComplaint: '혈압 추적 관찰', allergies: '설파계 약물', department: '내과', diagnoses: ['고혈압', '이상지질혈증'],
    soap: {
      S: '복약은 규칙적으로 하고 있으며 흉통, 호흡곤란, 어지럼은 없음.',
      O: '혈압 134/86 mmHg. LDL-C 112 mg/dL.',
      A: '고혈압은 비교적 안정적이며 이상지질혈증은 생활습관 관리 지속 필요.',
      P: '현재 약 유지. 저염식과 유산소 운동 안내, 3개월 후 혈액검사.',
    },
    tests: [['2026.07.29', '지질검사', 'LDL-C 112 mg/dL'], ['2026.04.25', '신장기능검사', 'Cr 0.9 mg/dL · eGFR 정상']],
  },
  {
    id: 'P-2025-01426', name: '최유진', gender: '여', age: 42, birthDate: '1984.06.14', lastVisit: '2026.07.18', visits: 3,
    chiefComplaint: '소화불량과 복부 팽만', allergies: '없음', department: '소화기내과', diagnoses: ['기능성 소화불량'],
    soap: {
      S: '식후 더부룩함과 조기 포만감이 반복됨. 체중 감소나 흑색변은 없음.',
      O: '복부 진찰상 압통 없음. 상부위장관 내시경 특이소견 없음.',
      A: '기능성 소화불량에 합당한 양상.',
      P: '식사량 분할, 자극적 음식 제한. 6주 후 증상 변화 확인.',
    },
    tests: [['2026.07.18', '상부위장관 내시경', '특이소견 없음'], ['2026.06.30', '복부 초음파', '간담췌 특이소견 없음']],
  },
];

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function HomeScreen({ onStart, onOpenPatients }: { onStart: () => void; onOpenPatients: () => void }) {
  return (
    <section className="agent-home">
      <div className="agent-hero">
        <div className="agent-copy">
          <p className="eyebrow">ONE PATIENT · ONE ENCOUNTER</p>
          <h1>한 명의 환자,<br />하나의 진료 흐름</h1>
          <p>새 진료는 EMR 환자정보 캡처부터 바로 시작합니다. 기존 기록이 있는 환자는 별도 환자기록에서 과거 진료와 검사를 먼저 확인할 수 있습니다.</p>
          <div className="home-primary-actions">
            <button className="hero-start" onClick={onStart}><i>＋</i><span><strong>새 진료 시작</strong><small>환자정보 캡처부터 시작</small></span><b>→</b></button>
            <button className="patient-history-start" onClick={onOpenPatients}><i>기록</i><span><strong>기존 환자 기록</strong><small>과거 진료·검사 데이터 조회</small></span><b>→</b></button>
          </div>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <div className="orbit-center"><i>M</i><strong>Clinical<br />Agent</strong></div>
          {['캡처', 'EMR', 'Audio', 'Data', 'SOAP', '승인'].map((label, index) => <span className={`orbit-item orbit-${index}`} key={label}>{label}</span>)}
        </div>
      </div>

      <div className="journey-board">
        <header><div><p className="eyebrow">NEW ENCOUNTER JOURNEY</p><h2>환자정보 캡처부터 시작하는 진료 흐름</h2></div><span>기존 환자는 환자기록에서 선택해 재진 흐름으로 연결</span></header>
        <div className="journey-steps">
          {firstVisitSteps.map((step, index) => (
            <button key={step.id} onClick={onStart}>
              <i>{index + 1}</i>
              <span><strong>{step.label}</strong><small>{step.description}</small></span>
              {index < firstVisitSteps.length - 1 && <b>→</b>}
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
          <div><p className="eyebrow">PATIENT RECORDS</p><strong>기존 환자 기록을 한곳에서</strong><span>최근 진료, SOAP 차트와 검사 이력을 확인한 뒤 재진을 시작할 수 있습니다.</span></div>
          <button onClick={onOpenPatients}>환자기록 보기 →</button>
        </section>
      </div>
    </section>
  );
}

function PatientDirectory({ onStartEncounter }: { onStartEncounter: (patient: PatientRecord) => void }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(patientRecords[0].id);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPatients = patientRecords.filter((patient) => [patient.name, patient.id, patient.chiefComplaint, patient.department].some((value) => value.toLowerCase().includes(normalizedQuery)));
  const selectedPatient = patientRecords.find((patient) => patient.id === selectedId) ?? filteredPatients[0] ?? null;
  const printDate = new Intl.DateTimeFormat('ko-KR').format(new Date());
  const printPatientRecord = () => {
    if (!selectedPatient) return;
    const previousTitle = document.title;
    document.title = `${selectedPatient.name}_${selectedPatient.id}_진료기록`;
    document.body.classList.add('printing-patient-record');
    window.print();
    document.body.classList.remove('printing-patient-record');
    document.title = previousTitle;
  };

  return (
    <section className="patient-directory">
      <header className="directory-heading">
        <div><p className="eyebrow">PATIENT RECORDS</p><h1>기존 환자 기록</h1><span>기록이 있는 환자의 과거 진료와 검사 데이터를 확인하고 재진으로 연결합니다.</span></div>
        <b>총 {patientRecords.length}명 · 병원 내부 데이터</b>
      </header>
      <div className="patient-directory-layout">
        <aside className="patient-record-list">
          <label className="directory-search"><i /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="환자명 · 등록번호 · 주호소 검색" aria-label="기존 환자 기록 검색" /></label>
          <div className="record-list-meta"><strong>검색 결과 {filteredPatients.length}명</strong><span>최근 내원일 순</span></div>
          <div className="patient-record-items">
            {filteredPatients.map((patient) => (
              <button className={selectedPatient?.id === patient.id ? 'active' : ''} key={patient.id} onClick={() => setSelectedId(patient.id)}>
                <i>{patient.name.slice(-1)}</i>
                <span><strong>{patient.name}<small>{patient.gender} · {patient.age}세</small></strong><b>{patient.id}</b><em>{patient.chiefComplaint}</em></span>
                <time>{patient.lastVisit}</time>
              </button>
            ))}
            {!filteredPatients.length && <div className="record-empty"><strong>검색 결과가 없습니다</strong><span>환자명이나 등록번호를 다시 확인해 주세요.</span></div>}
          </div>
        </aside>
        {selectedPatient && (
          <article className="patient-record-detail">
            <div className="patient-record-print-title"><span>MEDIFLOW</span><strong>환자 진료기록</strong><small>Patient Clinical Record</small></div>
            <header className="record-detail-head">
              <div className="record-patient-avatar">{selectedPatient.name.slice(-1)}</div>
              <div><p><strong>{selectedPatient.name}</strong><span>{selectedPatient.gender} · {selectedPatient.age}세 · {selectedPatient.birthDate}</span></p><small>{selectedPatient.id} · {selectedPatient.department} · 총 {selectedPatient.visits}회 내원</small></div>
              <div className="record-detail-actions">
                <button className="record-pdf-button" onClick={printPatientRecord}>PDF 저장 / 인쇄</button>
                <button className="record-start-button" onClick={() => onStartEncounter(selectedPatient)}>이 환자로 재진 시작 <b>→</b></button>
              </div>
            </header>
            <dl className="record-summary-strip">
              <div><dt>최근 내원</dt><dd>{selectedPatient.lastVisit}</dd></div><div><dt>주호소</dt><dd>{selectedPatient.chiefComplaint}</dd></div><div><dt>알레르기</dt><dd>{selectedPatient.allergies}</dd></div><div><dt>진단 이력</dt><dd>{selectedPatient.diagnoses.join(' · ')}</dd></div>
            </dl>
            <div className="record-detail-grid">
              <section className="past-soap-card">
                <header><div><p className="eyebrow">LATEST SOAP</p><h2>최근 진료기록</h2></div><time>{selectedPatient.lastVisit}</time></header>
                <div>{(['S', 'O', 'A', 'P'] as const).map((letter) => <article key={letter}><i>{letter}</i><p>{selectedPatient.soap[letter]}</p></article>)}</div>
              </section>
              <section className="past-test-card">
                <header><div><p className="eyebrow">TEST HISTORY</p><h2>검사 이력</h2></div><b>{selectedPatient.tests.length}건</b></header>
                <div>{selectedPatient.tests.map(([date, name, result]) => <article key={`${date}-${name}`}><time>{date}</time><div><strong>{name}</strong><span>{result}</span></div><button aria-label={`${name} 상세 보기`}>›</button></article>)}</div>
                <footer><span>재진을 시작하면 이 자료가 이전자료 확인 단계에 연결됩니다.</span></footer>
              </section>
            </div>
            <footer className="patient-record-print-footer"><span>출력일 {printDate}</span><p>본 문서는 병원 내부에 저장된 환자 진료기록을 의료진 확인용으로 출력한 자료입니다.</p></footer>
          </article>
        )}
      </div>
    </section>
  );
}

function EmrStep({ stepNumber, encounterType, captured, patient, onCapture }: { stepNumber: number; encounterType: EncounterType; captured: boolean; patient: PatientRecord | null; onCapture: () => void }) {
  const patientFields = [
    ['환자이름', 'EMR 환자명', patient?.name],
    ['환자등록번호', '병원 내부 환자 ID', patient?.id],
    ['성별 · 생년월일', '성별과 생년월일', patient ? `${patient.gender} · ${patient.birthDate}` : undefined],
    ['연락처', '환자 연락처', undefined],
    ['초진일 · 최근 내원일', '진료 이력 기준일', patient?.lastVisit],
    ['알레르기', '약물·음식 알레르기', patient?.allergies],
  ];
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · PATIENT INFO CAPTURE</p><h2>EMR 환자정보 캡처</h2><span>모든 새 진료는 환자의 EMR 기본정보를 캡처하고 확인하는 단계부터 시작합니다.</span></div><span className={captured ? 'step-status complete' : 'step-status'}>{captured ? '환자정보 확인' : '캡처 대기'}</span></header>
      {patient && <div className="linked-patient-banner"><i>기록</i><span><strong>{patient.name} 환자의 기존 기록에서 재진을 시작했습니다</strong><small>최근 내원 {patient.lastVisit} · 과거 검사 {patient.tests.length}건이 다음 이전자료 확인 단계에 연결됩니다.</small></span><b>재진</b></div>}
      <div className="emr-layout">
        <section className="emr-capture-zone">
          <div className="capture-window">
            <div className="capture-window-bar"><i /><i /><i /><span>EMR 환자 기본정보 영역</span></div>
            <div className="capture-placeholder"><i /><strong>환자정보 영역만 캡처</strong><span>환자이름, 환자등록번호, 성별, 생년월일 등 기본정보 영역을 가져옵니다.</span></div>
          </div>
          <div className="capture-actions"><div><i /><span><strong>검사 차트는 캡처하지 않습니다</strong><small>{encounterType === 'followup' ? '기존 환자의 이전 차트와 검사자료는 다음 단계에 자동 연결됩니다.' : '초진은 환자정보 확인 후 진료 대화를 먼저 녹음합니다.'}</small></span></div><button onClick={onCapture}>{captured ? '환자정보 다시 캡처' : '환자정보 캡처'}</button></div>
        </section>
        <section className="extract-panel">
          <header><div><p className="eyebrow">PATIENT IDENTITY</p><h3>캡처 결과 확인</h3></div><span>{captured ? '직접 확인 필요' : '입력 대기'}</span></header>
          <div className="patient-field-grid">
            {patientFields.map(([label, description, value]) => <label key={`${label}-${captured}`}><span>{label}</span><input defaultValue={captured ? value : ''} placeholder={captured ? `${description} 확인·수정` : '캡처 후 표시'} /></label>)}
          </div>
          <div className="capture-policy patient-policy"><i>i</i><span><strong>캡처한 환자정보는 반드시 직접 확인</strong><small>잘못 인식된 환자이름이나 등록번호를 수정한 뒤 다음 단계로 이동합니다.</small></span></div>
        </section>
      </div>
    </div>
  );
}

function AudioStep({ stepNumber, encounterType }: { stepNumber: number; encounterType: EncounterType | null }) {
  const [captureMode, setCaptureMode] = useState<'live' | 'upload'>('live');
  const [recording, setRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileExtension = selectedFile?.name.split('.').pop()?.toUpperCase() || 'AUDIO';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · AUDIO</p><h2>진료 음성 기록</h2><span>{encounterType === 'new' ? '초진은 기존 진료차트가 없으므로 진료 대화를 먼저 녹음하고 그 내용을 차트의 근거로 사용합니다.' : '실시간 Microphone 또는 스마트폰 녹음파일로 오늘 진료 내용을 기록합니다.'}</span></div><div className="capture-switch"><button className={captureMode === 'live' ? 'active' : ''} onClick={() => setCaptureMode('live')}>실시간 녹음</button><button className={captureMode === 'upload' ? 'active' : ''} onClick={() => setCaptureMode('upload')}>파일 업로드</button></div></header>
      <div className="audio-to-chart-route"><span><i>1</i>진료 녹음</span><b>→</b><span><i>2</i>화자별 전사</span><b>→</b><span><i>3</i>의료용어 보정</span><b>→</b><span><i>4</i>SOAP 차트 초안</span></div>
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

function TestsStep({
  stepNumber,
  encounterType,
  chartText,
  organized,
  autonomicFile,
  hasPrevious,
  onChartTextChange,
  onOrganize,
  onAutonomicFileChange,
  onPreviousChange,
}: {
  stepNumber: number;
  encounterType: EncounterType | null;
  chartText: string;
  organized: boolean;
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  onChartTextChange: (value: string) => void;
  onOrganize: () => void;
  onAutonomicFileChange: (file: File | null) => void;
  onPreviousChange: (value: boolean | null) => void;
}) {
  const chartLines = chartText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const isFirstVisit = encounterType !== 'followup';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · EXAMINATION INPUT</p><h2>{isFirstVisit ? '검사자료 보완' : '이전 검사자료 확인'}</h2><span>{isFirstVisit ? '초진 녹음 후 실제로 시행한 검사가 있을 때만 결과를 추가합니다. 검사자료가 없으면 건너뛸 수 있습니다.' : '이전 검사 차트는 복사·붙여넣기하고 자율신경검사는 파일로 입력하여 오늘 진료와 비교합니다.'}</span></div><span className="step-status">{isFirstVisit ? '선택 입력' : '자료 입력 대기'}</span></header>

      <div className="test-input-grid">
        <section className="chart-paste-card">
          <header><div><p className="eyebrow">COPY & PASTE</p><h3>{isFirstVisit ? '진료 중·진료 후 시행한 검사 결과' : '환자 상태 관련 이전 검사 차트'}</h3></div><span>{isFirstVisit ? '자료가 있을 때만' : 'EMR에서 복사'}</span></header>
          <div className="chart-paste-body">
            <label><strong>{isFirstVisit ? '검사 결과가 있으면 원문 붙여넣기' : '검사 차트 원문 붙여넣기'}</strong><span>{isFirstVisit ? '이번 진료에서 확인된 검사명, 결과값, 단위와 판정 내용을 추가합니다.' : 'EMR 차트의 검사명, 결과값, 단위, 판정 내용을 그대로 붙여넣습니다.'}</span><textarea value={chartText} onChange={(event) => onChartTextChange(event.target.value)} placeholder={isFirstVisit ? '초진 검사 결과가 있을 때 이곳에 붙여넣으세요.\n검사가 없다면 입력하지 않고 다음 단계로 이동합니다.' : '이전 검사 차트 내용을 이곳에 붙여넣으세요.\n검사명 · 결과값 · 단위 · Reference Range · 판정 등이 포함됩니다.'} /></label>
            <div className="chart-input-actions"><small>{isFirstVisit ? '검사자료가 없어도 녹음 기반 진료차트는 작성할 수 있습니다.' : '입력한 숫자와 단위는 원문 그대로 보존합니다.'}</small><button disabled={!chartText.trim()} onClick={onOrganize}>보기 쉽게 정리하기 →</button></div>
          </div>
        </section>

        <section className="organized-chart-card">
          <header><div><p className="eyebrow">READABLE CHART</p><h3>정리된 검사 결과</h3></div><span>{organized ? '원문 기반 정리' : '입력 대기'}</span></header>
          {!organized ? (
            <div className="organized-empty"><i /><strong>{isFirstVisit ? '추가할 검사자료가 없다면 건너뛰세요' : '검사 차트를 붙여넣어 주세요'}</strong><span>{isFirstVisit ? '다음 단계에서 진료 녹음을 근거로 SOAP 차트 초안을 작성합니다.' : '검사 항목별 카드로 분리하여 의료진이 빠르게 읽을 수 있게 표시합니다.'}</span></div>
          ) : (
            <div className="organized-lines">
              <div className="organized-columns"><span>검사 항목</span><span>결과값 · 단위</span><span>기준범위 · 판정</span></div>
              {chartLines.map((line, index) => <article key={`${line}-${index}`}><i>{index + 1}</i><p>{line}</p><b>원문 확인</b></article>)}
              <footer><span>검사명</span><span>결과값</span><span>단위</span><span>Reference Range</span><span>판정</span><span>검사일</span></footer>
            </div>
          )}
        </section>
      </div>

      <section className="autonomic-card">
        <header><div><p className="eyebrow">AUTONOMIC NERVOUS SYSTEM TEST</p><h3>자율신경검사 파일</h3><span>검사 장비에서 생성된 파일을 업로드하여 확인합니다.</span></div><b>{autonomicFile ? '파일 선택됨' : '입력 대기'}</b></header>
        <div className="autonomic-body">
          <div className="autonomic-upload">
            {!autonomicFile ? <><i /><strong>자율신경검사 파일 선택</strong><span>지원 형식은 장비 Export 형식에 맞춰 연결합니다.</span><label><input type="file" onChange={(event) => onAutonomicFileChange(event.target.files?.[0] ?? null)} /><b>검사파일 선택</b></label></> : <div className="autonomic-file"><i>FILE</i><span><strong>{autonomicFile.name}</strong><small>{formatFileSize(autonomicFile.size)} · {autonomicFile.type || '파일 형식 확인 필요'}</small></span><button onClick={() => onAutonomicFileChange(null)}>×</button></div>}
          </div>
          <div className="previous-test-panel">
            <strong>이전 자율신경검사 데이터</strong>
            <span>환자의 이전 검사 존재 여부를 확인합니다.</span>
            <div className="previous-choice"><button className={hasPrevious === true ? 'active' : ''} onClick={() => onPreviousChange(true)}>이전 검사 있음</button><button className={hasPrevious === false ? 'active' : ''} onClick={() => onPreviousChange(false)}>이전 검사 없음</button></div>
            {hasPrevious === null && <p className="previous-placeholder">이전 검사 여부를 선택하면 결과 설명 방식이 표시됩니다.</p>}
            {hasPrevious === false && <div className="baseline-message"><i>1</i><p><strong>이전 검사 데이터가 없습니다</strong><span>이번 검사 결과를 환자의 기준 데이터로 저장하고 현재 상태를 설명합니다. 다음 검사부터 이전 결과와 비교하여 변화량과 변화 방향을 안내합니다.</span></p></div>}
            {hasPrevious === true && <div className="comparison-schema"><div><span>검사 지표</span><span>이전 검사</span><span>현재 검사</span><span>변화</span></div><p>HRV · LF · HF · LF/HF 등 지표별 Before / After 결과와 변화 설명이 표시됩니다.</p></div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function SoapStep({ stepNumber, values, onChange }: { stepNumber: number; values: Record<string, string>; onChange: (letter: string, value: string) => void }) {
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · DOCTOR REVIEW</p><h2>녹음 기반 진료차트 초안 검토</h2><span>진료 녹음 Transcript를 중심으로 검사자료를 보완하여 AI가 작성한 SOAP 차트를 의사가 직접 확인·수정합니다.</span></div><span className="step-status">차트 생성 대기</span></header>
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

function FinalStep({
  stepNumber,
  approved,
  patient,
  soapValues,
  chartText,
  autonomicFile,
  hasPrevious,
  onApprove,
  onNew,
}: {
  stepNumber: number;
  approved: boolean;
  patient: PatientRecord | null;
  soapValues: Record<string, string>;
  chartText: string;
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  onApprove: () => void;
  onNew: () => void;
}) {
  const outputs = [
    ['환자 종합 진료 리포트', '증상·검사·의사소견·치료계획을 한 문서로 통합'],
    ['진료기록', '최종 승인된 SOAP와 의사 수정 이력'],
    ['처방 설명서', '확정 처방의 목적·복용법·주의사항'],
  ];
  const chartLines = chartText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const reportText = (key: string, fallback: string) => soapValues[key]?.trim() || fallback;
  const autonomicSummary = autonomicFile
    ? hasPrevious === true
      ? '현재 검사와 이전 검사의 지표별 변화량·변화 방향·의료진 설명이 표시됩니다.'
      : hasPrevious === false
        ? '이전 검사 데이터가 없어 현재 검사 결과를 기준 데이터로 저장합니다. 다음 검사부터 변화 내용을 비교합니다.'
        : '검사파일 항목과 수치가 표시되며, 이전 검사 존재 여부 확인 후 비교 설명이 생성됩니다.'
    : '자율신경검사 파일을 입력하면 검사 항목, 현재 결과, 이전 결과 및 변화 설명이 표시됩니다.';
  const printReport = () => window.print();
  const showReport = () => document.getElementById('patient-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="step-surface final-step">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · FINAL APPROVAL</p><h2>최종 확인 및 승인</h2><span>의사가 승인한 데이터만 Final Data와 환자용 문서에 사용합니다.</span></div><span className={approved ? 'step-status complete' : 'step-status'}>{approved ? 'FINALIZED' : '승인 대기'}</span></header>
      <section className="patient-report-section" id="patient-report">
        <header>
          <div><p className="eyebrow">PATIENT REPORT PREVIEW</p><h3>환자 종합 진료 안내서</h3><span>진료 내용을 환자가 이해하기 쉬운 한 문서로 통합합니다.</span></div>
          <div className="report-actions"><b>{approved ? '의사 승인 완료' : '승인 전 미리보기'}</b><button disabled={!approved} onClick={printReport}>PDF 저장 / 인쇄</button></div>
        </header>
        <article className={approved ? 'patient-report-paper approved' : 'patient-report-paper'}>
          <div className="report-document-head">
            <div><span>병원명</span><strong>환자 종합 진료 안내서</strong><small>Clinical Visit Summary</small></div>
            <b>{approved ? '의사 승인본' : '미리보기 · 승인 전'}</b>
          </div>
          <dl className="report-patient-info">
            <div><dt>환자</dt><dd>{patient?.name ?? '캡처한 환자정보'}</dd></div><div><dt>환자등록번호</dt><dd>{patient?.id ?? '캡처 후 표시'}</dd></div><div><dt>진료일</dt><dd>오늘 진료일</dd></div><div><dt>담당의</dt><dd>담당의사</dd></div>
          </dl>
          <section className="report-overview">
            <span>오늘의 진료 요약</span>
            <h4>{reportText('A', '담당 의사가 확정한 평가와 진료 요약이 표시됩니다.')}</h4>
            <p>{reportText('P', '의사가 확정한 치료계획, 처방, 생활관리 및 추후 검사 계획을 환자가 이해하기 쉬운 문장으로 표시합니다.')}</p>
          </section>
          <div className="report-clinical-grid">
            <section><i>S</i><div><strong>주요 증상과 경과</strong><p>{reportText('S', '환자가 말한 주호소, 증상 양상, 발생 시점, 기간과 악화·완화 요인이 표시됩니다.')}</p></div></section>
            <section><i>O</i><div><strong>진찰 및 검사 결과</strong><p>{reportText('O', '의사가 확인한 진찰 소견과 객관적인 검사 결과가 표시됩니다.')}</p></div></section>
            <section><i>A</i><div><strong>담당 의사 소견</strong><p>{reportText('A', '담당 의사가 최종 확인한 평가와 진단만 표시됩니다.')}</p></div></section>
            <section><i>P</i><div><strong>치료·관리 계획</strong><p>{reportText('P', '담당 의사가 확정한 처방, 검사 계획, 생활 안내와 경과관찰 계획이 표시됩니다.')}</p></div></section>
          </div>
          <div className="report-result-grid">
            <section>
              <header><div><span>EXAMINATION</span><strong>검사 차트 요약</strong></div><b>{chartLines.length ? `${chartLines.length}개 항목` : '입력 대기'}</b></header>
              {chartLines.length ? <ul>{chartLines.slice(0, 5).map((line, index) => <li key={`${line}-${index}`}><i>{index + 1}</i><span>{line}</span></li>)}</ul> : <p>검사 차트를 입력하면 검사명, 결과값, 단위, 기준범위와 판정 내용이 원문에 근거하여 표시됩니다.</p>}
            </section>
            <section>
              <header><div><span>AUTONOMIC TEST</span><strong>자율신경검사 설명</strong></div><b>{autonomicFile ? '검사파일 연결' : '입력 대기'}</b></header>
              <p>{autonomicSummary}</p>
              {autonomicFile && <small>연결 파일 · {autonomicFile.name}</small>}
            </section>
          </div>
          <section className="report-prescription">
            <div><span>PRESCRIPTION GUIDE</span><strong>처방 및 복용 안내</strong></div>
            <p>의사가 최종 확정한 처방의 목적, 복용 방법, 주의사항과 환자가 알아야 할 내용이 표시됩니다.</p>
          </section>
          <footer className="report-document-footer">
            <p>본 문서는 담당 의료진이 확인·승인한 진료정보를 환자가 이해하기 쉽게 정리한 안내서입니다. 증상이 변하거나 문의사항이 있으면 담당 의료진에게 확인해 주세요.</p>
            <div><span>담당의 서명</span><b>{approved ? '전자 승인 완료' : '승인 후 표시'}</b></div>
          </footer>
        </article>
      </section>
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
          {outputs.map(([title, description], index) => <article key={title}><i>{index + 1}</i><div><strong>{title}</strong><span>{description}</span></div><b>{approved ? 'PDF 가능' : '승인 후'}</b></article>)}
          <button onClick={showReport}>종합 리포트 보기 ↑</button>
          {approved && <button onClick={onNew}>새 진료 시작 →</button>}
        </aside>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<'home' | 'patients' | 'encounter'>('home');
  const [activeStep, setActiveStep] = useState<StepId>('emr');
  const [encounterType, setEncounterType] = useState<EncounterType>('new');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [encounterStarted, setEncounterStarted] = useState(false);
  const [emrCaptured, setEmrCaptured] = useState(false);
  const [approved, setApproved] = useState(false);
  const [soapValues, setSoapValues] = useState<Record<string, string>>({ S: '', O: '', A: '', P: '' });
  const [chartText, setChartText] = useState('');
  const [chartOrganized, setChartOrganized] = useState(false);
  const [autonomicFile, setAutonomicFile] = useState<File | null>(null);
  const [hasPreviousAutonomic, setHasPreviousAutonomic] = useState<boolean | null>(null);

  const flowSteps = encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
  const encounterLabel = encounterType === 'new' ? '초진' : '재진';
  const currentIndex = flowSteps.findIndex((step) => step.id === activeStep);
  const goHome = () => setActiveView('home');
  const openPatientDirectory = () => setActiveView('patients');
  const startEncounter = (patient: PatientRecord | null = null) => { setSelectedPatient(patient); setEncounterType(patient ? 'followup' : 'new'); setApproved(false); setEmrCaptured(false); setSoapValues({ S: '', O: '', A: '', P: '' }); setChartText(''); setChartOrganized(false); setAutonomicFile(null); setHasPreviousAutonomic(null); setActiveStep('emr'); setEncounterStarted(true); setActiveView('encounter'); };
  const goNext = () => { if (currentIndex < flowSteps.length - 1) setActiveStep(flowSteps[currentIndex + 1].id); };
  const goPrevious = () => { if (currentIndex > 0) setActiveStep(flowSteps[currentIndex - 1].id); else goHome(); };
  const patientName = selectedPatient?.name ?? '새 환자';
  const patientMeta = selectedPatient ? `${selectedPatient.gender} · ${selectedPatient.age}세 · ${selectedPatient.id}` : 'EMR 환자정보 캡처 대기';

  return (
    <main className="flow-app">
      <aside className="flow-rail">
        <button className="flow-brand" onClick={goHome} aria-label="홈">M</button>
        <button className={activeView === 'home' ? 'flow-home-button active' : 'flow-home-button'} onClick={goHome}><i /><span>홈</span></button>
        <button className={activeView === 'patients' ? 'patient-records-button active' : 'patient-records-button'} onClick={openPatientDirectory}><i>기록</i><span>환자기록</span></button>
        <div className="flow-rail-line" />
        <nav aria-label="진료 진행 단계">
          {flowSteps.map((step, index) => (
            <button className={activeView === 'encounter' && activeStep === step.id ? 'flow-step-nav active' : encounterStarted && currentIndex > index ? 'flow-step-nav done' : 'flow-step-nav'} key={step.id} onClick={() => { setActiveStep(step.id); setActiveView('encounter'); }} disabled={!encounterStarted}>
              <i>{currentIndex > index ? '✓' : index + 1}</i><span>{step.label}</span>
            </button>
          ))}
        </nav>
        {encounterStarted && <button className="new-encounter" onClick={() => startEncounter()}><i>＋</i><span>새 진료</span></button>}
      </aside>

      <section className="flow-workspace">
        <header className="flow-topbar">
          <div><div className="product-name">MEDIFLOW <span>Clinical AI Agent</span></div><div className="local-badge"><i /> 병원 내부망 · Local AI</div></div>
          {activeView === 'encounter' ? <div className="active-patient-mini"><i>환자</i><span><strong>{patientName}</strong><small>{patientMeta}</small></span><b>{encounterLabel}</b></div> : <div className="topbar-idle"><i>✓</i><span>{activeView === 'patients' ? '기존 환자 기록 · 병원 내부 조회' : '환자 데이터 외부 전송 없음'}</span></div>}
        </header>

        {activeView === 'home' && <HomeScreen onStart={() => startEncounter()} onOpenPatients={openPatientDirectory} />}
        {activeView === 'patients' && <PatientDirectory onStartEncounter={startEncounter} />}
        {activeView === 'encounter' && (
          <>
            <div className="encounter-patient-bar">
              <div className="encounter-patient-avatar">환자</div>
              <div><strong>{patientName}</strong><span>{selectedPatient ? `${selectedPatient.gender} · ${selectedPatient.age}세` : '기본정보 캡처 전'}</span><small>{selectedPatient?.id ?? '등록번호 확인 대기'}</small></div>
              <dl><div><dt>주호소</dt><dd>{selectedPatient?.chiefComplaint ?? '캡처 후 확인'}</dd></div><div><dt>알레르기</dt><dd>{selectedPatient?.allergies ?? '캡처 후 확인'}</dd></div><div><dt>진료구분</dt><dd>{encounterLabel}</dd></div></dl>
              <button onClick={openPatientDirectory}>기존 환자 기록</button>
            </div>

            <div className="flow-progress">
              {flowSteps.map((step, index) => <button className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step.id} onClick={() => setActiveStep(step.id)}><i>{index < currentIndex ? '✓' : index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span>{index < flowSteps.length - 1 && <b />}</button>)}
            </div>

            <div className="flow-content">
              {activeStep === 'emr' && <EmrStep stepNumber={currentIndex + 1} encounterType={encounterType} captured={emrCaptured} patient={selectedPatient} onCapture={() => setEmrCaptured(true)} />}
              {activeStep === 'tests' && <TestsStep stepNumber={currentIndex + 1} encounterType={encounterType} chartText={chartText} organized={chartOrganized} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} onChartTextChange={(value) => { setChartText(value); setChartOrganized(false); }} onOrganize={() => setChartOrganized(true)} onAutonomicFileChange={(file) => { setAutonomicFile(file); setHasPreviousAutonomic(null); }} onPreviousChange={setHasPreviousAutonomic} />}
              {activeStep === 'audio' && <AudioStep stepNumber={currentIndex + 1} encounterType={encounterType} />}
              {activeStep === 'soap' && <SoapStep stepNumber={currentIndex + 1} values={soapValues} onChange={(letter, value) => setSoapValues({ ...soapValues, [letter]: value })} />}
              {activeStep === 'final' && <FinalStep stepNumber={currentIndex + 1} approved={approved} patient={selectedPatient} soapValues={soapValues} chartText={chartText} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} onApprove={() => setApproved(true)} onNew={() => startEncounter()} />}
            </div>

            <footer className="flow-footer-actions">
              <button className="flow-previous" onClick={goPrevious}>← 이전 단계</button>
              <div><span>{currentIndex + 1} / {flowSteps.length}</span><strong>{flowSteps[currentIndex].label}</strong></div>
              {activeStep !== 'final' && <button className="flow-next" onClick={goNext}>{`${flowSteps[currentIndex + 1].label}로`} <b>→</b></button>}
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

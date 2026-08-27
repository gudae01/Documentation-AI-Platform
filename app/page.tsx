'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TextareaHTMLAttributes } from 'react';
import './pd-portal.css';
import { pdApi, type AuthResponse, type Questionnaire } from './pd-api';
import { Admissions, Links, LoginGate, PublicQuestionnaire } from './pd-portal';

type StepId = 'emr' | 'tests' | 'audio' | 'soap' | 'final';
type EncounterType = 'new' | 'followup';
type FlowStep = { id: StepId; label: string; description: string };
type EncounterDraft = {
  version: 1;
  savedAt: string;
  savedDevice: string;
  patientId: string | null;
  patientName: string;
  encounterType: EncounterType;
  activeStep: StepId;
  emrCaptured: boolean;
  soapValues: Record<string, string>;
  chartText: string;
  hasPreviousAutonomic: boolean | null;
  autonomicValues: Record<string, string>;
  recordingStarted: boolean;
  recordingSeconds: number;
  audioFileName: string | null;
  autonomicFileName: string | null;
};
type AutonomicFileRecord = {
  id: string;
  date: string;
  fileName: string;
  fileType: string;
  summary: string;
  metrics: [string, string, string][];
  file?: File;
};
type PatientRecord = {
  questionnaireId: string;
  questionnaireVersion: number;
  questionnaireStatus: string;
  questionnaireChart: string;
  id: string;
  name: string;
  gender: string;
  age: number | null;
  birthDate: string;
  lastVisit: string;
  visits: number;
  chiefComplaint: string;
  allergies: string;
  department: string;
  diagnoses: string[];
  chart: {
    symptoms: string;
    assessment: string;
    plan: string;
  };
  clinicalDetails: { label: string; value: string }[];
  clinician: string;
  approvedAt: string;
  courseSummary: {
    title: string;
    status: '호전' | '유지' | '관찰 필요';
    summary: string;
    sources: string[];
  }[];
  previousRecords: {
    date: string;
    visitType: string;
    chiefComplaint: string;
    assessment: string;
    treatment: string;
    clinician: string;
  }[];
  soap: Record<'S' | 'O' | 'A' | 'P', string>;
  tests: [string, string, string][];
  autonomicFiles: AutonomicFileRecord[];
  autonomic: {
    date: string;
    current: [string, string, string][];
    comparison?: [string, string, string, string][];
    interpretation: string;
  };
};

const firstVisitSteps: FlowStep[] = [
  { id: 'emr', label: '환자정보 캡처', description: 'EMR 기본정보 확인' },
  { id: 'audio', label: '진료 녹음 입력', description: '실시간 · 녹음파일' },
  { id: 'tests', label: '검사자료 보완', description: '있는 자료만 추가' },
  { id: 'soap', label: '차트 작성', description: '녹음 기반 SOAP' },
  { id: 'final', label: '최종 승인', description: '문서 확정' },
];

const DRAFT_STORAGE_KEY = 'mediflow:encounter-draft:v1';

const followupVisitSteps: FlowStep[] = [
  { id: 'tests', label: '이전자료 확인', description: '차트 · 검사 이력' },
  { id: 'audio', label: '진료 녹음 입력', description: '실시간 · 녹음파일' },
  { id: 'soap', label: '차트 작성', description: '비교 · SOAP 초안' },
  { id: 'final', label: '최종 승인', description: '문서 확정' },
];

const soapDefinitions = [
  ['S', 'Subjective', '환자가 말한 주호소, 증상, 발생 시점, 기간, 악화·완화 요인, 과거력과 복약 정보'],
  ['O', 'Objective', '실제 진찰 소견, 활력징후, 검사명, 검사 수치와 단위 등 객관적 정보'],
  ['A', 'Assessment', '의사가 진료 중 직접 언급하거나 확정한 평가·진단'],
  ['P', 'Plan', '의사가 직접 언급한 처방, 검사 계획, 생활 안내와 경과관찰 계획'],
];

type QuestionnairePayload = Record<string, unknown>;

function readQuestionnairePayload(value: string): QuestionnairePayload {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as QuestionnairePayload : {};
  } catch {
    return {};
  }
}

function payloadText(payload: QuestionnairePayload, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : '';
}

function joinPayload(payload: QuestionnairePayload, keys: string[]) {
  return keys.map((key) => payloadText(payload, key)).filter(Boolean).join(' · ');
}

function dateLabel(value: string | null | undefined) {
  return value ? value.slice(0, 10).replaceAll('-', '.') : '-';
}

function questionnaireToPatientRecord(questionnaire: Questionnaire): PatientRecord {
  const payload = readQuestionnairePayload(questionnaire.rawJson);
  const patientExplanation = joinPayload(payload, ['chiefComplaint', 'symptomDetail']) || '환자 설명이 입력되지 않았습니다.';
  const allergies = joinPayload(payload, ['allergy', 'foodAllergy', 'otherAllergy']) || '미확인';
  const reviewed = questionnaire.status === 'REVIEWED';
  const clinicalDetails = [
    ['작성자', joinPayload(payload, ['respondent', 'relationship'])],
    ['파킨슨병 발병·진단', joinPayload(payload, ['pdOnset', 'pdDiagnosis', 'pdDiagnosisHospital', 'initialSymptoms', 'onsetSide'])],
    ['현재 상태', joinPayload(payload, ['currentStage', 'dbsHistory', 'rehabilitationHistory'])],
    ['투약·효과', joinPayload(payload, ['pdMedication', 'medicationTiming', 'medicationEffect', 'wearingOff', 'medicationSideEffects'])],
    ['환자 설명', joinPayload(payload, ['chiefComplaint', 'symptomDetail', 'symptomTiming', 'laterality', 'onOffRelation', 'aggravatingFactors', 'relievingFactors', 'painNrs', 'fallSafety'])],
    ['알레르기·복용약', joinPayload(payload, ['allergy', 'foodAllergy', 'otherAllergy', 'nonPdMedications'])],
    ['과거력·가족력', joinPayload(payload, ['pastHistory', 'familyHistory'])],
    ['생활·자율 증상', joinPayload(payload, ['diet', 'digestion', 'bowel', 'urine', 'sleep', 'bodyFacts', 'brainFacts'])],
  ].filter((detail) => detail[1]).map(([label, value]) => ({ label, value }));

  return {
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    questionnaireStatus: questionnaire.status,
    questionnaireChart: questionnaire.chart,
    id: questionnaire.patientId,
    name: questionnaire.name,
    gender: questionnaire.sex === 'M' ? '남' : questionnaire.sex === 'F' ? '여' : questionnaire.sex,
    age: null,
    birthDate: questionnaire.birth6.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3'),
    lastVisit: dateLabel(questionnaire.submittedAt),
    visits: 1,
    chiefComplaint: payloadText(payload, 'chiefComplaint') || '사전 문진 제출',
    allergies,
    department: '파킨슨병 클리닉',
    diagnoses: ['사전 문진'],
    chart: {
      symptoms: patientExplanation,
      assessment: '의료진 판단 기록 없음',
      plan: '치료·관리 계획 기록 없음',
    },
    clinicalDetails: [
      { label: '진료·입원 예정일', value: questionnaire.plannedDate },
      ...clinicalDetails,
    ],
    clinician: reviewed ? '검토 의료진' : '미검토',
    approvedAt: reviewed ? dateLabel(questionnaire.reviewedAt) : '미검토',
    courseSummary: [],
    previousRecords: [],
    soap: { S: patientExplanation, O: '', A: '', P: '' },
    tests: [],
    autonomicFiles: [],
    autonomic: { date: '', current: [], interpretation: '등록된 검사 기록이 없습니다.' },
  };
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatRecordingTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(' : ');
}

function formatPrintDate(date = new Date()) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

const PRINT_BODY_CLASSES = ['printing-patient-record', 'printing-patient-guide'];

function printDocument(bodyClass: string, title: string) {
  const previousTitle = document.title;
  const printMedia = window.matchMedia('print');
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    PRINT_BODY_CLASSES.forEach((className) => document.body.classList.remove(className));
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
    if (typeof printMedia.removeEventListener === 'function') printMedia.removeEventListener('change', handlePrintMediaChange);
    else printMedia.removeListener(handlePrintMediaChange);
    window.clearTimeout(cleanupTimer);
  };
  const handlePrintMediaChange = (event: MediaQueryListEvent) => {
    if (!event.matches) cleanup();
  };

  PRINT_BODY_CLASSES.forEach((className) => document.body.classList.remove(className));
  document.body.classList.add(bodyClass);
  document.title = title;
  window.addEventListener('afterprint', cleanup);
  if (typeof printMedia.addEventListener === 'function') printMedia.addEventListener('change', handlePrintMediaChange);
  else printMedia.addListener(handlePrintMediaChange);

  // iPadOS에서는 window.print()가 즉시 반환될 수 있어 afterprint까지 인쇄 상태를 유지합니다.
  const cleanupTimer = window.setTimeout(cleanup, 120_000);
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    try {
      if (typeof window.print !== 'function') {
        cleanup();
        return;
      }
      window.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  }));
}

function getCurrentDeviceLabel() {
  const isIPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIPad) return 'iPad';
  if (/Android|iPhone|Mobile/i.test(navigator.userAgent)) return '모바일';
  return '데스크탑';
}

function readEncounterDraft() {
  try {
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stored) return null;
    const draft = JSON.parse(stored) as Partial<EncounterDraft>;
    const validSteps: StepId[] = ['emr', 'tests', 'audio', 'soap', 'final'];
    if (draft.version !== 1 || !draft.savedAt || !draft.savedDevice || !draft.encounterType || !draft.activeStep || !validSteps.includes(draft.activeStep)) return null;
    return draft as EncounterDraft;
  } catch {
    return null;
  }
}

function formatDraftSavedAt(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return '저장 시간 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function getDraftStepLabel(draft: EncounterDraft) {
  const steps = draft.encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
  return steps.find((step) => step.id === draft.activeStep)?.label ?? '진료 단계';
}

function getAutonomicChangeTone(metric: string, previousText: string, currentText: string) {
  const numberFrom = (value: string) => Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  const previous = numberFrom(previousText);
  const current = numberFrom(currentText);
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === current) return 'neutral';
  if (metric === 'HRV') return current > previous ? 'improved' : 'worsened';
  if (metric === 'LF/HF') {
    const distanceFromReference = (value: number) => value < 0.5 ? 0.5 - value : value > 2 ? value - 2 : 0;
    const previousDistance = distanceFromReference(previous);
    const currentDistance = distanceFromReference(current);
    if (currentDistance === previousDistance) return 'neutral';
    return currentDistance < previousDistance ? 'improved' : 'worsened';
  }
  if (metric === '스트레스 지수') return current < previous ? 'improved' : 'worsened';
  return 'neutral';
}

function describeAutonomicChange(tone: string) {
  if (tone === 'improved') return '기준범위에 가까워진 변화';
  if (tone === 'worsened') return '기준범위에서 멀어진 변화';
  return '방향 판단이 필요한 변화';
}

type PatientGuideData = {
  approved: boolean;
  patientName: string;
  registrationNumber: string;
  visitDate: string;
  clinician: string;
  soapValues: Record<string, string>;
  autonomicSummary: string;
  autonomicFileName?: string;
};

function PatientGuideDocument({ approved, patientName, registrationNumber, visitDate, clinician, soapValues, autonomicSummary, autonomicFileName }: PatientGuideData) {
  const reportText = (key: string, fallback: string) => soapValues[key]?.trim() || fallback;
  return (
    <article className={approved ? 'patient-report-paper approved' : 'patient-report-paper'}>
      <div className="report-document-head">
        <div><span>병원명</span><strong>환자 종합 진료 안내서</strong><small>Clinical Visit Summary</small></div>
        <b>{approved ? '의사 승인본' : '미리보기 · 승인 전'}</b>
      </div>
      <dl className="report-patient-info">
        <div><dt>환자</dt><dd>{patientName}</dd></div><div><dt>환자등록번호</dt><dd>{registrationNumber}</dd></div><div><dt>진료일</dt><dd>{visitDate}</dd></div><div><dt>담당의</dt><dd>{clinician}</dd></div>
      </dl>
      <section className="report-overview">
        <span>오늘의 진료 요약</span>
        <h4>{reportText('A', '담당 의사가 확정한 평가와 진료 요약이 표시됩니다.')}</h4>
        <p>{reportText('P', '의사가 확정한 치료계획, 처방, 생활관리 및 검사 계획을 환자가 이해하기 쉬운 문장으로 표시합니다.')}</p>
      </section>
      <div className="report-clinical-grid">
        <section><i>S</i><div><strong>환자 설명</strong><p>{reportText('S', '환자가 직접 작성하거나 설명한 주호소, 증상 양상, 발생 시점, 기간과 악화·완화 요인이 표시됩니다.')}</p></div></section>
        <section><i>O</i><div><strong>진찰 및 검사 결과</strong><p>{reportText('O', '의사가 확인한 진찰 소견과 객관적인 검사 결과가 표시됩니다.')}</p></div></section>
        <section><i>A</i><div><strong>담당 의사 소견</strong><p>{reportText('A', '담당 의사가 최종 확인한 평가와 진단만 표시됩니다.')}</p></div></section>
        <section><i>P</i><div><strong>치료·관리 계획</strong><p>{reportText('P', '담당 의사가 확정한 처방, 검사 계획, 생활 안내와 경과관찰 계획이 표시됩니다.')}</p></div></section>
      </div>
      <div className="report-result-grid single">
        <section>
          <header><div><span>AUTONOMIC TEST</span><strong>자율신경검사 설명</strong></div><b>{autonomicFileName ? '검사파일 연결' : '입력 대기'}</b></header>
          <p>{autonomicSummary}</p>
          {autonomicFileName && <small>연결 파일 · {autonomicFileName}</small>}
        </section>
      </div>
      <section className="report-prescription">
        <div><span>PRESCRIPTION GUIDE</span><strong>처방 및 복용 안내</strong></div>
        <p>{reportText('P', '의사가 최종 확정한 처방의 목적, 복용 방법, 주의사항과 환자가 알아야 할 내용이 표시됩니다.')}</p>
      </section>
      <footer className="report-document-footer">
        <p>본 문서는 담당 의료진이 확인·승인한 진료정보를 환자가 이해하기 쉽게 정리한 안내서입니다. 증상이 변하거나 문의사항이 있으면 담당 의료진에게 확인해 주세요.</p>
        <div><span>담당의 서명</span><b>{approved ? `${clinician} · 전자 승인 완료` : '승인 후 표시'}</b></div>
      </footer>
    </article>
  );
}

function PatientGuideModal({ onClose, onPrint, ...guide }: PatientGuideData & { onClose: () => void; onPrint: () => void }) {
  return (
    <div className="report-modal-backdrop" onMouseDown={onClose}>
      <section className="report-modal" role="dialog" aria-modal="true" aria-label="환자 종합 진료 안내서 미리보기" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="eyebrow">PATIENT REPORT PREVIEW</p><h3>환자 종합 진료 안내서</h3><span>최종 승인 화면과 환자 기록에서 동일한 문서 양식을 사용합니다.</span></div>
          <div className="report-actions"><b>{guide.approved ? '의사 승인 완료' : '승인 전 미리보기'}</b><button disabled={!guide.approved} onClick={onPrint}>PDF 출력</button><button className="report-modal-close" onClick={onClose} aria-label="미리보기 닫기">×</button></div>
        </header>
        <div className="report-modal-scroll"><PatientGuideDocument {...guide} /></div>
      </section>
    </div>
  );
}

function AutoResizeTextarea({ value, onChange, style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    const resizeOnWindowChange = () => {
      const element = textareaRef.current;
      if (!element) return;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    window.addEventListener('resize', resizeOnWindowChange);
    return () => window.removeEventListener('resize', resizeOnWindowChange);
  }, []);

  return <textarea {...props} ref={textareaRef} rows={1} value={value} style={{ ...style, height: 'auto' }} onChange={(event) => {
    onChange?.(event);
    const element = event.currentTarget;
    requestAnimationFrame(() => { element.style.height = 'auto'; element.style.height = `${element.scrollHeight}px`; });
  }} />;
}

function organizeClinicalText(text: string) {
  const aliases: Record<string, string> = {
    '주소': '주호소', '주 증상': '주호소', '과거 병력': '과거력', '기왕력': '과거력',
    '복용 약': '복용약', '투약': '복용약', '처방약': '복용약', '의사소견': '의사 소견',
  };
  const sections: { title: string; lines: string[] }[] = [];
  let currentSection: { title: string; lines: string[] } | null = null;
  const getSection = (rawTitle: string) => {
    const cleanedTitle = rawTitle.trim();
    const title = aliases[cleanedTitle] ?? cleanedTitle;
    const existing = sections.find((section) => section.title === title);
    if (existing) return existing;
    const section = { title, lines: [] as string[] };
    sections.push(section);
    return section;
  };

  text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const headingOnly = line.match(/^([^:]{1,40}):\s*$/);
    if (headingOnly) {
      currentSection = getSection(headingOnly[1]);
      return;
    }
    const inlineField = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (inlineField) {
      currentSection = getSection(inlineField[1]);
      currentSection.lines.push(inlineField[2].replace(/^[-•]\s*/, ''));
      return;
    }
    if (!currentSection) {
      const inferredTitle = /mmHg|bpm|혈압|맥박|체온|혈당|Hb|WBC|Glucose/i.test(line)
        ? '검사 및 활력징후'
        : /mg|복용|투약|약물|처방/i.test(line) ? '복용약' : '기타 진료 정보';
      currentSection = getSection(inferredTitle);
    }
    currentSection.lines.push(line.replace(/^[-•]\s*/, ''));
  });

  return sections.filter((section) => section.lines.length > 0);
}

function HomeScreen({ onSendQuestionnaire, onOpenPatients, onOpenAdmissions }: {
  onSendQuestionnaire: () => void;
  onOpenPatients: () => void;
  onOpenAdmissions: () => void;
}) {
  const journey = [
    ['문진 링크', '1회용 보안 링크 전송'],
    ['환자 작성', '방문 전 사전 문진'],
    ['제출 확인', '기존 환자기록에서 검토'],
    ['의료진 검토', '환자 설명 원문 확인'],
    ['입원 기록', 'EMR 및 검사 연결'],
    ['결과 보고서', '검토·승인·PDF'],
  ];
  return (
    <section className="agent-home">
      <div className="agent-hero">
        <div className="agent-copy">
          <p className="eyebrow">ONE PATIENT · ONE ENCOUNTER</p>
          <h1>한 명의 환자,<br />하나의 진료 흐름</h1>
          <p>환자가 방문 전에 작성한 사전 문진을 시작점으로, 제출된 환자 기록과 입원 결과를 한 흐름에서 관리합니다.</p>
          <div className="home-primary-actions">
            <button className="hero-start" onClick={onSendQuestionnaire}><i>＋</i><span><strong>사전 문진 보내기</strong><small>1회용 보안 링크 생성</small></span><b>→</b></button>
            <button className="patient-history-start" onClick={onOpenPatients}><i>기록</i><span><strong>제출 문진 확인</strong><small>기존 환자 기록 화면에서 검토</small></span><b>→</b></button>
          </div>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <div className="orbit-center"><i>M</i><strong>Clinical<br />Agent</strong></div>
          {['링크', '작성', '제출', '검토', '입원', '결과'].map((label, index) => <span className={`orbit-item orbit-${index}`} key={label}>{label}</span>)}
        </div>
      </div>

      <div className="journey-board">
        <header><div><p className="eyebrow">CLINICAL DOCUMENT JOURNEY</p><h2>사전 문진부터 입원 결과까지</h2></div><span>새 진료 생성 없이 제출된 사전 문진에서 시작</span></header>
        <div className="journey-steps">
          {journey.map(([label, description], index) => (
            <button key={label} onClick={index < 2 ? onSendQuestionnaire : index < 4 ? onOpenPatients : onOpenAdmissions}>
              <i>{index + 1}</i>
              <span><strong>{label}</strong><small>{description}</small></span>
              {index < journey.length - 1 && <b>→</b>}
            </button>
          ))}
        </div>
      </div>

      <div className="home-bottom-grid">
        <section className="agent-info-card">
          <i className="agent-info-icon local-icon">✓</i>
          <div><strong>보안이 적용된 의료진 전용 화면</strong><p>로그인·권한 확인과 감사 로그를 적용하고 민감정보는 H2에 암호화하여 저장합니다.</p></div>
        </section>
        <section className="agent-info-card">
          <i className="agent-info-icon doctor-icon">D</i>
          <div><strong>환자 설명 원문 보존</strong><p>환자가 작성한 내용을 임의로 추론하거나 바꾸지 않고 의료진 검토 화면에 표시합니다.</p></div>
        </section>
        <section className="active-encounter-card">
          <div><p className="eyebrow">ADMISSION REPORT</p><strong>입원 결과를 한곳에서</strong><span>검토한 사전 문진과 입원 EMR을 연결해 결과 보고서를 관리합니다.</span></div>
          <button onClick={onOpenAdmissions}>입원 결과 보기 →</button>
        </section>
      </div>
    </section>
  );
}

function PatientDirectory({ records, loading, error, onReload, onReview, onStartEncounter, sessionAutonomicFiles }: {
  records: PatientRecord[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onReview: (id: string, chart: string, version: number) => Promise<void>;
  onStartEncounter: (patient: PatientRecord) => void;
  sessionAutonomicFiles: Record<string, AutonomicFileRecord[]>;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [reviewActionError, setReviewActionError] = useState('');
  const [showPatientGuide, setShowPatientGuide] = useState(false);
  const printAfterOpeningRef = useRef(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPatients = records.filter((patient) => [patient.name, patient.id, patient.chiefComplaint, patient.department].some((value) => value.toLowerCase().includes(normalizedQuery)));
  const selectedPatient = records.find((patient) => patient.questionnaireId === selectedId) ?? filteredPatients[0] ?? null;
  const availableAutonomicFiles = selectedPatient ? [...(sessionAutonomicFiles[selectedPatient.id] ?? []), ...selectedPatient.autonomicFiles].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const printDate = formatPrintDate();
  const printTitle = selectedPatient ? `${selectedPatient.name}_${selectedPatient.id}_종합진료안내서` : '환자_종합진료안내서';
  const openUploadedFile = (record: AutonomicFileRecord) => {
    if (!record.file) return;
    const fileUrl = URL.createObjectURL(record.file);
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
  };
  const printPatientRecord = () => {
    if (!selectedPatient || selectedPatient.questionnaireStatus !== 'REVIEWED') return;
    printAfterOpeningRef.current = true;
    setShowPatientGuide(true);
  };
  const printPatientGuide = () => printDocument('printing-patient-guide', printTitle);
  const closePatientGuide = () => {
    printAfterOpeningRef.current = false;
    setShowPatientGuide(false);
  };
  const confirmQuestionnaire = async () => {
    if (!selectedPatient || selectedPatient.questionnaireStatus === 'REVIEWED') return;
    setReviewingId(selectedPatient.questionnaireId);
    setReviewActionError('');
    try {
      await onReview(selectedPatient.questionnaireId, selectedPatient.questionnaireChart, selectedPatient.questionnaireVersion);
    } catch (reason) {
      setReviewActionError(reason instanceof Error ? reason.message : '문진 확인 상태를 저장하지 못했습니다.');
    } finally {
      setReviewingId('');
    }
  };

  useEffect(() => {
    if (!showPatientGuide || !selectedPatient || !printAfterOpeningRef.current) return;
    printAfterOpeningRef.current = false;
    const frame = window.requestAnimationFrame(() => printDocument('printing-patient-guide', printTitle));
    return () => window.cancelAnimationFrame(frame);
  }, [printTitle, selectedPatient, showPatientGuide]);

  return (
    <section className="patient-directory">
      <header className="directory-heading">
        <div><p className="eyebrow">PATIENT RECORDS</p><h1>제출 문진 및 환자 기록</h1><span>H2에 저장된 제출 문진을 기존 환자 기록 화면에서 확인하고 검토합니다.</span></div>
        <b>총 {records.length}건 · 병원 내부 데이터</b>
      </header>
      {error && <div className="record-load-message error"><strong>기록을 불러오지 못했습니다.</strong><span>{error}</span><button onClick={onReload}>다시 불러오기</button></div>}
      {loading && <div className="record-load-message"><strong>환자 기록을 불러오는 중입니다.</strong></div>}
      <div className="patient-directory-layout">
        <aside className="patient-record-list">
          <label className="directory-search"><i /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="환자명 · 등록번호 · 주호소 검색" aria-label="기존 환자 기록 검색" /></label>
          <div className="record-list-meta"><strong>검색 결과 {filteredPatients.length}명</strong><span>최근 내원일 순</span></div>
          <div className="patient-record-items">
            {filteredPatients.map((patient) => (
              <button className={selectedPatient?.questionnaireId === patient.questionnaireId ? 'active' : ''} key={patient.questionnaireId} onClick={() => setSelectedId(patient.questionnaireId)}>
                <i>{patient.name.slice(-1)}</i>
                <span><strong>{patient.name}<small>{patient.gender}{patient.age ? ` · ${patient.age}세` : ''}</small></strong><b>{patient.id}</b><em>{patient.chiefComplaint}</em></span>
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
              <div><p><strong>{selectedPatient.name}</strong><span>{selectedPatient.gender} · 생년월일 {selectedPatient.birthDate}</span></p><small>{selectedPatient.id} · {selectedPatient.department} · 제출 문진</small></div>
              <div className="record-detail-actions">
                <button className="record-start-encounter-button" onClick={() => onStartEncounter(selectedPatient)}>문진 기반 진료 시작 <b>→</b></button>
                <button className="record-confirm-button" onClick={confirmQuestionnaire} disabled={selectedPatient.questionnaireStatus === 'REVIEWED' || reviewingId === selectedPatient.questionnaireId}>{selectedPatient.questionnaireStatus === 'REVIEWED' ? '문진 확인 완료' : reviewingId === selectedPatient.questionnaireId ? '저장 중…' : '문진 확인 완료'}</button>
                <button className="record-pdf-button" onClick={printPatientRecord} disabled={selectedPatient.questionnaireStatus !== 'REVIEWED'}>{selectedPatient.questionnaireStatus === 'REVIEWED' ? 'PDF 출력' : '검토 후 PDF'}</button>
              </div>
            </header>
            {reviewActionError && <div className="record-action-error">{reviewActionError}</div>}
            <dl className="record-summary-strip">
              <div><dt>최근 내원</dt><dd>{selectedPatient.lastVisit}</dd></div><div><dt>주호소</dt><dd>{selectedPatient.chiefComplaint}</dd></div><div><dt>알레르기</dt><dd>{selectedPatient.allergies}</dd></div><div><dt>진단 이력</dt><dd>{selectedPatient.diagnoses.join(' · ')}</dd></div>
            </dl>
            <section className="record-chart-card">
              <header><div><p className="eyebrow">QUESTIONNAIRE SUMMARY</p><h2>제출 문진 요약</h2></div><span><b>제출</b><time>{selectedPatient.lastVisit}</time></span></header>
              <div className="chart-narrative-grid">
                <article><i>환자</i><div><strong>환자 설명</strong><p>{selectedPatient.chart.symptoms}</p></div></article>
                <article><i>판단</i><div><strong>의사의 판단</strong><p>{selectedPatient.chart.assessment}</p></div></article>
                <article><i>계획</i><div><strong>치료·관리 계획</strong><p>{selectedPatient.chart.plan}</p></div></article>
              </div>
            </section>
            <section className="record-detailed-card" id={`current-record-${selectedPatient.lastVisit.replace(/\./g, '-')}`}>
              <header>
                <div><p className="eyebrow">QUESTIONNAIRE DETAIL</p><h2>사전 문진 상세 기록</h2><span>환자가 제출한 항목을 원문 기준으로 표시합니다.</span></div>
                <b>{selectedPatient.questionnaireStatus === 'REVIEWED' ? '의료진 검토 완료' : '의료진 미검토'}</b>
              </header>
              <div className="clinical-detail-table">
                <div className="clinical-detail-table-head"><span>기록 항목</span><span>상세 내용</span></div>
                {selectedPatient.clinicalDetails.map((detail) => <div className="clinical-detail-row" key={detail.label}><strong>{detail.label}</strong><p>{detail.value}</p></div>)}
              </div>
              <footer><span>진료일시 <b>{selectedPatient.approvedAt}</b></span><span>작성·승인자 <b>{selectedPatient.clinician}</b></span></footer>
            </section>
            <div className="record-history-grid">
              <section className="course-summary-card">
                <header><div><p className="eyebrow">LONGITUDINAL SUMMARY</p><h2>과거 기록 기반 경과 요약</h2></div><b>{selectedPatient.previousRecords.length}개 기록 비교</b></header>
                <div className="course-summary-list">
                  {selectedPatient.courseSummary.map((item) => (
                    <article key={item.title}>
                      <div><strong>{item.title}</strong><b className={`course-status ${item.status === '호전' ? 'improved' : item.status === '관찰 필요' ? 'attention' : ''}`}>{item.status}</b></div>
                      <p>{item.summary}</p>
                      <footer><span>근거 기록</span>{item.sources.map((source) => <a key={source} href={`#${source === selectedPatient.lastVisit ? 'current-record' : 'previous-record'}-${source.replace(/\./g, '-')}`}>{source}</a>)}</footer>
                    </article>
                  ))}
                </div>
                <footer className="summary-disclosure"><i>i</i><span>과거 기록을 현재 진료와 합치지 않고, 변화만 별도로 요약했습니다.</span></footer>
              </section>
              <section className="previous-records-card">
                <header><div><p className="eyebrow">SOURCE RECORDS</p><h2>날짜별 이전 진료 원본</h2></div><span>눌러서 상세 확인</span></header>
                <div className="previous-record-list">
                  {selectedPatient.previousRecords.map((record) => (
                    <details key={record.date} open id={`previous-record-${record.date.replace(/\./g, '-')}`}>
                      <summary><span><time>{record.date}</time><b>{record.visitType}</b></span><strong>{record.chiefComplaint}</strong><em>원본 기록 보기</em></summary>
                      <dl>
                        <div><dt>주호소</dt><dd>{record.chiefComplaint}</dd></div>
                        <div><dt>평가·진단</dt><dd>{record.assessment}</dd></div>
                        <div><dt>치료·교육</dt><dd>{record.treatment}</dd></div>
                      </dl>
                      <footer><span>작성·승인자</span><b>{record.clinician}</b></footer>
                    </details>
                  ))}
                </div>
              </section>
            </div>
            <div className="record-detail-grid">
              <section className="past-soap-card">
                <header><div><p className="eyebrow">LATEST SOAP</p><h2>최근 SOAP 기록</h2></div><time>{selectedPatient.lastVisit}</time></header>
                <div>{(['S', 'O', 'A', 'P'] as const).map((letter) => <article key={letter}><i>{letter}</i><p>{selectedPatient.soap[letter]}</p></article>)}</div>
              </section>
              <section className="autonomic-record-card">
                <header><div><p className="eyebrow">AUTONOMIC TEST</p><h2>자율신경검사</h2></div><b>{selectedPatient.autonomic.comparison ? '이전 검사 비교' : '현재 검사만'}</b></header>
                <div className="autonomic-record-meta"><span>검사일</span><strong>{selectedPatient.autonomic.date}</strong></div>
                {selectedPatient.autonomic.comparison ? (
                  <div className="autonomic-comparison-table">
                    <header><span>지표</span><span>이전</span><span>현재</span><span>변화</span></header>
                    {selectedPatient.autonomic.comparison.map(([metric, previous, current, change]) => {
                      const tone = getAutonomicChangeTone(metric, previous, current);
                      return <div key={metric}><strong>{metric}</strong><span>{previous}</span><span>{current}</span><b className={`autonomic-change ${tone}`} title={describeAutonomicChange(tone)}>{change}</b></div>;
                    })}
                  </div>
                ) : (
                  <div className="autonomic-current-table">
                    <header><span>지표</span><span>현재 결과</span><span>상태</span></header>
                    {selectedPatient.autonomic.current.map(([metric, value, status]) => <div key={metric}><strong>{metric}</strong><span>{value}</span><b>{status}</b></div>)}
                  </div>
                )}
                {selectedPatient.autonomic.comparison && <div className="autonomic-change-legend"><span><i className="improved" />기준범위에 가까워짐</span><span><i className="worsened" />기준범위에서 멀어짐</span></div>}
                <div className="autonomic-interpretation"><strong>검사 해석</strong><p>{selectedPatient.autonomic.interpretation}</p></div>
              </section>
            </div>
            <section className="past-test-card autonomic-file-history">
              <header><div><p className="eyebrow">AUTONOMIC FILE HISTORY</p><h2>자율신경검사 이력</h2></div><b>업로드 파일 {availableAutonomicFiles.length}개</b></header>
              {availableAutonomicFiles.length ? <div>{availableAutonomicFiles.map((record) => (
                <details key={record.id} open>
                  <summary><time>{record.date}</time><div><strong>자율신경검사</strong><span>{record.summary}</span><small>{record.fileName}</small></div><i>⌄</i></summary>
                  <div className="autonomic-file-history-detail">
                    <div className="autonomic-file-history-meta"><span>업로드 파일</span><strong>{record.fileName}</strong><em>{record.fileType}{record.file ? ` · ${formatFileSize(record.file.size)}` : ''}</em></div>
                    <div className="autonomic-file-history-table"><header><span>지표</span><span>결과</span><span>판정</span></header>{record.metrics.map(([metric, value, status]) => <div key={metric}><strong>{metric}</strong><span>{value}</span><b>{status}</b></div>)}</div>
                    {record.file && <button onClick={() => openUploadedFile(record)}>원본 파일 열기</button>}
                  </div>
                </details>
              ))}</div> : <div className="autonomic-file-empty"><strong>업로드된 자율신경검사 파일이 없습니다</strong><span>진료 중 검사파일을 업로드하고 최종 승인하면 이곳에 표시됩니다.</span></div>}
              <footer><span>업로드된 자율신경검사 파일과 파일에서 정리한 결과만 표시됩니다.</span></footer>
            </section>
            <footer className="patient-record-print-footer"><span>출력일 {printDate}</span><p>본 문서는 병원 내부에 저장된 환자 진료기록을 의료진 확인용으로 출력한 자료입니다.</p></footer>
          </article>
        )}
      </div>
      {showPatientGuide && selectedPatient && <PatientGuideModal
        approved={selectedPatient.questionnaireStatus === 'REVIEWED'}
        patientName={selectedPatient.name}
        registrationNumber={selectedPatient.id}
        visitDate={selectedPatient.lastVisit}
        clinician={selectedPatient.clinician}
        soapValues={selectedPatient.soap}
        autonomicSummary={selectedPatient.autonomic.interpretation}
        autonomicFileName={availableAutonomicFiles[0]?.fileName}
        onClose={closePatientGuide}
        onPrint={printPatientGuide}
      />}
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
      {patient && <div className="linked-patient-banner"><i>기록</i><span><strong>{patient.name} 환자의 기존 기록에서 재진을 시작했습니다</strong><small>최근 내원 {patient.lastVisit} · 자율신경검사 파일 {patient.autonomicFiles.length}개가 이전자료 확인 단계에 연결됩니다.</small></span><b>재진</b></div>}
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

function AudioStep({ stepNumber, encounterType, selectedFile, recording, recordingStarted, recordingSeconds, onSelectedFileChange, onToggleRecording }: { stepNumber: number; encounterType: EncounterType; selectedFile: File | null; recording: boolean; recordingStarted: boolean; recordingSeconds: number; onSelectedFileChange: (file: File | null) => void; onToggleRecording: () => void }) {
  const fileExtension = selectedFile?.name.split('.').pop()?.toUpperCase() || 'AUDIO';
  const recordingStatus = recording ? '녹음 중' : recordingStarted ? '일시정지' : '대기';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · AUDIO INPUT</p><h2>진료 녹음 입력</h2><span>{encounterType === 'new' ? '실시간으로 진료를 녹음하거나, 진료 후 스마트폰·녹음기의 파일을 바로 추가할 수 있습니다.' : '오늘 진료의 실시간 녹음과 녹음파일을 기존 환자기록과 함께 차트 근거로 사용할 수 있습니다.'}</span></div></header>
      <div className="audio-to-chart-route"><span><i>1</i>진료 녹음·파일</span><b>→</b><span><i>2</i>환자 설명 확인</span><b>→</b><span><i>3</i>의료진 차트 작성</span><b>→</b><span><i>4</i>최종 검토·승인</span></div>
      <div className="audio-flow-layout">
        <section className="audio-input-panel live-audio-card">
          <header><div><p className="eyebrow">LIVE RECORDING</p><h3>실시간 녹음</h3></div><span>{recordingStatus}</span></header>
          <div className="live-recorder">
            <span className={recording ? 'record-orb active' : 'record-orb'}><i /></span>
            <div><p className="eyebrow">RECORDING TIME</p><strong>{formatRecordingTime(recordingSeconds)}</strong><small>{recording ? '진료 음성을 기록하고 있습니다' : recordingStarted ? '녹음이 일시정지되었습니다' : '녹음 시작을 눌러 진료 기록을 시작하세요'}</small></div>
            <button onClick={onToggleRecording}>{recording ? '녹음 중지' : recordingStarted ? '녹음 다시 시작' : '녹음 시작'}</button>
          </div>
          <div className="audio-wave" aria-hidden="true">{[18,34,22,48,29,56,31,40,21,51,37,26,45,20,33,49,25,38,17,30,42,27,50,22].map((height, index) => <i style={{ height: recording ? height : 3 }} key={index} />)}</div>
        </section>
        <section className="audio-input-panel upload-audio-card">
          <header><div><p className="eyebrow">AUDIO FILE</p><h3>녹음파일 업로드</h3></div><span>{selectedFile ? '파일 연결됨' : '선택 대기'}</span></header>
          {!selectedFile ? (
            <div className="flow-dropzone"><i /><strong>진료 후 녹음파일 넣기</strong><span>스마트폰·녹음기 파일 · M4A · MP3 · WAV · AAC</span><label><input type="file" accept=".m4a,.mp3,.wav,.aac,audio/*" onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)} /><b>녹음파일 선택</b></label><small>진료 중 차트를 작성하지 못한 경우에도 이 파일을 근거로 차트와 SOAP 초안을 만듭니다.</small></div>
          ) : (
            <div className="flow-file-selected"><i>{fileExtension}</i><div><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} · {selectedFile.type || 'MIME type 확인 필요'}</span><small>이 파일은 차트·SOAP 초안과 최종 승인 기록의 근거로 연결됩니다.</small></div><button onClick={() => onSelectedFileChange(null)}>×</button></div>
          )}
        </section>
      </div>
    </div>
  );
}

function TestsStep({
  stepNumber,
  encounterType,
  chartText,
  autonomicFile,
  hasPrevious,
  onChartTextChange,
  onAutonomicFileChange,
  onPreviousChange,
}: {
  stepNumber: number;
  encounterType: EncounterType | null;
  chartText: string;
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  onChartTextChange: (value: string) => void;
  onAutonomicFileChange: (file: File | null) => void;
  onPreviousChange: (value: boolean | null) => void;
}) {
  const organizedSections = organizeClinicalText(chartText);
  const organized = organizedSections.length > 0;
  const isFirstVisit = encounterType !== 'followup';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · EXAMINATION INPUT</p><h2>{isFirstVisit ? '검사자료 보완' : '이전 검사자료 확인'}</h2><span>{isFirstVisit ? '초진 녹음 후 실제로 시행한 검사가 있을 때만 결과를 추가합니다. 검사자료가 없으면 건너뛸 수 있습니다.' : '이전 검사 차트는 복사·붙여넣기하고 자율신경검사는 파일로 입력하여 오늘 진료와 비교합니다.'}</span></div><span className="step-status">{isFirstVisit ? '선택 입력' : '자료 입력 대기'}</span></header>

      <div className="test-input-grid">
        <section className="chart-paste-card">
          <header><div><p className="eyebrow">COPY & PASTE</p><h3>{isFirstVisit ? '진료 중·진료 후 시행한 검사 결과' : '환자 상태 관련 이전 검사 차트'}</h3></div><span>{isFirstVisit ? '자료가 있을 때만' : 'EMR에서 복사'}</span></header>
          <div className="chart-paste-body">
            <label><strong>{isFirstVisit ? '검사 결과가 있으면 원문 붙여넣기' : '검사 차트 원문 붙여넣기'}</strong><span>{isFirstVisit ? '이번 진료에서 확인된 검사명, 결과값, 단위와 판정 내용을 추가합니다.' : 'EMR 차트의 검사명, 결과값, 단위, 판정 내용을 그대로 붙여넣습니다.'}</span><AutoResizeTextarea value={chartText} onChange={(event) => onChartTextChange(event.target.value)} placeholder={isFirstVisit ? '초진 검사 결과가 있을 때 이곳에 붙여넣으세요.\n검사가 없다면 입력하지 않고 다음 단계로 이동합니다.' : '이전 검사 차트 내용을 이곳에 붙여넣으세요.\n검사명 · 결과값 · 단위 · Reference Range · 판정 등이 포함됩니다.'} /></label>
            <div className="chart-input-actions"><small>{isFirstVisit ? '검사자료가 없어도 녹음 기반 진료차트는 작성할 수 있습니다.' : '입력한 숫자와 단위는 원문 그대로 보존합니다.'}</small><span className={organized ? 'auto-organize-status complete' : 'auto-organize-status'}>{organized ? '자동 정리 완료 ✓' : '입력 시 자동 정리'}</span></div>
          </div>
        </section>

        <section className="organized-chart-card">
          <header><div><p className="eyebrow">READABLE CHART</p><h3>정리된 검사 결과</h3></div><span>{organized ? '원문 기반 정리' : '입력 대기'}</span></header>
          {!organized ? (
            <div className="organized-empty"><i /><strong>{isFirstVisit ? '추가할 검사자료가 없다면 건너뛰세요' : '검사 차트를 붙여넣어 주세요'}</strong><span>{isFirstVisit ? '다음 단계에서 진료 녹음을 근거로 SOAP 차트 초안을 작성합니다.' : '검사 항목별 카드로 분리하여 의료진이 빠르게 읽을 수 있게 표시합니다.'}</span></div>
          ) : (
            <div className="organized-text-result">
              <div className="organized-text-sections">
                {organizedSections.map((section, index) => (
                  <section key={`${section.title}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{section.title}</strong><p>{section.lines.map((line) => /[.!?。]$/.test(line) ? line : `${line}.`).join(' ') || '관련 내용이 입력되지 않았습니다.'}</p></div>
                  </section>
                ))}
              </div>
              <footer>원문에 없는 정보는 추가하지 않았으며, 최종 승인 화면에서 의사가 다시 수정할 수 있습니다.</footer>
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
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · DOCTOR REVIEW</p><h2>진료차트 작성·검토</h2><span>환자 문진과 진료 녹음, 검사자료를 참고하여 의료진이 SOAP 차트를 직접 작성·수정합니다.</span></div><span className="step-status">의료진 작성</span></header>
      <div className="soap-flow-layout">
        <section className="soap-editor-card">
          <header><div><p className="eyebrow">STRUCTURED SOAP</p><h3>의사 수정본</h3></div><span>직접 편집 가능</span></header>
          <div className="flow-soap-fields">
            {soapDefinitions.map(([letter, label, placeholder]) => <label key={letter}><i className={`soap-${letter.toLowerCase()}`}>{letter}</i><span><strong>{label}</strong><AutoResizeTextarea value={values[letter]} onChange={(event) => onChange(letter, event.target.value)} placeholder={placeholder} /></span></label>)}
          </div>
        </section>
        <aside className="evidence-panel">
          <header><div><p className="eyebrow">GROUNDING</p><h3>입력 근거</h3></div><span>원본 연결</span></header>
          <div className="evidence-empty"><i /><strong>SOAP 문장을 선택하세요</strong><span>선택한 문장의 녹음 구간, 문진 또는 검사 원본이 여기에 표시됩니다.</span></div>
          <div className="evidence-rules"><strong>기록 원칙</strong>{['입력에 없는 정보 임의 기재 금지', '의료진 확인 없는 확정 진단 기재 금지', '의사가 말하지 않은 처방 기재 금지', '숫자와 단위 임의 변경 금지'].map((rule) => <span key={rule}><i>✓</i>{rule}</span>)}</div>
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
  audioFile,
  autonomicFile,
  hasPrevious,
  autonomicValues,
  onSoapChange,
  onChartTextChange,
  onAutonomicChange,
  onApprove,
}: {
  stepNumber: number;
  approved: boolean;
  patient: PatientRecord | null;
  soapValues: Record<string, string>;
  chartText: string;
  audioFile: File | null;
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  autonomicValues: Record<string, string>;
  onSoapChange: (letter: string, value: string) => void;
  onChartTextChange: (value: string) => void;
  onAutonomicChange: (key: string, value: string) => void;
  onApprove: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const printAfterOpeningRef = useRef(false);
  const autonomicMetrics = [['HRV', 'hrv'], ['LF/HF', 'lfhf'], ['스트레스 지수', 'stress']];
  const finalChartRows = organizeClinicalText(chartText).map((section) => ({ label: section.title, value: section.lines.join('\n') }));
  const updateChartRow = (rowIndex: number, value: string) => {
    const updated = finalChartRows.map((row, index) => index === rowIndex ? { ...row, value } : row);
    onChartTextChange(updated.map((row) => `${row.label}:\n${row.value}`).join('\n\n'));
  };
  const autonomicSummary = autonomicFile
    ? hasPrevious === true
      ? '현재 검사와 이전 검사의 지표별 변화량·변화 방향·의료진 설명이 표시됩니다.'
      : hasPrevious === false
        ? '이전 검사 데이터가 없어 현재 검사 결과를 기준 데이터로 저장합니다. 다음 검사부터 변화 내용을 비교합니다.'
        : '검사파일 항목과 수치가 표시되며, 이전 검사 존재 여부 확인 후 비교 설명이 생성됩니다.'
    : '자율신경검사 파일을 입력하면 검사 항목, 현재 결과, 이전 결과 및 변화 설명이 표시됩니다.';
  const editableAutonomicSummary = autonomicValues.interpretation?.trim() || autonomicSummary;
  const reportDate = formatPrintDate();
  const reportTitle = `${patient?.name ?? '환자'}_${patient?.id ?? '진료'}_종합진료안내서`;
  const printReport = () => printDocument('printing-patient-guide', reportTitle);
  const showReport = () => {
    if (approved) printAfterOpeningRef.current = true;
    setShowPreview(true);
  };
  const closeReport = () => {
    printAfterOpeningRef.current = false;
    setShowPreview(false);
  };

  useEffect(() => {
    if (!approved || !showPreview || !printAfterOpeningRef.current) return;
    printAfterOpeningRef.current = false;
    const frame = window.requestAnimationFrame(() => printDocument('printing-patient-guide', reportTitle));
    return () => window.cancelAnimationFrame(frame);
  }, [approved, reportTitle, showPreview]);

  return (
    <div className="step-surface final-step">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · FINAL APPROVAL</p><h2>최종 확인 및 승인</h2><span>의사가 승인한 데이터만 Final Data와 환자용 문서에 사용합니다.</span></div><span className={approved ? 'step-status complete' : 'step-status'}>{approved ? 'FINALIZED' : '승인 대기'}</span></header>
      <section className="final-record-editor">
        <header className="final-record-editor-head">
          <div><p className="eyebrow">DOCTOR FINAL EDIT</p><h3>최종 진료기록</h3><span>기존 환자기록과 같은 구조에서 모든 내용을 직접 수정한 뒤 승인합니다.</span></div>
          <div className="final-record-editor-actions"><b>{approved ? '승인 완료 · 수정 잠금' : '의사 직접 수정 가능'}</b><button onClick={showReport}>{approved ? 'PDF 출력' : '환자 안내서 미리보기'}</button></div>
        </header>
        <div className={audioFile ? 'final-audio-source connected' : 'final-audio-source'}>
          <i>음성</i><span><strong>{audioFile ? '진료 녹음파일이 기록 근거로 연결되었습니다' : '연결된 진료 녹음파일 없음'}</strong><small>{audioFile ? `${audioFile.name} · ${formatFileSize(audioFile.size)}` : '진료 녹음 입력 단계에서 파일을 추가하면 차트와 SOAP의 근거로 연결됩니다.'}</small></span><b>{audioFile ? '원본 연결' : '선택 입력'}</b>
        </div>
        <section className="record-chart-card final-chart-editor">
          <header><div><p className="eyebrow">CLINICAL CHART</p><h2>진료 차트</h2></div><span>직접 편집</span></header>
          <div className="chart-narrative-grid">
            <article><i>환자</i><label><strong>환자 설명</strong><AutoResizeTextarea disabled={approved} value={soapValues.S} onChange={(event) => onSoapChange('S', event.target.value)} placeholder="환자의 주호소, 증상 양상, 기간과 악화·완화 요인을 입력하세요." /></label></article>
            <article><i>판단</i><label><strong>의사의 판단</strong><AutoResizeTextarea disabled={approved} value={soapValues.A} onChange={(event) => onSoapChange('A', event.target.value)} placeholder="진찰과 검사에 근거한 의사의 평가를 입력하세요." /></label></article>
            <article><i>계획</i><label><strong>치료·관리 계획</strong><AutoResizeTextarea disabled={approved} value={soapValues.P} onChange={(event) => onSoapChange('P', event.target.value)} placeholder="처방, 검사, 생활관리와 경과관찰 계획을 입력하세요." /></label></article>
          </div>
        </section>
        <div className="record-detail-grid final-review-grid">
          <section className="past-soap-card final-soap-editor">
            <header><div><p className="eyebrow">LATEST SOAP</p><h2>SOAP 기록</h2></div><b>직접 편집</b></header>
            <div>{soapDefinitions.map(([letter, label, placeholder]) => <article key={letter}><i>{letter}</i><label><strong>{label}</strong><AutoResizeTextarea disabled={approved} value={soapValues[letter]} onChange={(event) => onSoapChange(letter, event.target.value)} placeholder={placeholder} /></label></article>)}</div>
          </section>
          <section className="autonomic-record-card final-autonomic-editor">
            <header><div><p className="eyebrow">AUTONOMIC TEST</p><h2>자율신경검사</h2></div><b>{hasPrevious === true ? '이전 검사 비교' : '현재 검사만'}</b></header>
            <div className="autonomic-record-meta"><span>검사파일</span><strong>{autonomicFile?.name ?? '입력되지 않음'}</strong></div>
            {hasPrevious === true ? (
              <div className="autonomic-comparison-table final-autonomic-table">
                <header><span>지표</span><span>이전</span><span>현재</span><span>변화</span></header>
                {autonomicMetrics.map(([metric, key]) => <div key={key}><strong>{metric}</strong><input disabled={approved} value={autonomicValues[`${key}Previous`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Previous`, event.target.value)} placeholder="이전값" /><input disabled={approved} value={autonomicValues[`${key}Current`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Current`, event.target.value)} placeholder="현재값" /><input disabled={approved} value={autonomicValues[`${key}Change`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Change`, event.target.value)} placeholder="변화량" /></div>)}
              </div>
            ) : (
              <div className="autonomic-current-table final-autonomic-table">
                <header><span>지표</span><span>현재 결과</span><span>상태</span></header>
                {autonomicMetrics.map(([metric, key]) => <div key={key}><strong>{metric}</strong><input disabled={approved} value={autonomicValues[`${key}Current`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Current`, event.target.value)} placeholder="현재값" /><input disabled={approved} value={autonomicValues[`${key}Status`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Status`, event.target.value)} placeholder="정상·경계·높음" /></div>)}
              </div>
            )}
            <label className="final-autonomic-interpretation"><strong>검사 해석</strong><AutoResizeTextarea disabled={approved} value={autonomicValues.interpretation ?? ''} onChange={(event) => onAutonomicChange('interpretation', event.target.value)} placeholder={autonomicSummary} /></label>
          </section>
        </div>
        <section className="past-test-card final-test-editor">
          <header><div><p className="eyebrow">EXAMINATION</p><h2>정리된 검사 결과</h2></div><b>직접 편집</b></header>
          {finalChartRows.length ? (
            <div className="final-test-table-wrap">
              <table className="final-test-table">
                <thead><tr><th>항목</th><th>정리된 내용</th><th>상태</th></tr></thead>
                <tbody>{finalChartRows.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th><td><AutoResizeTextarea disabled={approved} value={row.value} onChange={(event) => updateChartRow(index, event.target.value)} aria-label={`${row.label} 내용 수정`} /></td><td><span>{approved ? '승인됨' : '수정 가능'}</span></td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="final-test-empty"><strong>정리된 검사 결과가 없습니다</strong><span>검사자료 보완 단계에서 내용을 입력하면 항목별 표로 표시됩니다.</span></div>}
        </section>
      </section>
      {showPreview && <PatientGuideModal
        approved={approved}
        patientName={patient?.name ?? '캡처한 환자정보'}
        registrationNumber={patient?.id ?? '캡처 후 표시'}
        visitDate={reportDate}
        clinician="담당의사"
        soapValues={soapValues}
        autonomicSummary={editableAutonomicSummary}
        autonomicFileName={autonomicFile?.name}
        onClose={closeReport}
        onPrint={printReport}
      />}
      <div className="final-approval-only">
        <button disabled={approved} onClick={onApprove}>{approved ? '최종 승인 완료' : '내용을 확인하고 최종 승인'} <b>✓</b></button>
      </div>
    </div>
  );
}

function ClinicalWorkspace({ nickname, onLogout }: { nickname: string; onLogout: () => Promise<void> }) {
  const [activeView, setActiveView] = useState<'home' | 'links' | 'patients' | 'admissions' | 'encounter'>('home');
  const [activeStep, setActiveStep] = useState<StepId>('emr');
  const [encounterType, setEncounterType] = useState<EncounterType>('new');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [encounterStarted, setEncounterStarted] = useState(false);
  const [emrCaptured, setEmrCaptured] = useState(false);
  const [approved, setApproved] = useState(false);
  const [soapValues, setSoapValues] = useState<Record<string, string>>({ S: '', O: '', A: '', P: '' });
  const [chartText, setChartText] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [autonomicFile, setAutonomicFile] = useState<File | null>(null);
  const [hasPreviousAutonomic, setHasPreviousAutonomic] = useState<boolean | null>(null);
  const [autonomicValues, setAutonomicValues] = useState<Record<string, string>>({});
  const [sessionAutonomicFiles, setSessionAutonomicFiles] = useState<Record<string, AutonomicFileRecord[]>>({});
  const [recording, setRecording] = useState(false);
  const [recordingStarted, setRecordingStarted] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingPosition, setRecordingPosition] = useState<{ x: number; y: number } | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<EncounterDraft | null>(() => typeof window === 'undefined' ? null : readEncounterDraft());
  const [deferredDraft, setDeferredDraft] = useState<EncounterDraft | null>(null);
  const [deferredDraftPosition, setDeferredDraftPosition] = useState<{ x: number; y: number } | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const recordingWidgetRef = useRef<HTMLDivElement>(null);
  const deferredDraftWidgetRef = useRef<HTMLDivElement>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [questionnairesLoading, setQuestionnairesLoading] = useState(true);
  const [questionnairesError, setQuestionnairesError] = useState('');

  const loadQuestionnaires = async () => {
    setQuestionnairesLoading(true);
    setQuestionnairesError('');
    try {
      setQuestionnaires(await pdApi.questionnaires());
    } catch (reason) {
      setQuestionnairesError(reason instanceof Error ? reason.message : '제출 문진을 불러오지 못했습니다.');
    } finally {
      setQuestionnairesLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    pdApi.questionnaires()
      .then((items) => { if (active) setQuestionnaires(items); })
      .catch((reason) => { if (active) setQuestionnairesError(reason instanceof Error ? reason.message : '제출 문진을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setQuestionnairesLoading(false); });
    return () => { active = false; };
  }, []);

  const patientRecords = questionnaires.map(questionnaireToPatientRecord);
  const reviewQuestionnaire = async (id: string, chart: string, version: number) => {
    await pdApi.review(id, { chart, version });
    await loadQuestionnaires();
  };

  const flowSteps = encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
  const encounterLabel = selectedPatient?.questionnaireId ? '문진 기반 진료' : encounterType === 'new' ? '초진' : '재진';
  const currentIndex = flowSteps.findIndex((step) => step.id === activeStep);
  const resetScroll = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  const goHome = () => { setActiveView('home'); resetScroll(); };
  const openQuestionnaireLinks = () => { setActiveView('links'); resetScroll(); };
  const openPatientDirectory = () => { setActiveView('patients'); resetScroll(); };
  const openAdmissions = () => { setActiveView('admissions'); resetScroll(); };
  const startQuestionnaireEncounter = (patient: PatientRecord) => {
    setSelectedPatient(patient);
    setEncounterType('followup');
    setApproved(false);
    setEmrCaptured(true);
    setSoapValues({ ...patient.soap });
    setChartText(patient.questionnaireChart);
    setAudioFile(null);
    setAutonomicFile(null);
    setHasPreviousAutonomic(patient.autonomicFiles.length ? true : null);
    setAutonomicValues({});
    setRecording(false);
    setRecordingStarted(false);
    setRecordingSeconds(0);
    setRecordingPosition(null);
    setActiveStep('tests');
    setEncounterStarted(true);
    setActiveView('encounter');
    setDraftPrompt(null);
    setDeferredDraft(null);
    setDeferredDraftPosition(null);
    setDraftSaveState('idle');
    resetScroll();
  };

  useEffect(() => {
    if (draftSaveState === 'idle') return;
    const timer = window.setTimeout(() => setDraftSaveState('idle'), 2600);
    return () => window.clearTimeout(timer);
  }, [draftSaveState]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!recordingStarted) return;
    const keepRecordingWidgetInView = () => {
      const widget = recordingWidgetRef.current;
      if (!widget) return;
      const bounds = widget.getBoundingClientRect();
      setRecordingPosition((position) => {
        if (!position) return position;
        const margin = 8;
        return {
          x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - bounds.width - margin)),
          y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - bounds.height - margin)),
        };
      });
    };
    window.addEventListener('resize', keepRecordingWidgetInView);
    keepRecordingWidgetInView();
    return () => window.removeEventListener('resize', keepRecordingWidgetInView);
  }, [recordingStarted, recording]);

  useEffect(() => {
    if (!deferredDraft) return;
    const keepDeferredDraftInView = () => {
      const widget = deferredDraftWidgetRef.current;
      if (!widget) return;
      const bounds = widget.getBoundingClientRect();
      setDeferredDraftPosition((position) => {
        if (!position) return position;
        const margin = 8;
        return {
          x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - bounds.width - margin)),
          y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - bounds.height - margin)),
        };
      });
    };
    window.addEventListener('resize', keepDeferredDraftInView);
    keepDeferredDraftInView();
    return () => window.removeEventListener('resize', keepDeferredDraftInView);
  }, [deferredDraft]);

  const toggleRecording = () => {
    setRecordingStarted(true);
    setRecording((current) => !current);
  };
  const startRecordingDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const widget = recordingWidgetRef.current;
    if (!widget) return;
    const bounds = widget.getBoundingClientRect();
    const offset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const pointerId = event.pointerId;
    setRecordingPosition({ x: bounds.left, y: bounds.top });
    const moveWidget = (dragEvent: PointerEvent) => {
      if (dragEvent.pointerId !== pointerId) return;
      const margin = 8;
      setRecordingPosition({
        x: Math.min(Math.max(margin, dragEvent.clientX - offset.x), Math.max(margin, window.innerWidth - bounds.width - margin)),
        y: Math.min(Math.max(margin, dragEvent.clientY - offset.y), Math.max(margin, window.innerHeight - bounds.height - margin)),
      });
      dragEvent.preventDefault();
    };
    const stopDragging = (dragEvent: PointerEvent) => {
      if (dragEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', moveWidget);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
    window.addEventListener('pointermove', moveWidget, { passive: false });
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    event.preventDefault();
  };
  const startDeferredDraftDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const widget = deferredDraftWidgetRef.current;
    if (!widget) return;
    const bounds = widget.getBoundingClientRect();
    const offset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const pointerId = event.pointerId;
    setDeferredDraftPosition({ x: bounds.left, y: bounds.top });
    const moveWidget = (dragEvent: PointerEvent) => {
      if (dragEvent.pointerId !== pointerId) return;
      const margin = 8;
      setDeferredDraftPosition({
        x: Math.min(Math.max(margin, dragEvent.clientX - offset.x), Math.max(margin, window.innerWidth - bounds.width - margin)),
        y: Math.min(Math.max(margin, dragEvent.clientY - offset.y), Math.max(margin, window.innerHeight - bounds.height - margin)),
      });
      dragEvent.preventDefault();
    };
    const stopDragging = (dragEvent: PointerEvent) => {
      if (dragEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', moveWidget);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
    window.addEventListener('pointermove', moveWidget, { passive: false });
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    event.preventDefault();
  };
  const openStep = (step: StepId) => { setActiveStep(step); setActiveView('encounter'); resetScroll(); };
  const goNext = () => { if (currentIndex < flowSteps.length - 1) openStep(flowSteps[currentIndex + 1].id); };
  const goPrevious = () => { if (currentIndex > 0) openStep(flowSteps[currentIndex - 1].id); else goHome(); };
  const saveEncounterDraft = () => {
    const draft: EncounterDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      savedDevice: getCurrentDeviceLabel(),
      patientId: selectedPatient?.id ?? null,
      patientName: selectedPatient?.name ?? '새 환자',
      encounterType,
      activeStep,
      emrCaptured,
      soapValues,
      chartText,
      hasPreviousAutonomic,
      autonomicValues,
      recordingStarted,
      recordingSeconds,
      audioFileName: audioFile?.name ?? null,
      autonomicFileName: autonomicFile?.name ?? null,
    };
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setRecording(false);
      setDraftPrompt(null);
      setDeferredDraft(draft);
      setDraftSaveState('saved');
    } catch {
      setDraftSaveState('error');
    }
  };
  const restoreEncounterDraft = (draft: EncounterDraft) => {
    const patient = draft.patientId ? patientRecords.find((record) => record.id === draft.patientId) ?? null : null;
    const restoredSteps = draft.encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
    const restoredStep = restoredSteps.some((step) => step.id === draft.activeStep) ? draft.activeStep : restoredSteps[0].id;
    setSelectedPatient(patient);
    setEncounterType(draft.encounterType);
    setApproved(false);
    setEmrCaptured(Boolean(draft.emrCaptured));
    setSoapValues({ S: '', O: '', A: '', P: '', ...draft.soapValues });
    setChartText(draft.chartText ?? '');
    setAudioFile(null);
    setAutonomicFile(null);
    setHasPreviousAutonomic(draft.hasPreviousAutonomic ?? null);
    setAutonomicValues(draft.autonomicValues ?? {});
    setRecording(false);
    setRecordingStarted(Boolean(draft.recordingStarted));
    setRecordingSeconds(Math.max(0, Number(draft.recordingSeconds) || 0));
    setRecordingPosition(null);
    setActiveStep(restoredStep);
    setEncounterStarted(true);
    setActiveView('encounter');
    setDraftPrompt(null);
    setDeferredDraft(null);
    setDeferredDraftPosition(null);
    setDraftSaveState('idle');
    resetScroll();
  };
  const approveEncounter = () => {
    if (!approved && selectedPatient && autonomicFile) {
      const now = new Date();
      const uploadDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      const uploadedRecord: AutonomicFileRecord = {
        id: `${selectedPatient.id}-${autonomicFile.name}-${autonomicFile.lastModified}`,
        date: uploadDate,
        fileName: autonomicFile.name,
        fileType: autonomicFile.type || '장비 Export 파일',
        summary: autonomicValues.interpretation?.trim() || '이번 진료에서 업로드한 자율신경검사 파일입니다. 상세 수치와 판정은 의료진 확인이 필요합니다.',
        metrics: [
          ['HRV', autonomicValues.hrvCurrent?.trim() || '분석 대기', autonomicValues.hrvStatus?.trim() || '확인 필요'],
          ['LF/HF', autonomicValues.lfhfCurrent?.trim() || '분석 대기', autonomicValues.lfhfStatus?.trim() || '확인 필요'],
          ['스트레스 지수', autonomicValues.stressCurrent?.trim() || '분석 대기', autonomicValues.stressStatus?.trim() || '확인 필요'],
        ],
        file: autonomicFile,
      };
      setSessionAutonomicFiles((current) => ({ ...current, [selectedPatient.id]: [uploadedRecord, ...(current[selectedPatient.id] ?? []).filter((record) => record.id !== uploadedRecord.id)] }));
    }
    setApproved(true);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftPrompt(null);
    setDeferredDraft(null);
    setDeferredDraftPosition(null);
  };
  const patientName = selectedPatient?.name ?? '새 환자';
  const patientMeta = selectedPatient ? `${selectedPatient.gender} · ${selectedPatient.age}세 · ${selectedPatient.id}` : 'EMR 환자정보 캡처 대기';

  return (
    <main className="flow-app">
      <aside className="flow-rail">
        <button className="flow-brand" onClick={goHome} aria-label="홈">M</button>
        <button className={activeView === 'home' ? 'flow-home-button active' : 'flow-home-button'} onClick={goHome}><i /><span>홈</span></button>
        <button className={activeView === 'links' ? 'patient-records-button active' : 'patient-records-button'} onClick={openQuestionnaireLinks}><i>링크</i><span>문진 전송</span></button>
        <button className={activeView === 'patients' ? 'patient-records-button active' : 'patient-records-button'} onClick={openPatientDirectory}><i>기록</i><span>제출 문진</span></button>
        <button className={activeView === 'admissions' ? 'patient-records-button active' : 'patient-records-button'} onClick={openAdmissions}><i>입원</i><span>입원 결과</span></button>
        <div className="flow-rail-line" />
        {encounterStarted && <nav className={`flow-step-count-${flowSteps.length}`} aria-label="진료 진행 단계">
          {flowSteps.map((step, index) => (
            <button className={activeView === 'encounter' && activeStep === step.id ? 'flow-step-nav active' : encounterStarted && currentIndex > index ? 'flow-step-nav done' : 'flow-step-nav'} key={step.id} onClick={() => openStep(step.id)} disabled={!encounterStarted}>
              <i>{currentIndex > index ? '✓' : index + 1}</i><span>{step.label}</span>
            </button>
          ))}
        </nav>}
      </aside>

      <section className="flow-workspace">
        <header className={recordingStarted ? 'flow-topbar has-recording' : 'flow-topbar'}>
          <div><div className="product-name">MEDIFLOW <span>파킨슨병 임상 문서 관리</span></div><div className="local-badge"><i /> 의료진 인증 · H2 암호화 저장</div></div>
          <div className={recordingStarted ? 'flow-topbar-context has-recording' : 'flow-topbar-context'}>
            {activeView === 'encounter' ? <div className="active-patient-mini"><i>환자</i><span><strong>{patientName}</strong><small>{patientMeta}</small></span><b>{encounterLabel}</b></div> : <div className="topbar-idle"><i>✓</i><span>{activeView === 'patients' ? '제출 문진 · 환자 기록 조회' : activeView === 'links' ? '1회용 사전 문진 링크 전송' : activeView === 'admissions' ? '입원 결과 기록 관리' : '환자 데이터 보호 적용'}</span></div>}
            <div className="legacy-session"><span>{nickname}</span><button onClick={() => void onLogout()}>로그아웃</button></div>
            {recordingStarted && (
              <div
                ref={recordingWidgetRef}
                className={recording ? 'persistent-recording active' : 'persistent-recording paused'}
                role="status"
                aria-live="polite"
                title="드래그하여 화면 안에서 이동"
                style={recordingPosition ? { left: recordingPosition.x, top: recordingPosition.y, right: 'auto' } : undefined}
                onPointerDown={startRecordingDrag}
              >
                <span className="recording-drag-handle" aria-hidden="true">⠿</span>
                <i><span /></i>
                <div><strong>{recording ? '녹음 중' : '녹음 일시정지'}</strong><small>{formatRecordingTime(recordingSeconds)} · {patientName}</small></div>
                <button onClick={toggleRecording} aria-label={recording ? '녹음 일시정지' : '녹음 다시 시작'}>{recording ? '중지' : '다시 시작'}</button>
              </div>
            )}
          </div>
        </header>

        {activeView === 'home' && <HomeScreen onSendQuestionnaire={openQuestionnaireLinks} onOpenPatients={openPatientDirectory} onOpenAdmissions={openAdmissions} />}
        {activeView === 'links' && <div className="pd-module-view"><Links /></div>}
        {activeView === 'patients' && <PatientDirectory records={patientRecords} loading={questionnairesLoading} error={questionnairesError} onReload={() => void loadQuestionnaires()} onReview={reviewQuestionnaire} onStartEncounter={startQuestionnaireEncounter} sessionAutonomicFiles={sessionAutonomicFiles} />}
        {activeView === 'admissions' && <div className="pd-module-view"><Admissions /></div>}
        {activeView === 'encounter' && (
          <>
            <div className="encounter-patient-bar">
              <div className="encounter-patient-avatar">환자</div>
              <div><strong>{patientName}</strong><span>{selectedPatient ? `${selectedPatient.gender} · ${selectedPatient.age}세` : '기본정보 캡처 전'}</span><small>{selectedPatient?.id ?? '등록번호 확인 대기'}</small></div>
              <dl><div><dt>주호소</dt><dd>{selectedPatient?.chiefComplaint ?? '캡처 후 확인'}</dd></div><div><dt>알레르기</dt><dd>{selectedPatient?.allergies ?? '캡처 후 확인'}</dd></div><div><dt>진료구분</dt><dd>{encounterLabel}</dd></div></dl>
              <button onClick={openPatientDirectory}>기존 환자 기록</button>
            </div>

            <div className="flow-progress" style={{ gridTemplateColumns: `repeat(${flowSteps.length}, minmax(0, 1fr))` }}>
              {flowSteps.map((step, index) => <button className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step.id} onClick={() => openStep(step.id)}><i>{index < currentIndex ? '✓' : index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span>{index < flowSteps.length - 1 && <b />}</button>)}
            </div>

            <div className="flow-content">
              {activeStep === 'emr' && <EmrStep stepNumber={currentIndex + 1} encounterType={encounterType} captured={emrCaptured} patient={selectedPatient} onCapture={() => setEmrCaptured(true)} />}
              {activeStep === 'tests' && <TestsStep stepNumber={currentIndex + 1} encounterType={encounterType} chartText={chartText} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} onChartTextChange={setChartText} onAutonomicFileChange={(file) => { setAutonomicFile(file); setHasPreviousAutonomic(file ? Boolean(selectedPatient) : selectedPatient ? true : null); }} onPreviousChange={setHasPreviousAutonomic} />}
              {activeStep === 'audio' && <AudioStep stepNumber={currentIndex + 1} encounterType={encounterType} selectedFile={audioFile} recording={recording} recordingStarted={recordingStarted} recordingSeconds={recordingSeconds} onSelectedFileChange={setAudioFile} onToggleRecording={toggleRecording} />}
              {activeStep === 'soap' && <SoapStep stepNumber={currentIndex + 1} values={soapValues} onChange={(letter, value) => setSoapValues({ ...soapValues, [letter]: value })} />}
              {activeStep === 'final' && <FinalStep stepNumber={currentIndex + 1} approved={approved} patient={selectedPatient} soapValues={soapValues} chartText={chartText} audioFile={audioFile} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} autonomicValues={autonomicValues} onSoapChange={(letter, value) => setSoapValues((current) => ({ ...current, [letter]: value }))} onChartTextChange={setChartText} onAutonomicChange={(key, value) => setAutonomicValues((current) => ({ ...current, [key]: value }))} onApprove={approveEncounter} />}
            </div>

            <footer className="flow-footer-actions">
              <button className="flow-previous" onClick={goPrevious}>← 이전 단계</button>
              <div><span>{currentIndex + 1} / {flowSteps.length}</span><strong>{flowSteps[currentIndex].label}</strong></div>
              <button className={`flow-draft-save ${draftSaveState}`} onClick={saveEncounterDraft}>{draftSaveState === 'saved' ? '임시 저장 완료 ✓' : draftSaveState === 'error' ? '저장 실패 · 다시 시도' : '임시 저장'}</button>
              {activeStep !== 'final' && <button className="flow-next" onClick={goNext}>{`${flowSteps[currentIndex + 1].label}로`} <b>→</b></button>}
            </footer>
          </>
        )}
      </section>

      {deferredDraft && (
        <div
          ref={deferredDraftWidgetRef}
          className={`${recordingStarted ? 'deferred-draft-widget with-recording' : 'deferred-draft-widget'}${draftSaveState === 'saved' ? ' saved' : ''}`}
          role="status"
          title="드래그하여 화면 안에서 이동"
          style={deferredDraftPosition ? { left: deferredDraftPosition.x, top: deferredDraftPosition.y, right: 'auto' } : undefined}
          onPointerDown={startDeferredDraftDrag}
        >
          <span className="recording-drag-handle" aria-hidden="true">⠿</span>
          <i>임시</i>
          <div><strong>임시 저장 작업</strong><small>{draftSaveState === 'saved' ? `방금 저장됨 · ${deferredDraft.patientName}` : `${deferredDraft.patientName} · ${getDraftStepLabel(deferredDraft)}`}</small></div>
          <button onClick={() => restoreEncounterDraft(deferredDraft)}>이어쓰기</button>
        </div>
      )}

      {draftPrompt && (
        <div className="draft-resume-backdrop">
          <section className="draft-resume-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-resume-title">
            <header><i>임시</i><div><p className="eyebrow">SAVED ENCOUNTER</p><h2 id="draft-resume-title">임시 저장된 작업이 있습니다</h2><span>저장한 진료 단계와 입력 내용을 이어서 작성할 수 있습니다.</span></div></header>
            <dl className="draft-resume-meta">
              <div><dt>환자</dt><dd>{draftPrompt.patientName}</dd></div>
              <div><dt>저장 단계</dt><dd>{getDraftStepLabel(draftPrompt)}</dd></div>
              <div><dt>저장한 기기</dt><dd>{draftPrompt.savedDevice}</dd></div>
              <div><dt>저장 시간</dt><dd>{formatDraftSavedAt(draftPrompt.savedAt)}</dd></div>
            </dl>
            {(draftPrompt.audioFileName || draftPrompt.autonomicFileName) && <p className="draft-file-notice">첨부 파일은 보안을 위해 브라우저에 저장하지 않습니다. 이어서 작성한 뒤 필요한 파일을 다시 선택해 주세요.</p>}
            <div className="draft-account-plan"><i>K</i><span><strong>카카오 의료진 로그인</strong><small>허용된 의료진 카카오 계정으로 인증한 사용자만 기록 화면을 이용합니다.</small></span></div>
            <p className="draft-local-limit">현재 GitHub Pages 시제품은 이 브라우저에만 임시 저장됩니다. 실제 기기 간 공유에는 카카오 로그인과 서버 저장소 연결이 필요합니다.</p>
            <footer><button onClick={() => { setDeferredDraft(draftPrompt); setDeferredDraftPosition(null); setDraftPrompt(null); }}>나중에</button><button onClick={() => restoreEncounterDraft(draftPrompt)}>확인하고 이어서 작성 <b>→</b></button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

function AuthenticatedApplication() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    pdApi.me()
      .then((response) => { if (active) setAuth(response); })
      .catch(() => { if (active) setAuth({ authenticated: false, nickname: null }); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  if (checking) {
    return <main className="login-gate"><section className="login-card"><p className="eyebrow">SECURE SESSION</p><h1>로그인 상태 확인 중</h1></section></main>;
  }
  if (!auth?.authenticated) return <LoginGate />;

  const logout = async () => {
    await pdApi.logout();
    setAuth({ authenticated: false, nickname: null });
  };
  return <ClinicalWorkspace nickname={auth.nickname || '의료진'} onLogout={logout} />;
}

export default function Page() {
  const token = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('questionnaireToken') || '';
  return token ? <PublicQuestionnaire token={token} /> : <AuthenticatedApplication />;
}

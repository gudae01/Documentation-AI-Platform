'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TextareaHTMLAttributes } from 'react';
import './pd-portal.css';
import { ApiError, pdApi, type AuthResponse, type PdClinicalRecord, type Questionnaire } from './pd-api';
import { Links, LoginGate, PublicQuestionnaire } from './pd-portal';

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
  sourceRecord?: PdClinicalRecord;
};
type ExaminationResult = {
  source: '환자 사전 문진' | '기존 기록' | 'EMR 붙여넣기';
  title: string;
  value: string;
  status: string;
};
type MicrophoneState = 'checking' | 'available' | 'requesting' | 'recording' | 'denied' | 'unavailable' | 'unsupported';
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
  hasApprovedClinicalRecord: boolean;
  currentClinicalRecord?: PdClinicalRecord;
  clinicalRecords: PdClinicalRecord[];
  approvedExaminationResults: ExaminationResult[];
  approvedAutonomicFileName?: string;
  clinician: string;
  approvedAt: string;
  courseSummary: {
    title: string;
    status: '호전' | '유지' | '관찰 필요';
    summary: string;
    sources: string[];
  }[];
  previousRecords: {
    recordId: string;
    date: string;
    visitType: string;
    chiefComplaint: string;
    objective: string;
    assessment: string;
    treatment: string;
    clinician: string;
  }[];
  soap: Record<'S' | 'O' | 'A' | 'P', string>;
  questionnaireResults: [string, string, string][];
  tests: [string, string, string][];
  autonomicFiles: AutonomicFileRecord[];
  autonomic: {
    date: string;
    current: [string, string, string][];
    comparison?: [string, string, string, string][];
    interpretation: string;
  };
};

type ClinicalRecordPayload = Pick<PdClinicalRecord,
  'rawExaminationText' | 'structuredResults' | 'soap' | 'autonomic' | 'audioFileName' | 'autonomicFileName'>;

type HistoricalClinicalDraft = {
  soap: Record<'S' | 'O' | 'A' | 'P', string>;
  autonomic: Record<string, string>;
};

const firstVisitSteps: FlowStep[] = [
  { id: 'emr', label: '환자정보 캡처', description: 'EMR 기본정보 확인' },
  { id: 'audio', label: '진료 녹음 입력', description: '실시간 · 녹음파일' },
  { id: 'tests', label: '검사자료 보완', description: '있는 자료만 추가' },
  { id: 'soap', label: 'SOAP 작성', description: '의료진 직접 작성' },
  { id: 'final', label: '최종 승인', description: '문서 확정' },
];

const DRAFT_STORAGE_KEY = 'mediflow:encounter-draft:v1';

const followupVisitSteps: FlowStep[] = [
  { id: 'tests', label: '이전자료 확인', description: '차트 · 검사 이력' },
  { id: 'audio', label: '진료 녹음 입력', description: '실시간 · 녹음파일' },
  { id: 'soap', label: 'SOAP 작성', description: '의료진 직접 작성' },
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

function questionnaireToPatientRecord(questionnaire: Questionnaire, clinicalRecords: PdClinicalRecord[] = []): PatientRecord {
  const payload = readQuestionnairePayload(questionnaire.rawJson);
  const patientExplanation = joinPayload(payload, ['chiefComplaint', 'symptomDetail']) || '환자 설명이 입력되지 않았습니다.';
  const allergies = joinPayload(payload, ['allergy', 'foodAllergy', 'otherAllergy']) || '미확인';
  const reviewed = questionnaire.status === 'REVIEWED';
  const latestPatientClinicalRecord = clinicalRecords[0];
  const currentClinicalRecord = clinicalRecords.find((record) => record.questionnaireId === questionnaire.id);
  const latestClinicalRecord = currentClinicalRecord;
  const questionnaireResults = organizeClinicalText(questionnaire.chart
    .split(/\r?\n/)
    .filter((line) => !/^\[사전 문진\]/.test(line.trim()))
    .join('\n'))
    .map((section) => [
      section.title,
      section.lines.join('\n'),
      reviewed ? '의료진 문진 확인 완료' : '환자 작성 · 의료진 미검토',
    ] as [string, string, string]);
  const sourceClinicalRecord = currentClinicalRecord ?? latestPatientClinicalRecord;
  const persistedTests = (sourceClinicalRecord?.structuredResults ?? [])
    .filter((result) => result.source !== '환자 사전 문진')
    .map((result) => [
    result.title,
    result.value,
    result.status || result.source,
  ] as [string, string, string]);
  const storedApprovedResults: ExaminationResult[] = (currentClinicalRecord?.structuredResults ?? [])
    .filter((result) => result.source !== '환자 사전 문진')
    .map((result) => ({
    source: result.source === '환자 사전 문진' ? '환자 사전 문진'
      : result.source === 'EMR 붙여넣기' ? 'EMR 붙여넣기' : '기존 기록',
    title: result.title,
    value: result.value,
    status: result.status,
  }));
  const approvedExaminationResults: ExaminationResult[] = currentClinicalRecord ? storedApprovedResults : [];
  const persistedAutonomicFiles: AutonomicFileRecord[] = clinicalRecords
    .filter((record) => record.autonomicFileName)
    .map((record) => ({
      id: record.id,
      date: dateLabel(record.approvedAt),
      fileName: record.autonomicFileName ?? '검사파일',
      fileType: '승인 기록에 연결된 파일',
      summary: record.autonomic.interpretation || '의료진 최종 승인 기록에 연결된 자율신경검사입니다.',
      metrics: [
        ['HRV', record.autonomic.hrvCurrent || '-', record.autonomic.hrvStatus || '확인 필요'],
        ['LF/HF', record.autonomic.lfhfCurrent || '-', record.autonomic.lfhfStatus || '확인 필요'],
        ['스트레스 지수', record.autonomic.stressCurrent || '-', record.autonomic.stressStatus || '확인 필요'],
      ],
      sourceRecord: record,
    }));
  const latestAutonomic = latestClinicalRecord?.autonomic ?? {};
  const latestAutonomicHasPrevious = latestAutonomic.hasPrevious === 'true'
    || ['hrv', 'lfhf', 'stress'].some((key) => latestAutonomic[`${key}Previous`] || latestAutonomic[`${key}Change`]);
  const latestAutonomicCurrent = [
    ['HRV', latestAutonomic.hrvCurrent, latestAutonomic.hrvStatus],
    ['LF/HF', latestAutonomic.lfhfCurrent, latestAutonomic.lfhfStatus],
    ['스트레스 지수', latestAutonomic.stressCurrent, latestAutonomic.stressStatus],
  ].filter(([, value, status]) => value || status).map(([metric, value, status]) => [
    metric,
    value || '-',
    status || '확인 필요',
  ] as [string, string, string]);
  const latestAutonomicComparison = latestAutonomicHasPrevious ? [
    ['HRV', latestAutonomic.hrvPrevious, latestAutonomic.hrvCurrent, latestAutonomic.hrvChange],
    ['LF/HF', latestAutonomic.lfhfPrevious, latestAutonomic.lfhfCurrent, latestAutonomic.lfhfChange],
    ['스트레스 지수', latestAutonomic.stressPrevious, latestAutonomic.stressCurrent, latestAutonomic.stressChange],
  ].filter(([, previous, current, change]) => previous || current || change).map(([metric, previous, current, change]) => [
    metric,
    previous || '-',
    current || '-',
    change || '확인 필요',
  ] as [string, string, string, string]) : undefined;
  const rawClinicalDetails = [
    ['작성자', joinPayload(payload, ['respondent', 'relationship'])],
    ['파킨슨병 발병·진단', joinPayload(payload, ['pdOnset', 'pdDiagnosis', 'pdDiagnosisHospital', 'initialSymptoms', 'onsetSide'])],
    ['현재 상태', joinPayload(payload, ['currentStage', 'dbsHistory', 'rehabilitationHistory'])],
    ['투약·효과', joinPayload(payload, ['pdMedication', 'medicationTiming', 'medicationEffect', 'wearingOff', 'medicationSideEffects'])],
    ['환자 설명', joinPayload(payload, ['chiefComplaint', 'symptomDetail', 'symptomTiming', 'laterality', 'onOffRelation', 'aggravatingFactors', 'relievingFactors', 'painNrs', 'fallSafety'])],
    ['알레르기·복용약', joinPayload(payload, ['allergy', 'foodAllergy', 'otherAllergy', 'nonPdMedications'])],
    ['과거력·가족력', joinPayload(payload, ['pastHistory', 'familyHistory'])],
    ['생활·자율 증상', joinPayload(payload, ['diet', 'digestion', 'bowel', 'urine', 'sleep', 'bodyFacts', 'brainFacts'])],
  ].filter((detail) => detail[1]).map(([label, value]) => ({ label, value }));
  const reviewedClinicalDetails = questionnaireResults.map(([label, value]) => ({ label, value }));
  const clinicalDetails = reviewedClinicalDetails.length
    ? reviewedClinicalDetails
    : [{ label: '진료·입원 예정일', value: questionnaire.plannedDate }, ...rawClinicalDetails];

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
    visits: Math.max(1, clinicalRecords.length),
    chiefComplaint: payloadText(payload, 'chiefComplaint') || '사전 문진 제출',
    allergies,
    department: '파킨슨병 클리닉',
    diagnoses: ['사전 문진'],
    chart: {
      symptoms: patientExplanation,
      assessment: latestClinicalRecord?.soap.assessment ?? '',
      plan: latestClinicalRecord?.soap.plan ?? '',
    },
    clinicalDetails,
    hasApprovedClinicalRecord: Boolean(currentClinicalRecord),
    currentClinicalRecord: currentClinicalRecord ?? undefined,
    clinicalRecords,
    approvedExaminationResults,
    approvedAutonomicFileName: currentClinicalRecord?.autonomicFileName ?? undefined,
    clinician: latestClinicalRecord?.clinician ?? (reviewed ? '검토 의료진' : '미검토'),
    approvedAt: latestClinicalRecord ? dateLabel(latestClinicalRecord.approvedAt) : reviewed ? dateLabel(questionnaire.reviewedAt) : '미검토',
    courseSummary: [],
    previousRecords: clinicalRecords
      .filter((record) => record.questionnaireId !== questionnaire.id)
      .map((record) => ({
      recordId: record.id,
      date: dateLabel(record.approvedAt),
      visitType: '문진 기반 진료',
      chiefComplaint: record.soap.subjective || patientExplanation,
      objective: record.soap.objective || '기록 없음',
      assessment: record.soap.assessment || '기록 없음',
      treatment: record.soap.plan || '기록 없음',
      clinician: record.clinician,
    })),
    soap: latestClinicalRecord ? {
      S: latestClinicalRecord.soap.subjective,
      O: latestClinicalRecord.soap.objective,
      A: latestClinicalRecord.soap.assessment,
      P: latestClinicalRecord.soap.plan,
    } : { S: patientExplanation, O: '', A: '', P: '' },
    questionnaireResults,
    tests: persistedTests,
    autonomicFiles: persistedAutonomicFiles,
    autonomic: {
      date: latestClinicalRecord ? dateLabel(latestClinicalRecord.approvedAt) : '',
      current: latestAutonomicCurrent,
      comparison: latestAutonomicComparison,
      interpretation: latestAutonomic.interpretation || '등록된 검사 해석이 없습니다.',
    },
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

const PRINT_BODY_CLASSES = ['printing-patient-guide'];

function printDocument(bodyClass: string, title: string, onComplete?: () => void) {
  const previousTitle = document.title;
  const printMedia = window.matchMedia('print');
  let cleaned = false;
  let postPrintTimer: number | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    PRINT_BODY_CLASSES.forEach((className) => document.body.classList.remove(className));
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
    if (typeof printMedia.removeEventListener === 'function') printMedia.removeEventListener('change', handlePrintMediaChange);
    else printMedia.removeListener(handlePrintMediaChange);
    window.clearTimeout(cleanupTimer);
    if (postPrintTimer !== null) window.clearTimeout(postPrintTimer);
    onComplete?.();
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
      // 일부 iPadOS·인앱 브라우저는 afterprint를 보내지 않고 즉시 반환합니다.
      // 인쇄 데이터가 캡처될 시간을 준 뒤 화면 상태를 정리해 다음 화면으로 이동합니다.
      if (!cleaned) postPrintTimer = window.setTimeout(cleanup, 900);
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
  autonomicMetrics: { metric: string; previous: string; current: string; changeOrStatus: string }[];
};

const autonomicMetricDefinitions = [['HRV', 'hrv'], ['LF/HF', 'lfhf'], ['스트레스 지수', 'stress']] as const;

function buildAutonomicReportMetrics(values: Record<string, string>, hasPrevious: boolean) {
  return autonomicMetricDefinitions.map(([metric, key]) => ({
    metric,
    previous: hasPrevious ? values[`${key}Previous`]?.trim() || '-' : '-',
    current: values[`${key}Current`]?.trim() || '-',
    changeOrStatus: (hasPrevious ? values[`${key}Change`] : values[`${key}Status`])?.trim() || '확인 필요',
  })).filter((row) => row.previous !== '-' || row.current !== '-' || row.changeOrStatus !== '확인 필요');
}

function describeAutonomicReport(hasFile: boolean, hasPrevious: boolean | null) {
  if (!hasFile) return '자율신경검사 파일을 입력하면 검사 항목, 현재 결과, 이전 결과 및 변화 설명이 표시됩니다.';
  if (hasPrevious === true) return '현재 검사와 이전 검사의 지표별 변화량·변화 방향·의료진 설명이 표시됩니다.';
  if (hasPrevious === false) return '이전 검사 데이터가 없어 현재 검사 결과를 기준 데이터로 저장합니다. 다음 검사부터 변화 내용을 비교합니다.';
  return '검사파일 항목과 수치가 표시되며, 이전 검사 존재 여부 확인 후 비교 설명이 생성됩니다.';
}

function PatientGuideDocument({ approved, patientName, registrationNumber, visitDate, clinician, soapValues, autonomicSummary, autonomicFileName, autonomicMetrics }: PatientGuideData) {
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
          {autonomicMetrics.length > 0 && <table className="report-autonomic-table"><thead><tr><th>지표</th><th>이전</th><th>현재</th><th>변화·상태</th></tr></thead><tbody>{autonomicMetrics.map((row) => <tr key={row.metric}><th scope="row">{row.metric}</th><td>{row.previous}</td><td>{row.current}</td><td>{row.changeOrStatus}</td></tr>)}</tbody></table>}
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

function HomeScreen({ onSendQuestionnaire, onOpenPatients }: {
  onSendQuestionnaire: () => void;
  onOpenPatients: () => void;
}) {
  const journey = [
    ['문진 링크', '1회용 보안 링크 전송'],
    ['환자 작성', '방문 전 사전 문진'],
    ['제출 확인', '기존 환자기록에서 검토'],
    ['진료 기록', '환자 설명·검사자료 확인'],
    ['최종 승인', '진료 결과 검토·PDF'],
  ];
  return (
    <section className="agent-home">
      <div className="agent-hero">
        <div className="agent-copy">
          <p className="eyebrow">ONE PATIENT · ONE ENCOUNTER</p>
          <h1>한 명의 환자,<br />하나의 진료 흐름</h1>
          <p>환자가 방문 전에 작성한 사전 문진을 시작점으로, 기존 환자 기록과 진료·승인 과정을 한 흐름에서 관리합니다.</p>
          <div className="home-primary-actions">
            <button className="hero-start" onClick={onSendQuestionnaire}><i>＋</i><span><strong>사전 문진 보내기</strong><small>1회용 보안 링크 생성</small></span><b>→</b></button>
            <button className="patient-history-start" onClick={onOpenPatients}><i>기록</i><span><strong>제출 문진 확인</strong><small>기존 환자 기록 화면에서 검토</small></span><b>→</b></button>
          </div>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <div className="orbit-center"><i>M</i><strong>Clinical<br />Agent</strong></div>
          {['링크', '작성', '제출', '기록', '진료', '승인'].map((label, index) => <span className={`orbit-item orbit-${index}`} key={label}>{label}</span>)}
        </div>
      </div>

      <div className="journey-board">
        <header><div><p className="eyebrow">CLINICAL DOCUMENT JOURNEY</p><h2>사전 문진부터 진료 승인까지</h2></div><span>제출된 사전 문진 환자 기록에서 진료 시작</span></header>
        <div className="journey-steps">
          {journey.map(([label, description], index) => (
            <button key={label} onClick={index < 2 ? onSendQuestionnaire : onOpenPatients}>
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
          <div><p className="eyebrow">PATIENT RECORDS</p><strong>제출 문진에서 진료까지</strong><span>환자가 작성한 문진을 기존 환자 기록에서 확인하고 진료 화면으로 이어갑니다.</span></div>
          <button onClick={onOpenPatients}>환자기록 보기 →</button>
        </section>
      </div>
    </section>
  );
}

function PatientDirectory({ records, loading, error, onReload, onReview, onUpdateClinicalRecord, onStartEncounter, sessionAutonomicFiles }: {
  records: PatientRecord[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onReview: (id: string, chart: string, version: number) => Promise<void>;
  onUpdateClinicalRecord: (questionnaireId: string, body: ClinicalRecordPayload) => Promise<void>;
  onStartEncounter: (patient: PatientRecord) => void;
  sessionAutonomicFiles: Record<string, AutonomicFileRecord[]>;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [reviewActionError, setReviewActionError] = useState('');
  const [editingQuestionnaireId, setEditingQuestionnaireId] = useState('');
  const [questionnaireDraftFields, setQuestionnaireDraftFields] = useState<{ label: string; value: string }[]>([]);
  const [soapDraft, setSoapDraft] = useState<Record<'S' | 'O' | 'A' | 'P', string>>({ S: '', O: '', A: '', P: '' });
  const [examinationDraftRows, setExaminationDraftRows] = useState<ExaminationResult[]>([]);
  const [autonomicDraftValues, setAutonomicDraftValues] = useState<Record<string, string>>({});
  const [historicalClinicalDrafts, setHistoricalClinicalDrafts] = useState<Record<string, HistoricalClinicalDraft>>({});
  const [showPatientGuide, setShowPatientGuide] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPatients = records.filter((patient) => [patient.name, patient.id, patient.chiefComplaint, patient.department].some((value) => value.toLowerCase().includes(normalizedQuery)));
  const selectedPatient = records.find((patient) => patient.questionnaireId === selectedId) ?? filteredPatients[0] ?? null;
  const editingRecord = Boolean(selectedPatient && editingQuestionnaireId === selectedPatient.questionnaireId);
  const availableAutonomicFiles = selectedPatient ? [...(sessionAutonomicFiles[selectedPatient.id] ?? []), ...selectedPatient.autonomicFiles].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const hasApprovedClinicalRecord = Boolean(selectedPatient?.hasApprovedClinicalRecord);
  const hasClinicianRecord = Boolean(selectedPatient && (
    selectedPatient.hasApprovedClinicalRecord || selectedPatient.courseSummary.length
    || selectedPatient.previousRecords.length
    || selectedPatient.tests.length
    || availableAutonomicFiles.length
    || selectedPatient.soap.O.trim()
    || selectedPatient.soap.A.trim()
    || selectedPatient.soap.P.trim()
  ));
  const hasAutonomicRecord = Boolean(selectedPatient && (
    selectedPatient.autonomic.current.length
    || selectedPatient.autonomic.comparison?.length
    || availableAutonomicFiles.length
  ));
  const showCurrentAutonomic = hasAutonomicRecord || Boolean(editingRecord && selectedPatient?.currentClinicalRecord);
  const directoryExaminationRows: ExaminationResult[] = selectedPatient
    ? selectedPatient.hasApprovedClinicalRecord
      ? selectedPatient.approvedExaminationResults
      : selectedPatient.tests.map(([title, value, status]) => ({ source: '기존 기록' as const, title, value, status }))
    : [];
  const visibleExaminationRows = editingRecord ? examinationDraftRows : directoryExaminationRows;
  const directoryExaminationGroups = [
    { source: '기존 기록' as const, label: '이전 승인 기록', tone: 'existing' },
    { source: 'EMR 붙여넣기' as const, label: '이번에 추가한 검사', tone: 'emr' },
  ].map((group) => ({ ...group, rows: visibleExaminationRows.filter((row) => row.source === group.source) }))
    .filter((group) => group.rows.length > 0);
  const directoryAutonomicMetrics = selectedPatient?.autonomic.comparison
    ? selectedPatient.autonomic.comparison.map(([metric, previous, current, changeOrStatus]) => ({ metric, previous, current, changeOrStatus }))
    : selectedPatient?.autonomic.current.map(([metric, current, changeOrStatus]) => ({ metric, previous: '-', current, changeOrStatus })) ?? [];
  const patientGuide: PatientGuideData | null = selectedPatient && hasApprovedClinicalRecord ? {
    approved: true,
    patientName: selectedPatient.name,
    registrationNumber: selectedPatient.id,
    visitDate: selectedPatient.approvedAt,
    clinician: selectedPatient.clinician,
    soapValues: selectedPatient.soap,
    autonomicSummary: selectedPatient.autonomic.interpretation,
    autonomicFileName: selectedPatient.approvedAutonomicFileName,
    autonomicMetrics: directoryAutonomicMetrics,
  } : null;
  const printTitle = selectedPatient ? `${selectedPatient.name}_${selectedPatient.id}_종합진료안내서` : '환자_종합진료안내서';
  const openUploadedFile = (record: AutonomicFileRecord) => {
    if (!record.file) return;
    const fileUrl = URL.createObjectURL(record.file);
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
  };
  const printPatientGuide = () => printDocument('printing-patient-guide', printTitle);
  const startPatientRecordEdit = () => {
    if (!selectedPatient) return;
    setQuestionnaireDraftFields(selectedPatient.clinicalDetails.map((detail) => ({ ...detail })));
    setSoapDraft({ ...selectedPatient.soap });
    setExaminationDraftRows(directoryExaminationRows.map((row) => ({ ...row })));
    setAutonomicDraftValues({ ...(selectedPatient.currentClinicalRecord?.autonomic ?? {}) });
    setHistoricalClinicalDrafts(Object.fromEntries(selectedPatient.clinicalRecords
      .filter((record) => record.id !== selectedPatient.currentClinicalRecord?.id)
      .map((record) => [record.id, {
        soap: {
          S: record.soap.subjective,
          O: record.soap.objective,
          A: record.soap.assessment,
          P: record.soap.plan,
        },
        autonomic: { ...record.autonomic },
      }])));
    setEditingQuestionnaireId(selectedPatient.questionnaireId);
    setReviewActionError('');
    window.requestAnimationFrame(() => document.getElementById(`current-record-${selectedPatient.lastVisit.replace(/\./g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const cancelPatientRecordEdit = () => {
    setEditingQuestionnaireId('');
    setQuestionnaireDraftFields([]);
    setExaminationDraftRows([]);
    setAutonomicDraftValues({});
    setHistoricalClinicalDrafts({});
    setReviewActionError('');
  };
  const updateQuestionnaireDraftField = (index: number, value: string) => {
    setQuestionnaireDraftFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, value } : field));
  };
  const updateExaminationDraftRow = (index: number, key: 'title' | 'value', value: string) => {
    setExaminationDraftRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };
  const updateHistoricalSoapDraft = (recordId: string, letter: 'S' | 'O' | 'A' | 'P', value: string) => {
    setHistoricalClinicalDrafts((current) => ({
      ...current,
      [recordId]: { ...current[recordId], soap: { ...current[recordId].soap, [letter]: value } },
    }));
  };
  const updateHistoryAutonomicDraft = (record: AutonomicFileRecord, key: string, value: string) => {
    if (record.sourceRecord?.id === selectedPatient?.currentClinicalRecord?.id) {
      setAutonomicDraftValues((current) => ({ ...current, [key]: value }));
      return;
    }
    if (!record.sourceRecord) return;
    setHistoricalClinicalDrafts((current) => ({
      ...current,
      [record.sourceRecord!.id]: {
        ...current[record.sourceRecord!.id],
        autonomic: { ...current[record.sourceRecord!.id].autonomic, [key]: value },
      },
    }));
  };
  const getHistoryAutonomicValues = (record: AutonomicFileRecord) => {
    if (record.sourceRecord?.id === selectedPatient?.currentClinicalRecord?.id) return autonomicDraftValues;
    return record.sourceRecord ? historicalClinicalDrafts[record.sourceRecord.id]?.autonomic ?? record.sourceRecord.autonomic : {};
  };
  const savePatientRecord = async () => {
    if (!selectedPatient) return;
    const filledFields = questionnaireDraftFields.filter((field) => field.value.trim());
    if (!filledFields.length) {
      setReviewActionError('문진 항목을 한 개 이상 입력해 주세요.');
      return;
    }
    const chartHeader = selectedPatient.questionnaireChart.split(/\r?\n/).find((line) => /^\[사전 문진\]/.test(line.trim()))
      ?? '[사전 문진] 환자 설명 — 의료진 확인 필요';
    const questionnaireChart = [chartHeader, ...filledFields.map((field) => `${field.label}: ${field.value.trim().replace(/\s*\r?\n\s*/g, ' / ')}`)].join('\n');
    setReviewingId(selectedPatient.questionnaireId);
    setReviewActionError('');
    try {
      await onReview(selectedPatient.questionnaireId, questionnaireChart, selectedPatient.questionnaireVersion);
      if (selectedPatient.currentClinicalRecord) {
        const currentRecord = selectedPatient.currentClinicalRecord;
        const structuredResults = examinationDraftRows
          .filter((row) => row.title.trim() && row.source !== '환자 사전 문진')
          .map((row) => ({ ...row, title: row.title.trim(), value: row.value.trim() }));
        await onUpdateClinicalRecord(currentRecord.questionnaireId, {
          rawExaminationText: structuredResults
            .filter((row) => row.source === 'EMR 붙여넣기')
            .map((row) => `${row.title}:\n${row.value}`)
            .join('\n\n'),
          structuredResults,
          soap: {
            subjective: soapDraft.S,
            objective: soapDraft.O,
            assessment: soapDraft.A,
            plan: soapDraft.P,
          },
          autonomic: autonomicDraftValues,
          audioFileName: currentRecord.audioFileName,
          autonomicFileName: currentRecord.autonomicFileName,
        });
      }
      for (const record of selectedPatient.clinicalRecords) {
        if (record.id === selectedPatient.currentClinicalRecord?.id) continue;
        const draft = historicalClinicalDrafts[record.id];
        if (!draft) continue;
        await onUpdateClinicalRecord(record.questionnaireId, {
          rawExaminationText: record.rawExaminationText,
          structuredResults: record.structuredResults.filter((row) => row.source !== '환자 사전 문진'),
          soap: {
            subjective: draft.soap.S,
            objective: draft.soap.O,
            assessment: draft.soap.A,
            plan: draft.soap.P,
          },
          autonomic: draft.autonomic,
          audioFileName: record.audioFileName,
          autonomicFileName: record.autonomicFileName,
        });
      }
      cancelPatientRecordEdit();
    } catch (reason) {
      setReviewActionError(reason instanceof Error ? reason.message : '환자 기록을 저장하지 못했습니다.');
    } finally {
      setReviewingId('');
    }
  };

  return (
    <section className="patient-directory">
      <header className="directory-heading">
        <div><p className="eyebrow">PATIENT RECORDS</p><h1>제출 문진 및 환자 기록</h1><span>H2에 저장된 제출 문진을 기존 환자 기록 화면에서 확인하고 검토합니다.</span></div>
        <b><i className="live-sync-dot" />자동 동기화 · 총 {records.length}건</b>
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
            <header className="record-detail-head">
              <div className="record-patient-avatar">{selectedPatient.name.slice(-1)}</div>
              <div><p><strong>{selectedPatient.name}</strong><span>{selectedPatient.gender} · 생년월일 {selectedPatient.birthDate}</span></p><small>{selectedPatient.id} · {selectedPatient.department} · 제출 문진</small></div>
              <div className="record-detail-actions">
                <button className="record-start-encounter-button" onClick={() => onStartEncounter(selectedPatient)}><span className="full-action-label">문진 기반 진료 시작</span><span className="compact-action-label">진료 시작</span><b>→</b></button>
                <button className="record-confirm-button" onClick={editingRecord ? cancelPatientRecordEdit : startPatientRecordEdit} disabled={reviewingId === selectedPatient.questionnaireId}><span className="full-action-label">{editingRecord ? '환자 기록 수정 취소' : '환자 기록 전체 수정'}</span><span className="compact-action-label">{editingRecord ? '수정 취소' : '기록 수정'}</span></button>
                <button className="record-pdf-button" onClick={() => setShowPatientGuide(true)} disabled={!hasApprovedClinicalRecord}><span className="full-action-label">{hasApprovedClinicalRecord ? '최종 승인 PDF' : '최종 승인 후 PDF'}</span><span className="compact-action-label">PDF</span></button>
              </div>
            </header>
            {reviewActionError && <div className="record-action-error">{reviewActionError}</div>}
            {editingRecord && <div className="patient-record-edit-bar"><span><strong>환자 기록 전체 수정 중</strong><small>사전 문진, 검사 결과, SOAP, 자율신경검사와 과거 이력을 항목별로 수정할 수 있습니다.</small></span><div><button className="questionnaire-edit-cancel" onClick={cancelPatientRecordEdit}>취소</button><button className="questionnaire-edit-save" onClick={() => void savePatientRecord()} disabled={reviewingId === selectedPatient.questionnaireId}>{reviewingId === selectedPatient.questionnaireId ? '저장 중…' : '전체 저장'}</button></div></div>}
            <section className={`questionnaire-origin-banner ${selectedPatient.questionnaireStatus === 'REVIEWED' ? 'reviewed' : 'pending'}`}>
              <i>환자</i>
              <div><strong>환자 또는 보호자가 직접 작성한 정보입니다</strong><p>의료진의 판단·진단·치료계획이 아니며, 진료기록과 분리하여 원문 그대로 보존합니다.</p></div>
              <b>{selectedPatient.questionnaireStatus === 'REVIEWED' ? '문진 확인 완료' : '의료진 미검토'}</b>
            </section>
            <dl className="record-summary-strip">
              <div><dt>문진 제출일</dt><dd>{selectedPatient.lastVisit}</dd></div><div><dt>환자 작성 주호소</dt><dd>{selectedPatient.chiefComplaint}</dd></div><div><dt>환자 작성 알레르기</dt><dd>{selectedPatient.allergies}</dd></div><div><dt>문진 상태</dt><dd>{selectedPatient.questionnaireStatus === 'REVIEWED' ? '의료진이 문진을 확인함' : '의료진 확인 전'}</dd></div>
            </dl>
            <section className="record-chart-card">
              <header><div><p className="eyebrow">PATIENT-SUBMITTED SUMMARY</p><h2>환자 작성 문진 요약</h2></div><span><b>환자 작성</b><time>{selectedPatient.lastVisit}</time></span></header>
              <div className="questionnaire-summary-grid">
                <article><i>원문</i><div><strong>환자 설명</strong><p>{selectedPatient.chart.symptoms}</p></div></article>
                <article><i>검토</i><div><strong>의료진 진료기록과 분리</strong><p>{selectedPatient.questionnaireStatus === 'REVIEWED' ? '의료진이 문진 내용을 확인했습니다. 의사의 판단과 치료계획은 진료 화면에서 별도로 작성·승인합니다.' : '아직 의료진이 확인하지 않았습니다. 의사의 판단과 치료계획으로 해석하거나 사용하지 않습니다.'}</p></div></article>
              </div>
            </section>
            <section className="record-detailed-card" id={`current-record-${selectedPatient.lastVisit.replace(/\./g, '-')}`}>
              <header>
                <div><p className="eyebrow">QUESTIONNAIRE DETAIL</p><h2>사전 문진 상세 기록</h2><span>{editingRecord ? '환자가 작성한 문진 내용을 항목별로 수정합니다.' : '환자가 제출한 원문을 바탕으로 항목별 확인 내용을 표시합니다.'}</span></div>
                <b>{editingRecord ? '항목별 수정 중' : selectedPatient.questionnaireStatus === 'REVIEWED' ? '의료진 검토 완료' : '의료진 미검토'}</b>
              </header>
              <div className="clinical-detail-table">
                <div className="clinical-detail-table-head"><span>기록 항목</span><span>{editingRecord ? '수정할 내용' : '상세 내용'}</span></div>
                {(editingRecord ? questionnaireDraftFields : selectedPatient.clinicalDetails).map((detail, index) => <div className={editingRecord ? 'clinical-detail-row editing' : 'clinical-detail-row'} key={`${detail.label}-${index}`}><strong>{detail.label}</strong>{editingRecord ? <AutoResizeTextarea value={detail.value} onChange={(event) => updateQuestionnaireDraftField(index, event.target.value)} aria-label={`${detail.label} 수정`} /> : <p>{detail.value}</p>}</div>)}
              </div>
              {editingRecord ? <footer className="questionnaire-inline-edit-footer"><span>문진 수정 내용도 위의 ‘전체 저장’ 버튼으로 함께 저장됩니다.</span></footer> : <footer><span>문진 제출일 <b>{selectedPatient.lastVisit}</b></span><span>작성 주체 <b>환자 또는 보호자</b></span><span>의료진 확인 <b>{selectedPatient.approvedAt}</b></span></footer>}
            </section>
            {!hasClinicianRecord && <section className="questionnaire-clinical-boundary"><i>진료</i><div><strong>의료진 확정 진료기록은 아직 없습니다</strong><p>아래의 SOAP·검사·치료계획 영역은 진료를 시작하고 의료진이 작성·최종 승인한 뒤 생성됩니다.</p></div><button onClick={() => onStartEncounter(selectedPatient)}>이 문진으로 진료 시작 →</button></section>}
            <div className={hasClinicianRecord ? 'clinician-record-sections' : 'clinician-record-sections empty'}>
            <div className={`record-history-grid ${selectedPatient.courseSummary.length && selectedPatient.previousRecords.length ? '' : 'single'}`}>
              {selectedPatient.courseSummary.length > 0 && (
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
              )}
              {selectedPatient.previousRecords.length > 0 && (
              <section className="previous-records-card">
                <header><div><p className="eyebrow">SOURCE RECORDS</p><h2>날짜별 이전 진료 원본</h2></div><span>눌러서 상세 확인</span></header>
                <div className="previous-record-list">
                  {selectedPatient.previousRecords.map((record) => {
                    const draft = historicalClinicalDrafts[record.recordId];
                    return (
                    <details key={record.date} open id={`previous-record-${record.date.replace(/\./g, '-')}`}>
                      <summary><span><time>{record.date}</time><b>{record.visitType}</b></span><strong>{record.chiefComplaint}</strong><em>원본 기록 보기</em></summary>
                      <dl>
                        <div><dt>주호소</dt><dd>{editingRecord && draft ? <AutoResizeTextarea value={draft.soap.S} onChange={(event) => updateHistoricalSoapDraft(record.recordId, 'S', event.target.value)} aria-label={`${record.date} 주호소 수정`} /> : record.chiefComplaint}</dd></div>
                        <div><dt>객관적 소견</dt><dd>{editingRecord && draft ? <AutoResizeTextarea value={draft.soap.O} onChange={(event) => updateHistoricalSoapDraft(record.recordId, 'O', event.target.value)} aria-label={`${record.date} 객관적 소견 수정`} /> : record.objective}</dd></div>
                        <div><dt>평가·진단</dt><dd>{editingRecord && draft ? <AutoResizeTextarea value={draft.soap.A} onChange={(event) => updateHistoricalSoapDraft(record.recordId, 'A', event.target.value)} aria-label={`${record.date} 평가 수정`} /> : record.assessment}</dd></div>
                        <div><dt>치료·교육</dt><dd>{editingRecord && draft ? <AutoResizeTextarea value={draft.soap.P} onChange={(event) => updateHistoricalSoapDraft(record.recordId, 'P', event.target.value)} aria-label={`${record.date} 치료 계획 수정`} /> : record.treatment}</dd></div>
                      </dl>
                      <footer><span>작성·승인자</span><b>{record.clinician}</b></footer>
                    </details>
                  );})}
                </div>
              </section>
              )}
            </div>
            {(visibleExaminationRows.length > 0 || editingRecord) && <section className={`past-test-card stored-examination-card ${editingRecord ? 'editing' : ''}`}>
              <header><div><p className="eyebrow">APPROVED EXAMINATION</p><h2>정리된 검사 결과</h2></div><b>{editingRecord ? '실제 검사·EMR만 수정' : `전체 ${visibleExaminationRows.length}개 항목`}</b></header>
              <div className="organized-readable-list stored-readable-list">
                {directoryExaminationGroups.map((group) => <section className={`organized-source-group ${group.tone}`} key={group.source}>
                  <header className="organized-source-heading"><div><i>{group.rows.length}</i><span><strong>{group.label}</strong><small>{group.source}</small></span></div></header>
                  <div className={`organized-result-table ${editingRecord ? 'record-result-editing' : ''}`}><header><span>항목</span><span>정리된 내용</span></header>{group.rows.map((row, index) => {
                    const draftIndex = visibleExaminationRows.indexOf(row);
                    return <article key={`${row.source}-${index}-${draftIndex}`}>{editingRecord ? <><input value={row.title} onChange={(event) => updateExaminationDraftRow(draftIndex, 'title', event.target.value)} aria-label="검사 항목명 수정" /><AutoResizeTextarea value={row.value} onChange={(event) => updateExaminationDraftRow(draftIndex, 'value', event.target.value)} aria-label={`${row.title || '검사'} 내용 수정`} /><button onClick={() => setExaminationDraftRows((current) => current.filter((_, rowIndex) => rowIndex !== draftIndex))} aria-label={`${row.title || '검사'} 삭제`}>×</button></> : <><strong>{row.title}</strong><p>{row.value}</p></>}</article>;
                  })}</div>
                </section>)}
                {editingRecord && !directoryExaminationGroups.length && <div className="record-result-empty">등록된 실제 검사·EMR 결과가 없습니다.</div>}
              </div>
              <footer>{editingRecord ? <button className="record-result-add" onClick={() => setExaminationDraftRows((current) => [...current, { source: 'EMR 붙여넣기', title: '', value: '', status: '의료진 수정' }])}>+ 검사 항목 추가</button> : '사전 문진과 겹치지 않도록 실제 검사·EMR의 항목과 내용만 표시합니다.'}</footer>
            </section>}
            <div className={`record-detail-grid ${showCurrentAutonomic ? '' : 'single'}`}>
              <section className="past-soap-card">
                <header><div><p className="eyebrow">LATEST SOAP</p><h2>최근 SOAP 기록</h2></div><time>{editingRecord ? '항목별 수정' : selectedPatient.lastVisit}</time></header>
                <div>{(['S', 'O', 'A', 'P'] as const).map((letter) => <article className={editingRecord && selectedPatient.currentClinicalRecord ? 'editing' : ''} key={letter}><i>{letter}</i>{editingRecord && selectedPatient.currentClinicalRecord ? <AutoResizeTextarea value={soapDraft[letter]} onChange={(event) => setSoapDraft((current) => ({ ...current, [letter]: event.target.value }))} aria-label={`SOAP ${letter} 수정`} /> : <p>{selectedPatient.soap[letter]}</p>}</article>)}</div>
              </section>
              {showCurrentAutonomic && (
              <section className="autonomic-record-card">
                <header><div><p className="eyebrow">AUTONOMIC TEST</p><h2>자율신경검사</h2></div><b>{editingRecord ? '직접 수정' : selectedPatient.autonomic.comparison ? '이전 검사 비교' : '현재 검사만'}</b></header>
                <div className="autonomic-record-meta"><span>검사일</span><strong>{selectedPatient.autonomic.date}</strong></div>
                {editingRecord && selectedPatient.currentClinicalRecord ? (
                  <div className={autonomicDraftValues.hasPrevious === 'true' ? 'autonomic-comparison-table patient-autonomic-edit-table' : 'autonomic-current-table patient-autonomic-edit-table'}>
                    {autonomicDraftValues.hasPrevious === 'true' ? <header><span>지표</span><span>이전</span><span>현재</span><span>변화</span></header> : <header><span>지표</span><span>현재 결과</span><span>상태</span></header>}
                    {autonomicMetricDefinitions.map(([metric, key]) => autonomicDraftValues.hasPrevious === 'true'
                      ? <div key={key}><strong>{metric}</strong><input value={autonomicDraftValues[`${key}Previous`] ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, [`${key}Previous`]: event.target.value }))} placeholder="이전값" /><input value={autonomicDraftValues[`${key}Current`] ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, [`${key}Current`]: event.target.value }))} placeholder="현재값" /><input value={autonomicDraftValues[`${key}Change`] ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, [`${key}Change`]: event.target.value }))} placeholder="변화" /></div>
                      : <div key={key}><strong>{metric}</strong><input value={autonomicDraftValues[`${key}Current`] ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, [`${key}Current`]: event.target.value }))} placeholder="현재값" /><input value={autonomicDraftValues[`${key}Status`] ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, [`${key}Status`]: event.target.value }))} placeholder="판정" /></div>)}
                  </div>
                ) : selectedPatient.autonomic.comparison ? (
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
                {!editingRecord && selectedPatient.autonomic.comparison && <div className="autonomic-change-legend"><span><i className="improved" />기준범위에 가까워짐</span><span><i className="worsened" />기준범위에서 멀어짐</span></div>}
                <div className={`autonomic-interpretation ${editingRecord ? 'editing' : ''}`}><strong>검사 해석</strong>{editingRecord && selectedPatient.currentClinicalRecord ? <AutoResizeTextarea value={autonomicDraftValues.interpretation ?? ''} onChange={(event) => setAutonomicDraftValues((current) => ({ ...current, interpretation: event.target.value }))} aria-label="자율신경검사 해석 수정" /> : <p>{selectedPatient.autonomic.interpretation}</p>}</div>
              </section>
              )}
            </div>
            <section className="past-test-card autonomic-file-history">
              <header><div><p className="eyebrow">AUTONOMIC FILE HISTORY</p><h2>자율신경검사 이력</h2></div><b>업로드 파일 {availableAutonomicFiles.length}개</b></header>
              {availableAutonomicFiles.length ? <div>{availableAutonomicFiles.map((record) => {
                const historyValues = getHistoryAutonomicValues(record);
                const editableHistory = editingRecord && Boolean(record.sourceRecord);
                return (
                <details key={record.id} open>
                  <summary><time>{record.date}</time><div><strong>자율신경검사</strong><span>{editableHistory ? historyValues.interpretation || '검사 해석을 입력해 주세요.' : record.summary}</span><small>{record.fileName}</small></div><i>⌄</i></summary>
                  <div className="autonomic-file-history-detail">
                    <div className="autonomic-file-history-meta"><span>업로드 파일</span><strong>{record.fileName}</strong><em>{record.fileType}{record.file ? ` · ${formatFileSize(record.file.size)}` : ''}</em></div>
                    <div className={`autonomic-file-history-table ${editableHistory ? 'editing' : ''}`}><header><span>지표</span><span>결과</span><span>판정</span></header>{autonomicMetricDefinitions.map(([metric, key], index) => <div key={metric}><strong>{metric}</strong>{editableHistory ? <><input value={historyValues[`${key}Current`] ?? ''} onChange={(event) => updateHistoryAutonomicDraft(record, `${key}Current`, event.target.value)} aria-label={`${record.date} ${metric} 결과 수정`} /><input value={historyValues[`${key}Status`] ?? ''} onChange={(event) => updateHistoryAutonomicDraft(record, `${key}Status`, event.target.value)} aria-label={`${record.date} ${metric} 판정 수정`} /></> : <><span>{record.metrics[index]?.[1] ?? '-'}</span><b>{record.metrics[index]?.[2] ?? '확인 필요'}</b></>}</div>)}</div>
                    {editableHistory && <label className="autonomic-history-interpretation-edit"><strong>검사 해석</strong><AutoResizeTextarea value={historyValues.interpretation ?? ''} onChange={(event) => updateHistoryAutonomicDraft(record, 'interpretation', event.target.value)} aria-label={`${record.date} 자율신경검사 해석 수정`} /></label>}
                    {record.file && <button onClick={() => openUploadedFile(record)}>원본 파일 열기</button>}
                  </div>
                </details>
              );})}</div> : <div className="autonomic-file-empty"><strong>업로드된 자율신경검사 파일이 없습니다</strong><span>진료 중 검사파일을 업로드하고 최종 승인하면 이곳에 표시됩니다.</span></div>}
              <footer><span>{editingRecord ? '승인된 자율신경검사 이력은 항목별로 수정할 수 있으며, 기존 승인본은 개정 이력에 보존됩니다.' : '업로드된 자율신경검사 파일과 파일에서 정리한 결과만 표시됩니다.'}</span></footer>
            </section>
            {editingRecord && <div className="patient-record-edit-bar bottom"><span><strong>수정 내용을 모두 확인하셨나요?</strong><small>전체 저장 시 현재 기록과 수정한 과거 이력이 함께 반영됩니다.</small></span><div><button className="questionnaire-edit-cancel" onClick={cancelPatientRecordEdit}>취소</button><button className="questionnaire-edit-save" onClick={() => void savePatientRecord()} disabled={reviewingId === selectedPatient.questionnaireId}>{reviewingId === selectedPatient.questionnaireId ? '저장 중…' : '전체 저장'}</button></div></div>}
            </div>
          </article>
        )}
      </div>
      {showPatientGuide && patientGuide && <PatientGuideModal {...patientGuide} onClose={() => setShowPatientGuide(false)} onPrint={printPatientGuide} />}
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

function AudioStep({ stepNumber, encounterType, selectedFile, recording, recordingStarted, recordingSeconds, microphoneState, microphoneLabel, microphoneError, onSelectedFileChange, onToggleRecording, onCheckMicrophone }: { stepNumber: number; encounterType: EncounterType; selectedFile: File | null; recording: boolean; recordingStarted: boolean; recordingSeconds: number; microphoneState: MicrophoneState; microphoneLabel: string; microphoneError: string; onSelectedFileChange: (file: File | null) => void; onToggleRecording: () => void | Promise<void>; onCheckMicrophone: () => void | Promise<void> }) {
  const fileExtension = selectedFile?.name.split('.').pop()?.toUpperCase() || 'AUDIO';
  const recordingStatus = recording ? '녹음 중' : recordingStarted ? '녹음 완료' : '대기';
  const microphoneStatus = microphoneState === 'recording' ? '마이크 사용 중'
    : microphoneState === 'available' ? '마이크 연결됨'
      : microphoneState === 'checking' ? '마이크 확인 중'
        : microphoneState === 'requesting' ? '권한 요청 중'
          : microphoneState === 'denied' ? '마이크 권한 차단됨'
            : microphoneState === 'unavailable' ? '마이크를 찾지 못함' : '보안 연결 필요';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · AUDIO INPUT</p><h2>진료 녹음 입력</h2><span>{encounterType === 'new' ? '실시간으로 진료를 녹음하거나, 진료 후 스마트폰·녹음기의 파일을 바로 추가할 수 있습니다.' : '오늘 진료의 실시간 녹음과 녹음파일을 기존 환자기록과 함께 차트 근거로 사용할 수 있습니다.'}</span></div></header>
      <div className="audio-to-chart-route"><span><i>1</i>진료 녹음·파일</span><b>→</b><span><i>2</i>검사자료 확인</span><b>→</b><span><i>3</i>SOAP 직접 작성</span><b>→</b><span><i>4</i>최종 검토·승인</span></div>
      <section className="soap-generation-notice" aria-label="SOAP 생성 방식 안내">
        <i>AI</i>
        <div><strong>현재는 녹음 후 SOAP가 자동으로 작성되지 않습니다</strong><p>녹음은 진료기록의 근거 파일로 연결됩니다. 자동 초안을 사용하려면 음성 전사(STT)와 의료 문서 AI를 추가로 연동해야 하며, 현재 화면에서는 의료진이 SOAP를 직접 작성합니다.</p></div>
        <span>직접 작성</span>
      </section>
      <div className="audio-flow-layout">
        <section className="audio-input-panel live-audio-card">
          <header><div><p className="eyebrow">LIVE RECORDING</p><h3>실시간 녹음</h3></div><span>{recordingStatus}</span></header>
          <div className={`microphone-check ${microphoneState}`}><i aria-hidden="true" /><span><strong>{microphoneStatus}</strong><small>{microphoneError || microphoneLabel || '데스크톱에 연결된 오디오 입력 장치를 확인합니다.'}</small></span><button disabled={recording || microphoneState === 'requesting'} onClick={onCheckMicrophone}>다시 확인</button></div>
          <div className="live-recorder">
            <span className={recording ? 'record-orb active' : 'record-orb'}><i /></span>
            <div><p className="eyebrow">RECORDING TIME</p><strong>{formatRecordingTime(recordingSeconds)}</strong><small>{recording ? '진료 음성을 실제 녹음파일로 기록하고 있습니다' : recordingStarted ? '녹음파일이 오른쪽 파일 영역에 연결되었습니다' : '녹음 시작을 누르면 브라우저가 마이크 권한을 요청합니다'}</small></div>
            <button disabled={microphoneState === 'checking' || microphoneState === 'requesting' || microphoneState === 'unsupported'} onClick={onToggleRecording}>{recording ? '녹음 중지·저장' : recordingStarted ? '새 녹음 시작' : '녹음 시작'}</button>
          </div>
          <div className="audio-wave" aria-hidden="true">{[18,34,22,48,29,56,31,40,21,51,37,26,45,20,33,49,25,38,17,30,42,27,50,22].map((height, index) => <i style={{ height: recording ? height : 3 }} key={index} />)}</div>
        </section>
        <section className="audio-input-panel upload-audio-card">
          <header><div><p className="eyebrow">AUDIO FILE</p><h3>녹음파일 업로드</h3></div><span>{selectedFile ? '파일 연결됨' : '선택 대기'}</span></header>
          {!selectedFile ? (
            <div className="flow-dropzone"><i /><strong>진료 후 녹음파일 넣기</strong><span>스마트폰·녹음기 파일 · M4A · MP3 · WAV · AAC</span><label><input type="file" accept=".m4a,.mp3,.wav,.aac,audio/*" onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)} /><b>녹음파일 선택</b></label><small>현재는 파일을 진료기록 근거로 연결합니다. STT·AI 연동 후에는 이 파일로 SOAP 초안을 만들 수 있습니다.</small></div>
          ) : (
            <div className="flow-file-selected"><i>{fileExtension}</i><div><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} · {selectedFile.type || 'MIME type 확인 필요'}</span><small>이 파일은 최종 진료기록의 근거로 연결되며, SOAP는 다음 단계에서 직접 작성합니다.</small></div><button onClick={() => onSelectedFileChange(null)}>×</button></div>
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
  existingResults,
  autonomicFile,
  hasPrevious,
  onChartTextChange,
  onAutonomicFileChange,
  onPreviousChange,
}: {
  stepNumber: number;
  encounterType: EncounterType | null;
  chartText: string;
  existingResults: [string, string, string][];
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  onChartTextChange: (value: string) => void;
  onAutonomicFileChange: (file: File | null) => void;
  onPreviousChange: (value: boolean | null) => void;
}) {
  const pastedSections = organizeClinicalText(chartText);
  const existingRows = existingResults.map(([title, value, status], index) => ({
    id: `existing-${index}`,
    source: '기존 기록' as const,
    title,
    value,
    status,
  }));
  const pastedRows = pastedSections.map((section, index) => ({
    id: `emr-${index}`,
    source: 'EMR 붙여넣기' as const,
    title: section.title,
    value: section.lines.join('\n'),
    status: '원문 기반 정리',
  }));
  const organizedRows = [...existingRows, ...pastedRows];
  const organizedGroups = [
    { source: '기존 기록', label: '이전 승인 기록', description: '의료진이 이전 진료에서 확정한 검사 결과', tone: 'existing', rows: existingRows },
    { source: 'EMR 붙여넣기', label: '이번에 추가한 검사', description: '붙여넣은 원문에서 항목별로 정리한 결과', tone: 'emr', rows: pastedRows },
  ].filter((group) => group.rows.length > 0);
  const organized = organizedRows.length > 0;
  const isFirstVisit = encounterType !== 'followup';

  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · EXAMINATION INPUT</p><h2>{isFirstVisit ? '검사자료 보완' : '이전 검사자료 확인'}</h2><span>{isFirstVisit ? '초진 녹음 후 실제로 시행한 검사가 있을 때만 결과를 추가합니다. 검사자료가 없으면 건너뛸 수 있습니다.' : '이전 검사 차트는 복사·붙여넣기하고 자율신경검사는 파일로 입력하여 오늘 진료와 비교합니다.'}</span></div><span className="step-status">{isFirstVisit ? '선택 입력' : '자료 입력 대기'}</span></header>

      <div className="test-input-grid">
        <section className="chart-paste-card">
          <header><div><p className="eyebrow">COPY & PASTE</p><h3>{isFirstVisit ? '진료 중·진료 후 시행한 검사 결과' : '환자 상태 관련 이전 검사 차트'}</h3></div><span>{isFirstVisit ? '자료가 있을 때만' : 'EMR에서 복사'}</span></header>
          <div className="chart-paste-body">
            <label><strong>{isFirstVisit ? '검사 결과가 있으면 원문 붙여넣기' : '검사 차트 원문 붙여넣기'}</strong><span>{isFirstVisit ? '이번 진료에서 확인된 검사명, 결과값, 단위와 판정 내용을 추가합니다.' : 'EMR 차트의 검사명, 결과값, 단위, 판정 내용을 그대로 붙여넣습니다.'}</span><textarea className="emr-paste-textarea" rows={11} value={chartText} onChange={(event) => onChartTextChange(event.target.value)} placeholder={isFirstVisit ? '초진 검사 결과가 있을 때 이곳에 붙여넣으세요.\n검사가 없다면 입력하지 않고 다음 단계로 이동합니다.' : '이전 검사 차트 내용을 이곳에 붙여넣으세요.\n검사명 · 결과값 · 단위 · Reference Range · 판정 등이 포함됩니다.'} /></label>
            <div className="chart-input-actions"><small>{isFirstVisit ? '검사자료가 없어도 녹음 기반 진료차트는 작성할 수 있습니다.' : '붙여넣은 원문은 이 입력란에 그대로 보존됩니다.'}</small><span className={pastedRows.length ? 'auto-organize-status complete' : 'auto-organize-status'}>{pastedRows.length ? 'EMR 정리 완료 ✓' : '입력 시 자동 정리'}</span></div>
          </div>
        </section>

        <section className="organized-chart-card">
          <header><div><p className="eyebrow">READABLE CHART</p><h3>정리된 검사 결과</h3></div><span>{organized ? `전체 ${organizedRows.length}개 항목` : '입력 대기'}</span></header>
          {!organized ? (
            <div className="organized-empty"><i /><strong>{isFirstVisit ? '추가할 검사자료가 없다면 건너뛰세요' : '검사 차트를 붙여넣어 주세요'}</strong><span>{isFirstVisit ? '검사자료가 없어도 다음 단계에서 의료진이 SOAP를 직접 작성할 수 있습니다.' : '검사 항목별 카드로 분리하여 의료진이 빠르게 읽을 수 있게 표시합니다.'}</span></div>
          ) : (
            <div className="organized-text-result">
              <div className="organized-result-guide"><i>✓</i><span><strong>항목과 정리된 내용을 한눈에 확인하세요</strong><small>자료 출처별로 구분하되 판정 배지와 중복 정보는 줄였습니다.</small></span></div>
              <div className="organized-readable-list">
                {organizedGroups.map((group) => (
                  <section className={`organized-source-group ${group.tone}`} key={group.source}>
                    <header className="organized-source-heading"><div><i>{group.rows.length}</i><span><strong>{group.label}</strong><small>{group.description}</small></span></div><b>{group.source}</b></header>
                    <div className="organized-result-table">
                      <header><span>항목</span><span>정리된 내용</span></header>
                      {group.rows.map((row) => <article key={row.id}><strong>{row.title}</strong><p>{row.value || '입력된 결과값이 없습니다.'}</p></article>)}
                    </div>
                  </section>
                ))}
              </div>
              <footer>붙여넣은 전체 원문은 왼쪽 입력란에 그대로 보존됩니다.</footer>
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

function SoapStep({ stepNumber, values, hasAudio, hasQuestionnaire, hasTests, onChange }: { stepNumber: number; values: Record<string, string>; hasAudio: boolean; hasQuestionnaire: boolean; hasTests: boolean; onChange: (letter: string, value: string) => void }) {
  return (
    <div className="step-surface">
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · DOCTOR REVIEW</p><h2>SOAP 직접 작성</h2><span>연결된 환자 문진과 녹음, 검사자료를 참고하여 의료진이 차트를 작성·검토합니다.</span></div><span className="step-status">AI 자동생성 미연결</span></header>
      <section className="soap-generation-notice compact" aria-label="SOAP 작성 안내">
        <i>직접</i>
        <div><strong>녹음이 자동으로 텍스트나 SOAP로 변환되지는 않습니다</strong><p>아래 입력란에 의료진이 직접 작성해 주세요. 추후 STT·의료 문서 AI를 연동하면 초안을 먼저 만들고 의료진이 검토·수정하는 흐름으로 확장할 수 있습니다.</p></div>
      </section>
      <div className="soap-flow-layout">
        <section className="soap-editor-card">
          <header><div><p className="eyebrow">STRUCTURED SOAP</p><h3>SOAP 작성란</h3></div><span>의료진 직접 입력</span></header>
          <div className="flow-soap-fields">
            {soapDefinitions.map(([letter, label, placeholder]) => <label key={letter}><i className={`soap-${letter.toLowerCase()}`}>{letter}</i><span><strong>{label}</strong><AutoResizeTextarea value={values[letter]} onChange={(event) => onChange(letter, event.target.value)} placeholder={placeholder} /></span></label>)}
          </div>
        </section>
        <aside className="evidence-panel">
          <header><div><p className="eyebrow">SOURCE CHECK</p><h3>현재 연결된 자료</h3></div><span>작성 전 확인</span></header>
          <div className="soap-source-statuses">
            <span className={hasAudio ? 'connected' : ''}><i>{hasAudio ? '✓' : '—'}</i><strong>진료 녹음</strong><small>{hasAudio ? '근거 파일 연결됨' : '연결된 파일 없음'}</small></span>
            <span className={hasQuestionnaire ? 'connected' : ''}><i>{hasQuestionnaire ? '✓' : '—'}</i><strong>환자 문진</strong><small>{hasQuestionnaire ? '환자 작성 내용 연결됨' : '연결된 문진 없음'}</small></span>
            <span className={hasTests ? 'connected' : ''}><i>{hasTests ? '✓' : '—'}</i><strong>검사자료</strong><small>{hasTests ? '확인할 결과 있음' : '추가된 결과 없음'}</small></span>
          </div>
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
  clinician,
  soapValues,
  chartText,
  existingResults,
  audioFile,
  autonomicFile,
  hasPrevious,
  autonomicValues,
  onSoapChange,
  onChartTextChange,
  onAutonomicChange,
  onApprove,
  onFinishWithoutPdf,
}: {
  stepNumber: number;
  approved: boolean;
  patient: PatientRecord | null;
  clinician: string;
  soapValues: Record<string, string>;
  chartText: string;
  existingResults: [string, string, string][];
  audioFile: File | null;
  autonomicFile: File | null;
  hasPrevious: boolean | null;
  autonomicValues: Record<string, string>;
  onSoapChange: (letter: string, value: string) => void;
  onChartTextChange: (value: string) => void;
  onAutonomicChange: (key: string, value: string) => void;
  onApprove: () => Promise<void>;
  onFinishWithoutPdf: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showPdfChoice, setShowPdfChoice] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const printAfterOpeningRef = useRef(false);
  const finishAfterPrintRef = useRef(false);
  const pastedChartRows = organizeClinicalText(chartText).map((section, pastedIndex) => ({
    id: `emr-${pastedIndex}`,
    source: 'EMR 붙여넣기' as const,
    label: section.title,
    value: section.lines.join('\n'),
    status: '수정 가능',
    pastedIndex,
  }));
  const existingChartRows = existingResults.map(([label, value, status], index) => ({
    id: `existing-${index}`,
    source: '기존 기록' as const,
    label,
    value,
    status: status || '저장된 결과',
    pastedIndex: null,
  }));
  const finalChartRows = [...existingChartRows, ...pastedChartRows];
  const finalResultGroups = [
    { source: '기존 기록', label: '이전 승인 기록', tone: 'existing', rows: existingChartRows },
    { source: 'EMR 붙여넣기', label: '이번에 추가한 검사', tone: 'emr', rows: pastedChartRows },
  ].filter((group) => group.rows.length > 0);
  const updateChartRow = (pastedIndex: number, value: string) => {
    const updated = pastedChartRows.map((row) => row.pastedIndex === pastedIndex ? { ...row, value } : row);
    onChartTextChange(updated.map((row) => `${row.label}:\n${row.value}`).join('\n\n'));
  };
  const autonomicSummary = describeAutonomicReport(Boolean(autonomicFile), hasPrevious);
  const editableAutonomicSummary = autonomicValues.interpretation?.trim() || autonomicSummary;
  const reportAutonomicMetrics = buildAutonomicReportMetrics(autonomicValues, hasPrevious === true);
  const reportDate = formatPrintDate();
  const reportTitle = `${patient?.name ?? '환자'}_${patient?.id ?? '진료'}_종합진료안내서`;
  const printReport = () => printDocument('printing-patient-guide', reportTitle);
  const showReport = () => {
    if (approved) {
      printAfterOpeningRef.current = true;
      finishAfterPrintRef.current = false;
    }
    setShowPreview(true);
  };
  const closeReport = () => {
    printAfterOpeningRef.current = false;
    finishAfterPrintRef.current = false;
    setShowPreview(false);
  };
  const finishApprovedEncounter = () => {
    setShowPdfChoice(false);
    setShowPreview(false);
    printAfterOpeningRef.current = false;
    finishAfterPrintRef.current = false;
    onFinishWithoutPdf();
  };
  const printApprovedEncounter = () => {
    setShowPdfChoice(false);
    finishAfterPrintRef.current = true;
    printAfterOpeningRef.current = true;
    setShowPreview(true);
  };
  const approveAndChooseNext = async () => {
    setApproving(true);
    setApprovalError('');
    try {
      await onApprove();
      setShowPdfChoice(true);
    } catch (reason) {
      setApprovalError(reason instanceof Error ? reason.message : '최종 진료기록을 저장하지 못했습니다.');
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    if (!approved || !showPreview || !printAfterOpeningRef.current) return;
    printAfterOpeningRef.current = false;
    const shouldFinishAfterPrint = finishAfterPrintRef.current;
    finishAfterPrintRef.current = false;
    const frame = window.requestAnimationFrame(() => printDocument('printing-patient-guide', reportTitle, shouldFinishAfterPrint ? () => {
      setShowPreview(false);
      onFinishWithoutPdf();
    } : undefined));
    return () => window.cancelAnimationFrame(frame);
  }, [approved, onFinishWithoutPdf, reportTitle, showPreview]);

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
                {autonomicMetricDefinitions.map(([metric, key]) => <div key={key}><strong>{metric}</strong><input disabled={approved} value={autonomicValues[`${key}Previous`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Previous`, event.target.value)} placeholder="이전값" /><input disabled={approved} value={autonomicValues[`${key}Current`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Current`, event.target.value)} placeholder="현재값" /><input disabled={approved} value={autonomicValues[`${key}Change`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Change`, event.target.value)} placeholder="변화량" /></div>)}
              </div>
            ) : (
              <div className="autonomic-current-table final-autonomic-table">
                <header><span>지표</span><span>현재 결과</span><span>상태</span></header>
                {autonomicMetricDefinitions.map(([metric, key]) => <div key={key}><strong>{metric}</strong><input disabled={approved} value={autonomicValues[`${key}Current`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Current`, event.target.value)} placeholder="현재값" /><input disabled={approved} value={autonomicValues[`${key}Status`] ?? ''} onChange={(event) => onAutonomicChange(`${key}Status`, event.target.value)} placeholder="정상·경계·높음" /></div>)}
              </div>
            )}
            <label className="final-autonomic-interpretation"><strong>검사 해석</strong><AutoResizeTextarea disabled={approved} value={autonomicValues.interpretation ?? ''} onChange={(event) => onAutonomicChange('interpretation', event.target.value)} placeholder={autonomicSummary} /></label>
          </section>
        </div>
        <section className="past-test-card final-test-editor">
          <header><div><p className="eyebrow">EXAMINATION</p><h2>정리된 검사 결과</h2></div><b>전체 {finalChartRows.length}개 항목</b></header>
          {finalChartRows.length ? (
            <div className="final-test-results">
              <div className="organized-result-guide"><i>✓</i><span><strong>항목별 최종 내용을 확인하세요</strong><small>이번에 추가한 검사 내용은 승인 전까지 직접 수정할 수 있습니다.</small></span></div>
              <div className="organized-readable-list final-readable-list">
                {finalResultGroups.map((group) => (
                  <section className={`organized-source-group ${group.tone}`} key={group.source}>
                    <header className="organized-source-heading"><div><i>{group.rows.length}</i><span><strong>{group.label}</strong><small>{group.source}</small></span></div><b>{approved ? '승인 완료' : group.tone === 'emr' ? '수정 가능' : '원본 확인'}</b></header>
                    <div className="organized-result-table editable">
                      <header><span>항목</span><span>정리된 내용</span></header>
                      {group.rows.map((row) => (
                      <article key={row.id}>
                        <strong>{row.label}</strong>
                        <AutoResizeTextarea disabled={approved || row.pastedIndex === null} value={row.value} onChange={(event) => row.pastedIndex !== null && updateChartRow(row.pastedIndex, event.target.value)} aria-label={`${row.label} 내용 ${row.pastedIndex === null ? '확인' : '수정'}`} />
                      </article>
                    ))}</div>
                  </section>
                ))}
              </div>
            </div>
          ) : <div className="final-test-empty"><strong>정리된 검사 결과가 없습니다</strong><span>검사자료 보완 단계에서 내용을 입력하면 출처별 카드로 표시됩니다.</span></div>}
        </section>
      </section>
      {showPreview && <PatientGuideModal
        approved={approved}
        patientName={patient?.name ?? '캡처한 환자정보'}
        registrationNumber={patient?.id ?? '캡처 후 표시'}
        visitDate={reportDate}
        clinician={clinician}
        soapValues={soapValues}
        autonomicSummary={editableAutonomicSummary}
        autonomicFileName={autonomicFile?.name}
        autonomicMetrics={reportAutonomicMetrics}
        onClose={closeReport}
        onPrint={printReport}
      />}
      {showPdfChoice && (
        <div className="pdf-choice-backdrop">
          <section className="pdf-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-choice-title" aria-describedby="pdf-choice-description">
            <i>PDF</i>
            <div><p className="eyebrow">FINAL APPROVAL COMPLETE</p><h3 id="pdf-choice-title">환자 안내 PDF를 출력할까요?</h3><p id="pdf-choice-description">PDF를 출력하면 인쇄창을 닫은 뒤 홈으로 이동합니다. 출력하지 않아도 승인된 진료기록은 안전하게 저장되고 바로 홈으로 돌아갑니다.</p></div>
            <footer><button className="pdf-choice-skip" onClick={finishApprovedEncounter}>출력하지 않고 홈으로</button><button className="pdf-choice-print" onClick={printApprovedEncounter}>PDF 출력</button></footer>
          </section>
        </div>
      )}
      <div className="final-approval-only">
        {approvalError && <span className="final-approval-error">{approvalError}</span>}
        <button disabled={approved || approving} onClick={approveAndChooseNext}>{approved ? '최종 승인 완료' : approving ? 'H2에 안전하게 저장 중…' : '내용을 확인하고 최종 승인'} <b>✓</b></button>
      </div>
    </div>
  );
}

function ClinicalWorkspace({ nickname, onLogout }: { nickname: string; onLogout: () => Promise<void> }) {
  const [activeView, setActiveView] = useState<'home' | 'links' | 'patients' | 'encounter'>('home');
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
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('checking');
  const [microphoneLabel, setMicrophoneLabel] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [recordingPosition, setRecordingPosition] = useState<{ x: number; y: number } | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<EncounterDraft | null>(() => typeof window === 'undefined' ? null : readEncounterDraft());
  const [deferredDraft, setDeferredDraft] = useState<EncounterDraft | null>(null);
  const [deferredDraftPosition, setDeferredDraftPosition] = useState<{ x: number; y: number } | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const recordingWidgetRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const deferredDraftWidgetRef = useRef<HTMLDivElement>(null);
  const questionnaireLoadPromiseRef = useRef<Promise<void> | null>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [clinicalRecords, setClinicalRecords] = useState<PdClinicalRecord[]>([]);
  const [questionnairesLoading, setQuestionnairesLoading] = useState(true);
  const [questionnairesError, setQuestionnairesError] = useState('');

  const loadQuestionnaires = useCallback(async (silent = false, refreshAfterCurrent = false) => {
    const activeLoad = questionnaireLoadPromiseRef.current;
    if (activeLoad) {
      await activeLoad;
      if (!refreshAfterCurrent) return;
    }
    const loadStartedWhileWaiting = questionnaireLoadPromiseRef.current;
    if (loadStartedWhileWaiting) {
      await loadStartedWhileWaiting;
      return;
    }
    const task = (async () => {
      if (!silent) setQuestionnairesLoading(true);
      try {
        const [questionnaireResult, clinicalRecordResult] = await Promise.allSettled([
          pdApi.questionnaires(),
          pdApi.clinicalRecords(),
        ]);
        if (questionnaireResult.status === 'rejected') throw questionnaireResult.reason;
        setQuestionnaires(questionnaireResult.value);
        if (clinicalRecordResult.status === 'fulfilled') {
          setClinicalRecords(clinicalRecordResult.value);
          setQuestionnairesError('');
        } else if (!(clinicalRecordResult.reason instanceof ApiError && clinicalRecordResult.reason.status === 404)) {
          setQuestionnairesError(clinicalRecordResult.reason instanceof Error ? clinicalRecordResult.reason.message : '승인된 진료기록을 불러오지 못했습니다.');
        } else {
          setClinicalRecords([]);
          setQuestionnairesError('');
        }
      } catch (reason) {
        setQuestionnairesError(reason instanceof Error ? reason.message : '제출 문진을 불러오지 못했습니다.');
      } finally {
        if (!silent) setQuestionnairesLoading(false);
      }
    })();
    questionnaireLoadPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (questionnaireLoadPromiseRef.current === task) questionnaireLoadPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadQuestionnaires(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadQuestionnaires]);

  useEffect(() => {
    if (activeView !== 'patients') return;
    const synchronize = () => {
      if (document.visibilityState === 'visible') void loadQuestionnaires(true);
    };
    const initialSync = window.setTimeout(synchronize, 0);
    const events = new EventSource(pdApi.questionnaireEventsUrl, { withCredentials: true });
    events.addEventListener('questionnaire-changed', synchronize);
    events.onerror = () => events.close();
    const fallbackInterval = window.setInterval(synchronize, 30_000);
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      events.close();
      window.clearTimeout(initialSync);
      window.clearInterval(fallbackInterval);
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [activeView, loadQuestionnaires]);

  const patientRecords = questionnaires.map((questionnaire) => questionnaireToPatientRecord(
    questionnaire,
    clinicalRecords.filter((record) => record.patientId === questionnaire.patientId),
  ));
  const reviewQuestionnaire = async (id: string, chart: string, version: number) => {
    try {
      const reviewed = await pdApi.review(id, { chart, version });
      setQuestionnaires((current) => current.map((item) => item.id === reviewed.id ? reviewed : item));
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 409) throw reason;
      await loadQuestionnaires(true, true);
      throw new Error('다른 화면에서 문진이 변경되었습니다. 최신 내용을 불러왔으니 다시 확인해 주세요.');
    }
  };
  const updateClinicalRecord = async (questionnaireId: string, body: ClinicalRecordPayload) => {
    const saved = await pdApi.approveClinicalRecord(questionnaireId, body);
    setClinicalRecords((current) => [saved, ...current.filter((record) => record.id !== saved.id)]);
  };

  const flowSteps = encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
  const encounterLabel = selectedPatient?.questionnaireId ? '문진 기반 진료' : encounterType === 'new' ? '초진' : '재진';
  const currentIndex = flowSteps.findIndex((step) => step.id === activeStep);
  const resetScroll = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  const goHome = () => { setActiveView('home'); resetScroll(); };
  const openQuestionnaireLinks = () => { setActiveView('links'); resetScroll(); };
  const openPatientDirectory = () => { setActiveView('patients'); resetScroll(); };
  const startQuestionnaireEncounter = (patient: PatientRecord) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    else stopMicrophoneStream();
    setSelectedPatient(patient);
    setEncounterType('followup');
    setApproved(false);
    setEmrCaptured(true);
    setSoapValues({ ...patient.soap });
    setChartText('');
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

  const stopMicrophoneStream = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
  }, []);

  const checkMicrophone = useCallback(async () => {
    setMicrophoneError('');
    if (!window.isSecureContext) {
      setMicrophoneState('unsupported');
      setMicrophoneLabel('데스크톱에서 http://localhost:5173 주소로 접속하거나 HTTPS를 사용해 주세요.');
      return;
    }
    if (!navigator.mediaDevices?.enumerateDevices || typeof MediaRecorder === 'undefined') {
      setMicrophoneState('unsupported');
      setMicrophoneLabel('이 브라우저는 마이크 녹음을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.');
      return;
    }
    setMicrophoneState('checking');
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      if (!microphones.length) {
        setMicrophoneState('unavailable');
        setMicrophoneLabel('운영체제에서 인식된 마이크가 없습니다. 연결 상태와 Windows 소리 설정을 확인해 주세요.');
        return;
      }
      setMicrophoneState('available');
      setMicrophoneLabel(microphones.find((device) => device.label)?.label || `오디오 입력 장치 ${microphones.length}개 감지 · 녹음 시작 시 권한 확인`);
    } catch (reason) {
      setMicrophoneState('unavailable');
      setMicrophoneError(reason instanceof Error ? reason.message : '마이크 장치를 확인하지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkMicrophone(), 0);
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return () => window.clearTimeout(initialCheck);
    const handleDeviceChange = () => void checkMicrophone();
    devices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      window.clearTimeout(initialCheck);
      devices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [checkMicrophone]);

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopMicrophoneStream();
  }, [stopMicrophoneStream]);

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

  const toggleRecording = async () => {
    const activeRecorder = mediaRecorderRef.current;
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      activeRecorder.stop();
      setRecording(false);
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      await checkMicrophone();
      return;
    }
    setMicrophoneState('requesting');
    setMicrophoneError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      microphoneStreamRef.current = stream;
      const supportedType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const mimeType = recorder.mimeType || supportedType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
          setAudioFile(new File([blob], `진료녹음_${timestamp}.${extension}`, { type: mimeType, lastModified: Date.now() }));
        }
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        setMicrophoneState('available');
        stopMicrophoneStream();
      });
      recorder.addEventListener('error', () => {
        setMicrophoneState('unavailable');
        setMicrophoneError('녹음 중 오류가 발생했습니다. 마이크 연결 상태를 확인해 주세요.');
        setRecording(false);
        stopMicrophoneStream();
      });
      recorder.start(1000);
      setRecordingSeconds(0);
      setRecordingStarted(true);
      setRecording(true);
      setMicrophoneState('recording');
      const activeTrack = stream.getAudioTracks()[0];
      setMicrophoneLabel(activeTrack?.label || '기본 마이크');
    } catch (reason) {
      stopMicrophoneStream();
      const permissionDenied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError');
      setMicrophoneState(permissionDenied ? 'denied' : 'unavailable');
      setMicrophoneError(permissionDenied
        ? '브라우저에서 마이크 권한이 차단되었습니다. 주소창의 사이트 권한에서 마이크를 허용해 주세요.'
        : reason instanceof Error ? reason.message : '마이크를 시작하지 못했습니다.');
    }
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      else stopMicrophoneStream();
      setRecording(false);
      setDraftPrompt(null);
      setDeferredDraft(draft);
      setDraftSaveState('saved');
    } catch {
      setDraftSaveState('error');
    }
  };
  const restoreEncounterDraft = (draft: EncounterDraft) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    else stopMicrophoneStream();
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
  const approveEncounter = async () => {
    if (!selectedPatient) throw new Error('최종 승인할 환자 문진을 선택해 주세요.');
    const structuredResults = [
      ...selectedPatient.tests.map(([title, value, status]) => ({
        source: '기존 기록', title, value, status,
      })),
      ...organizeClinicalText(chartText).map((section) => ({
        source: 'EMR 붙여넣기',
        title: section.title,
        value: section.lines.join('\n'),
        status: '의료진 최종 승인',
      })),
    ];
    try {
      await pdApi.approveClinicalRecord(selectedPatient.questionnaireId, {
        rawExaminationText: chartText,
        structuredResults,
        soap: {
          subjective: soapValues.S ?? '',
          objective: soapValues.O ?? '',
          assessment: soapValues.A ?? '',
          plan: soapValues.P ?? '',
        },
        autonomic: {
          ...autonomicValues,
          hasPrevious: hasPreviousAutonomic === true ? 'true' : 'false',
          interpretation: autonomicValues.interpretation?.trim()
            || describeAutonomicReport(Boolean(autonomicFile), hasPreviousAutonomic),
        },
        audioFileName: audioFile?.name ?? null,
        autonomicFileName: autonomicFile?.name ?? null,
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        throw new Error('현재 실행 중인 백엔드가 이전 버전입니다. Docker 백엔드를 최신 이미지로 다시 실행한 뒤 승인해 주세요.');
      }
      throw reason;
    }
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
    await loadQuestionnaires(false, true);
  };
  const finishEncounterToHome = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    else stopMicrophoneStream();
    setActiveView('home');
    setActiveStep('emr');
    setEncounterStarted(false);
    setSelectedPatient(null);
    setEncounterType('new');
    setApproved(false);
    setEmrCaptured(false);
    setSoapValues({ S: '', O: '', A: '', P: '' });
    setChartText('');
    setAudioFile(null);
    setAutonomicFile(null);
    setHasPreviousAutonomic(null);
    setAutonomicValues({});
    setRecording(false);
    setRecordingStarted(false);
    setRecordingSeconds(0);
    setRecordingPosition(null);
    setDraftSaveState('idle');
    resetScroll();
  };
  const patientName = selectedPatient?.name ?? '새 환자';
  const patientMeta = selectedPatient ? `${selectedPatient.gender}${selectedPatient.age ? ` · ${selectedPatient.age}세` : ''} · ${selectedPatient.id}` : 'EMR 환자정보 캡처 대기';
  const nextStep = flowSteps[currentIndex + 1];
  const nextButtonLabels: Record<StepId, string> = {
    emr: '환자정보 확인으로',
    tests: '검사자료 확인으로',
    audio: '진료 녹음으로',
    soap: 'SOAP 직접 작성으로',
    final: '최종 확인으로',
  };
  const nextButtonLabel = nextStep ? nextButtonLabels[nextStep.id] : '';

  return (
    <main className="flow-app">
      <aside className="flow-rail">
        <button className="flow-brand" onClick={goHome} aria-label="홈">M</button>
        <button className={activeView === 'home' ? 'flow-home-button active' : 'flow-home-button'} onClick={goHome}><i /><span>홈</span></button>
        <button className={activeView === 'links' ? 'patient-records-button active' : 'patient-records-button'} onClick={openQuestionnaireLinks}><i>링크</i><span>문진 전송</span></button>
        <button className={activeView === 'patients' ? 'patient-records-button active' : 'patient-records-button'} onClick={openPatientDirectory}><i>기록</i><span>제출 문진</span></button>
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
            {activeView === 'encounter' ? <div className="active-patient-mini"><i>환자</i><span><strong>{patientName}</strong><small>{patientMeta}</small></span><b>{encounterLabel}</b></div> : <div className="topbar-idle"><i>✓</i><span>{activeView === 'patients' ? '제출 문진 · 환자 기록 조회' : activeView === 'links' ? '1회용 사전 문진 링크 전송' : '환자 데이터 보호 적용'}</span></div>}
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
                <div><strong>{recording ? '녹음 중' : '녹음파일 생성 완료'}</strong><small>{formatRecordingTime(recordingSeconds)} · {patientName}</small></div>
                <button onClick={toggleRecording} aria-label={recording ? '녹음 중지 및 저장' : '새 녹음 시작'}>{recording ? '중지·저장' : '새 녹음'}</button>
              </div>
            )}
          </div>
        </header>

        {activeView === 'home' && <HomeScreen onSendQuestionnaire={openQuestionnaireLinks} onOpenPatients={openPatientDirectory} />}
        {activeView === 'links' && <div className="pd-module-view pd-scope"><Links /></div>}
        {activeView === 'patients' && <PatientDirectory records={patientRecords} loading={questionnairesLoading} error={questionnairesError} onReload={() => void loadQuestionnaires(false, true)} onReview={reviewQuestionnaire} onUpdateClinicalRecord={updateClinicalRecord} onStartEncounter={startQuestionnaireEncounter} sessionAutonomicFiles={sessionAutonomicFiles} />}
        {activeView === 'encounter' && (
          <>
            <div className="encounter-patient-bar">
              <div className="encounter-patient-avatar">환자</div>
              <div><strong>{patientName}</strong><span>{selectedPatient ? `${selectedPatient.gender}${selectedPatient.age ? ` · ${selectedPatient.age}세` : ''}` : '기본정보 캡처 전'}</span><small>{selectedPatient?.id ?? '등록번호 확인 대기'}</small></div>
              <dl><div><dt>주호소</dt><dd>{selectedPatient?.chiefComplaint ?? '캡처 후 확인'}</dd></div><div><dt>알레르기</dt><dd>{selectedPatient?.allergies ?? '캡처 후 확인'}</dd></div><div><dt>진료구분</dt><dd>{encounterLabel}</dd></div></dl>
              <button onClick={openPatientDirectory}>기존 환자 기록</button>
            </div>

            <div className="flow-progress" style={{ gridTemplateColumns: `repeat(${flowSteps.length}, minmax(0, 1fr))` }}>
              {flowSteps.map((step, index) => <button className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step.id} onClick={() => openStep(step.id)}><i>{index < currentIndex ? '✓' : index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span>{index < flowSteps.length - 1 && <b />}</button>)}
            </div>

            <div className="flow-content">
              {activeStep === 'emr' && <EmrStep stepNumber={currentIndex + 1} encounterType={encounterType} captured={emrCaptured} patient={selectedPatient} onCapture={() => setEmrCaptured(true)} />}
              {activeStep === 'tests' && <TestsStep stepNumber={currentIndex + 1} encounterType={encounterType} chartText={chartText} existingResults={selectedPatient?.tests ?? []} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} onChartTextChange={setChartText} onAutonomicFileChange={(file) => { setAutonomicFile(file); setHasPreviousAutonomic(file ? Boolean(selectedPatient) : selectedPatient ? true : null); }} onPreviousChange={setHasPreviousAutonomic} />}
              {activeStep === 'audio' && <AudioStep stepNumber={currentIndex + 1} encounterType={encounterType} selectedFile={audioFile} recording={recording} recordingStarted={recordingStarted} recordingSeconds={recordingSeconds} microphoneState={microphoneState} microphoneLabel={microphoneLabel} microphoneError={microphoneError} onSelectedFileChange={setAudioFile} onToggleRecording={toggleRecording} onCheckMicrophone={checkMicrophone} />}
              {activeStep === 'soap' && <SoapStep stepNumber={currentIndex + 1} values={soapValues} hasAudio={Boolean(audioFile || recordingStarted)} hasQuestionnaire={Boolean(selectedPatient)} hasTests={Boolean(chartText.trim() || selectedPatient?.tests.length)} onChange={(letter, value) => setSoapValues({ ...soapValues, [letter]: value })} />}
              {activeStep === 'final' && <FinalStep stepNumber={currentIndex + 1} approved={approved} patient={selectedPatient} clinician={nickname} soapValues={soapValues} chartText={chartText} existingResults={selectedPatient?.tests ?? []} audioFile={audioFile} autonomicFile={autonomicFile} hasPrevious={hasPreviousAutonomic} autonomicValues={autonomicValues} onSoapChange={(letter, value) => setSoapValues((current) => ({ ...current, [letter]: value }))} onChartTextChange={setChartText} onAutonomicChange={(key, value) => setAutonomicValues((current) => ({ ...current, [key]: value }))} onApprove={approveEncounter} onFinishWithoutPdf={finishEncounterToHome} />}
            </div>

            <footer className="flow-footer-actions">
              <button className="flow-previous" onClick={goPrevious}>← 이전 단계</button>
              <div><span>{currentIndex + 1} / {flowSteps.length}</span><strong>{flowSteps[currentIndex].label}</strong></div>
              <button className={`flow-draft-save ${draftSaveState}`} onClick={saveEncounterDraft}>{draftSaveState === 'saved' ? '임시 저장 완료 ✓' : draftSaveState === 'error' ? '저장 실패 · 다시 시도' : '임시 저장'}</button>
              {activeStep !== 'final' && <button className="flow-next" onClick={goNext}>{nextButtonLabel} <b>→</b></button>}
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

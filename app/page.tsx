'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TextareaHTMLAttributes } from 'react';

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

const patientRecords: PatientRecord[] = [
  {
    id: 'P-2024-01842', name: '김민준', gender: '남', age: 47, birthDate: '1979.03.18', lastVisit: '2026.08.12', visits: 8,
    chiefComplaint: '만성 피로와 수면장애', allergies: '페니실린', department: '가정의학과', diagnoses: ['자율신경 기능 이상', '수면장애'],
    chart: {
      symptoms: '최근 3개월 동안 잠들기까지 1시간 이상 걸리고, 자고 일어나도 피로가 풀리지 않는다고 설명함. 업무가 많은 날에는 두근거림과 목·어깨 긴장이 함께 심해짐.',
      assessment: '위험 신호나 급성 신경학적 이상은 확인되지 않음. 수면장애와 지속적인 스트레스가 자율신경 불균형에 영향을 주는 것으로 판단함.',
      plan: '수면위생과 카페인 섭취 조절을 우선 적용하고, 규칙적인 유산소 운동을 안내함. 4주 후 증상과 자율신경검사 변화를 재평가하기로 함.',
    },
    clinicalDetails: [
      { label: '발병·경과', value: '약 3개월 전부터 입면 시간이 1시간 이상으로 길어졌으며, 야간 각성과 기상 후 피로가 지속됨. 업무량과 긴장이 증가한 날 두근거림 및 경항부 긴장이 동반됨.' },
      { label: '과거력·가족력', value: '기록상 중대한 만성질환 및 수술력 없음. 이번 진료에서 수면장애와 직접 관련된 가족력은 별도 확인되지 않음.' },
      { label: '복용약·알레르기', value: '정기 복용약 없음. 페니실린 투여 후 발진 병력이 기록되어 있음.' },
      { label: '진찰·검사 소견', value: '혈압 128/82 mmHg. 급성 신경학적 이상 소견 없음. HRV 32 ms, LF/HF 2.41, 스트레스 지수 78로 교감신경 우세 및 높은 스트레스 상태가 확인됨.' },
      { label: '진단·의사 소견', value: '수면장애 및 스트레스와 연관된 자율신경 기능 이상으로 판단함. 즉시 추가검사가 필요한 위험 신호는 현재 확인되지 않음.' },
      { label: '치료·처방·교육', value: '수면위생 교육, 오후 카페인 제한, 규칙적인 유산소 운동을 안내함. 4주 후 증상 변화와 자율신경검사를 재평가하기로 함.' },
    ],
    clinician: '홍길동 의사', approvedAt: '2026.08.12 15:42',
    courseSummary: [
      { title: '수면과 피로 경과', status: '관찰 필요', summary: '입면 지연과 기상 후 피로가 계속되지만 야간 각성 횟수는 이전 기록보다 감소함.', sources: ['2026.05.02', '2026.08.12'] },
      { title: '자율신경 지표 변화', status: '호전', summary: 'HRV는 28 ms에서 32 ms로 증가했고 LF/HF와 스트레스 지수는 감소함.', sources: ['2026.05.02', '2026.08.12'] },
      { title: '치료 계획 변화', status: '유지', summary: '약물치료 없이 수면위생과 생활관리 중심의 계획을 유지하며 4주 후 재평가 예정임.', sources: ['2026.05.02', '2026.08.12'] },
    ],
    previousRecords: [
      { date: '2026.05.02', visitType: '재진', chiefComplaint: '입면 지연, 아침 피로 및 업무 스트레스', assessment: '스트레스 연관 수면장애 의심. CBC 및 갑상선 기능은 정상 범위로 확인됨.', treatment: '수면일지 작성과 카페인 섭취 제한을 안내하고 자율신경검사를 시행함.', clinician: '홍길동 의사' },
      { date: '2026.02.10', visitType: '초진', chiefComplaint: '쉽게 잠들지 못하고 휴식 후에도 지속되는 피로', assessment: '수면시간 불규칙과 업무 스트레스가 증상에 영향을 주는 것으로 평가함.', treatment: '규칙적인 취침·기상 시간과 주 3회 유산소 운동을 우선 권고함.', clinician: '홍길동 의사' },
    ],
    soap: {
      S: '최근 3개월간 쉽게 잠들지 못하고 아침 피로가 지속됨. 업무 스트레스가 심한 날 증상이 악화됨.',
      O: '혈압 128/82 mmHg. 자율신경검사 LF/HF 2.41, 스트레스 지수 높음.',
      A: '수면장애 및 스트레스 연관 자율신경 불균형 경과 관찰.',
      P: '수면위생 교육, 카페인 섭취 조절. 4주 후 자율신경검사 재평가.',
    },
    tests: [['2026.08.12', '자율신경검사', 'LF/HF 2.41 · 스트레스 지수 높음'], ['2026.05.02', '혈액검사', 'CBC · 갑상선 기능 정상 범위']],
    autonomicFiles: [
      { id: 'ANS-20260812-01842', date: '2026.08.12', fileName: 'ANS_김민준_20260812.csv', fileType: '장비 Export · CSV', summary: '이전 검사보다 HRV가 증가하고 LF/HF 및 스트레스 지수가 감소함.', metrics: [['HRV', '32 ms', '낮음'], ['LF/HF', '2.41', '높음'], ['스트레스 지수', '78', '높음']] },
      { id: 'ANS-20260502-01842', date: '2026.05.02', fileName: 'ANS_김민준_20260502.csv', fileType: '장비 Export · CSV', summary: '비교 기준이 된 이전 자율신경검사 원본 파일.', metrics: [['HRV', '28 ms', '낮음'], ['LF/HF', '2.88', '높음'], ['스트레스 지수', '84', '높음']] },
    ],
    autonomic: {
      date: '2026.08.12',
      current: [['HRV', '32 ms', '낮음'], ['LF/HF', '2.41', '높음'], ['스트레스 지수', '78', '높음']],
      comparison: [['HRV', '28 ms', '32 ms', '+4 ms'], ['LF/HF', '2.88', '2.41', '-0.47'], ['스트레스 지수', '84', '78', '-6']],
      interpretation: '이전 검사보다 HRV가 증가하고 LF/HF 및 스트레스 지수가 낮아져 전반적인 자율신경 균형은 호전되었습니다. 다만 스트레스 지수는 아직 높은 범위로 생활관리와 추적검사가 필요합니다.',
    },
  },
  {
    id: 'P-2025-00671', name: '이서연', gender: '여', age: 34, birthDate: '1992.11.07', lastVisit: '2026.08.05', visits: 4,
    chiefComplaint: '두통과 어지럼', allergies: '없음', department: '신경과', diagnoses: ['긴장형 두통'],
    chart: {
      symptoms: '오후가 되면 양측 관자놀이가 조이는 두통이 주 3회 정도 나타나며, 장시간 화면을 본 날에 심해진다고 설명함. 구토, 시야 이상, 한쪽 마비 증상은 없음.',
      assessment: '진찰에서 국소 신경학적 이상과 이차성 두통의 위험 징후는 확인되지 않아 긴장형 두통 가능성이 높은 것으로 판단함.',
      plan: '두통 발생 시간과 유발 요인을 기록하도록 안내하고, 수분 섭취와 목·어깨 스트레칭을 권고함. 증상 빈도가 증가하거나 신경학적 증상이 동반되면 조기 내원하도록 설명함.',
    },
    clinicalDetails: [
      { label: '발병·경과', value: '약 2개월 전부터 오후 시간대에 양측 관자놀이를 조이는 양상의 두통이 주 3회 발생함. 장시간 화면을 본 날과 수면이 부족한 날 악화됨.' },
      { label: '과거력·가족력', value: '특이 만성질환 및 두부 외상력 없음. 두통 관련 가족력은 기록상 확인되지 않음.' },
      { label: '복용약·알레르기', value: '두통이 심한 날 일반 진통제를 간헐적으로 복용함. 알려진 약물 알레르기 없음.' },
      { label: '진찰·검사 소견', value: '혈압 116/74 mmHg. 의식 및 뇌신경·운동·감각 진찰에서 국소 신경학적 결손 없음. 구토, 시야 이상, 편측 마비 등 위험 증상 없음.' },
      { label: '진단·의사 소견', value: '임상 양상상 긴장형 두통 가능성이 높음. 현재 이차성 두통을 시사하는 위험 신호는 확인되지 않음.' },
      { label: '치료·처방·교육', value: '두통 일지 작성, 충분한 수분 섭취와 경항부 스트레칭을 안내함. 빈도 증가 또는 신경학적 증상 발생 시 조기 내원하도록 설명함.' },
    ],
    clinician: '홍길동 의사', approvedAt: '2026.08.05 14:18',
    courseSummary: [
      { title: '두통 빈도', status: '유지', summary: '두통은 주 3회 수준으로 지속되며 이전 기록과 비교해 뚜렷한 빈도 증가는 없음.', sources: ['2026.04.19', '2026.08.05'] },
      { title: '위험 신호', status: '호전', summary: '뇌 MRI와 신경학적 진찰에서 특이소견이 없고 새로운 신경학적 증상도 확인되지 않음.', sources: ['2026.04.19', '2026.08.05'] },
      { title: '관리 계획', status: '관찰 필요', summary: '화면 노출과 경항부 긴장이 유발 요인으로 보여 두통 일지를 통한 추적이 필요함.', sources: ['2026.06.11', '2026.08.05'] },
    ],
    previousRecords: [
      { date: '2026.06.11', visitType: '재진', chiefComplaint: '오후에 반복되는 조이는 양상의 두통', assessment: '영상검사 특이소견 없이 긴장형 두통 양상이 지속됨.', treatment: '화면 사용 중 휴식, 수분 섭취 및 목·어깨 스트레칭을 안내함.', clinician: '홍길동 의사' },
      { date: '2026.04.19', visitType: '초진', chiefComplaint: '반복되는 두통과 간헐적인 어지럼', assessment: '신경학적 결손은 없으며 뇌 MRI에서 특이 병변이 확인되지 않음.', treatment: '위험 증상을 교육하고 증상·유발 요인 기록을 시작하도록 안내함.', clinician: '홍길동 의사' },
    ],
    soap: {
      S: '오후에 양측 관자놀이가 조이는 두통이 주 3회 발생. 구토나 시야 이상은 없음.',
      O: '신경학적 진찰 특이소견 없음. 혈압 116/74 mmHg.',
      A: '긴장형 두통 양상. 위험 징후는 현재 확인되지 않음.',
      P: '두통 일지 작성, 수분 섭취와 스트레칭 안내. 증상 악화 시 조기 내원.',
    },
    tests: [['2026.08.05', '신경학적 진찰', '국소 신경학적 결손 없음'], ['2026.04.19', '뇌 MRI', '특이 병변 없음']],
    autonomicFiles: [
      { id: 'ANS-20260805-00671', date: '2026.08.05', fileName: 'ANS_이서연_20260805.csv', fileType: '장비 Export · CSV', summary: '첫 자율신경검사로 다음 검사부터 변화량을 비교할 기준 파일.', metrics: [['HRV', '41 ms', '정상'], ['LF/HF', '1.72', '경계'], ['스트레스 지수', '63', '경계']] },
    ],
    autonomic: {
      date: '2026.08.05',
      current: [['HRV', '41 ms', '정상'], ['LF/HF', '1.72', '경계'], ['스트레스 지수', '63', '경계']],
      interpretation: '첫 자율신경검사로 비교할 이전 데이터가 없습니다. 현재 HRV는 정상 범위이며 LF/HF와 스트레스 지수는 경계 범위이므로, 이번 결과를 기준 데이터로 저장하고 다음 검사부터 변화량을 비교합니다.',
    },
  },
  {
    id: 'P-2023-03109', name: '박지훈', gender: '남', age: 58, birthDate: '1968.01.22', lastVisit: '2026.07.29', visits: 12,
    chiefComplaint: '혈압 추적 관찰', allergies: '설파계 약물', department: '내과', diagnoses: ['고혈압', '이상지질혈증'],
    chart: {
      symptoms: '혈압약과 지질저하제를 빠뜨리지 않고 복용 중이며 흉통, 호흡곤란, 두근거림이나 어지럼은 없다고 설명함. 주 4회 30분 걷기를 유지 중임.',
      assessment: '진료실 혈압은 목표 범위에 가깝고 급성 심혈관 증상은 없음. LDL 콜레스테롤은 이전보다 감소했으나 지속적인 생활습관 관리가 필요하다고 판단함.',
      plan: '현재 약제를 유지하고 저염식과 유산소 운동을 지속하도록 안내함. 3개월 후 혈압 기록과 지질·신장기능검사를 재확인하기로 함.',
    },
    clinicalDetails: [
      { label: '발병·경과', value: '고혈압과 이상지질혈증으로 정기 추적 중임. 최근 흉통, 호흡곤란, 두근거림 및 어지럼은 없으며 주 4회 30분 걷기를 유지함.' },
      { label: '과거력·가족력', value: '고혈압 및 이상지질혈증 치료 중. 심혈관질환 관련 가족력은 기존 기록에 별도 기재되지 않음.' },
      { label: '복용약·알레르기', value: '처방된 혈압약과 지질저하제를 규칙적으로 복용함. 설파계 약물 알레르기 있음.' },
      { label: '진찰·검사 소견', value: '혈압 134/86 mmHg, LDL-C 112 mg/dL. 급성 심혈관 증상 없음. 최근 Cr 0.9 mg/dL 및 eGFR 정상 범위.' },
      { label: '진단·의사 소견', value: '고혈압은 비교적 안정적이며 LDL 콜레스테롤은 이전보다 감소함. 이상지질혈증에 대한 생활습관 관리는 계속 필요함.' },
      { label: '치료·처방·교육', value: '현재 처방을 유지하고 저염식 및 유산소 운동을 지속하도록 안내함. 3개월 후 혈압 기록, 지질검사와 신장기능검사를 재확인함.' },
    ],
    clinician: '홍길동 의사', approvedAt: '2026.07.29 11:36',
    courseSummary: [
      { title: '혈압 경과', status: '유지', summary: '진료실 혈압은 목표 범위에 가까우며 급성 심혈관 증상 없이 안정적으로 유지됨.', sources: ['2026.04.25', '2026.07.29'] },
      { title: '지질 수치', status: '호전', summary: 'LDL 콜레스테롤이 이전 기록보다 감소했으나 생활습관 관리가 계속 필요함.', sources: ['2026.04.25', '2026.07.29'] },
      { title: '복약·생활관리', status: '유지', summary: '복약 순응도와 주 4회 걷기를 유지하고 있으며 현재 처방 변경은 없음.', sources: ['2026.04.25', '2026.07.29'] },
    ],
    previousRecords: [
      { date: '2026.04.25', visitType: '정기 재진', chiefComplaint: '혈압 및 이상지질혈증 추적', assessment: '가정혈압은 대체로 안정적이며 신장기능은 정상 범위임.', treatment: '현재 약제를 유지하고 저염식과 유산소 운동을 지속하도록 안내함.', clinician: '홍길동 의사' },
      { date: '2026.01.16', visitType: '정기 재진', chiefComplaint: '혈압 기록 확인 및 복약 상담', assessment: '복약 순응도는 양호하나 운동량이 부족한 상태로 평가함.', treatment: '주 4회 30분 걷기 목표를 설정하고 3개월 후 추적하기로 함.', clinician: '홍길동 의사' },
    ],
    soap: {
      S: '복약은 규칙적으로 하고 있으며 흉통, 호흡곤란, 어지럼은 없음.',
      O: '혈압 134/86 mmHg. LDL-C 112 mg/dL.',
      A: '고혈압은 비교적 안정적이며 이상지질혈증은 생활습관 관리 지속 필요.',
      P: '현재 약 유지. 저염식과 유산소 운동 안내, 3개월 후 혈액검사.',
    },
    tests: [['2026.07.29', '지질검사', 'LDL-C 112 mg/dL'], ['2026.04.25', '신장기능검사', 'Cr 0.9 mg/dL · eGFR 정상']],
    autonomicFiles: [
      { id: 'ANS-20260729-03109', date: '2026.07.29', fileName: 'ANS_박지훈_20260729.csv', fileType: '장비 Export · CSV', summary: '이전보다 HRV가 증가하고 스트레스 지수가 감소해 전반적으로 호전됨.', metrics: [['HRV', '42 ms', '정상'], ['LF/HF', '1.68', '정상'], ['스트레스 지수', '58', '정상']] },
      { id: 'ANS-20260425-03109', date: '2026.04.25', fileName: 'ANS_박지훈_20260425.csv', fileType: '장비 Export · CSV', summary: '2026년 7월 검사와 비교한 이전 자율신경검사 원본 파일.', metrics: [['HRV', '38 ms', '경계'], ['LF/HF', '1.95', '경계'], ['스트레스 지수', '67', '경계']] },
    ],
    autonomic: {
      date: '2026.07.29',
      current: [['HRV', '42 ms', '정상'], ['LF/HF', '1.68', '정상'], ['스트레스 지수', '58', '정상']],
      comparison: [['HRV', '38 ms', '42 ms', '+4 ms'], ['LF/HF', '1.95', '1.68', '-0.27'], ['스트레스 지수', '67', '58', '-9']],
      interpretation: '이전 검사와 비교해 HRV가 증가하고 스트레스 지수가 감소했습니다. 교감·부교감 균형도 정상 범위로 이동해 전반적인 자율신경 상태가 호전된 것으로 해석합니다.',
    },
  },
  {
    id: 'P-2025-01426', name: '최유진', gender: '여', age: 42, birthDate: '1984.06.14', lastVisit: '2026.07.18', visits: 3,
    chiefComplaint: '소화불량과 복부 팽만', allergies: '없음', department: '소화기내과', diagnoses: ['기능성 소화불량'],
    chart: {
      symptoms: '식사 후 더부룩함과 조기 포만감이 반복되고 스트레스가 심한 날 복부 팽만이 증가한다고 설명함. 체중 감소, 반복 구토, 흑색변은 없음.',
      assessment: '복부 진찰과 내시경에서 기질적 이상이 확인되지 않아 기능성 소화불량에 합당한 양상으로 판단함.',
      plan: '한 번의 식사량을 줄여 나누어 먹고 자극적인 음식과 늦은 야식을 피하도록 안내함. 6주 후 증상 변화를 확인하기로 함.',
    },
    clinicalDetails: [
      { label: '발병·경과', value: '약 3개월 전부터 식후 더부룩함과 조기 포만감이 반복됨. 스트레스가 심하거나 늦게 식사한 날 복부 팽만이 증가함.' },
      { label: '과거력·가족력', value: '소화기 수술력 및 중대한 만성질환 없음. 소화기계 질환 가족력은 기록상 확인되지 않음.' },
      { label: '복용약·알레르기', value: '정기 복용약 없음. 알려진 약물 및 음식 알레르기 없음.' },
      { label: '진찰·검사 소견', value: '복부 진찰에서 압통과 반발통 없음. 상부위장관 내시경과 복부 초음파에서 증상을 설명할 기질적 이상이 확인되지 않음.' },
      { label: '진단·의사 소견', value: '경고 증상 및 기질적 병변 없이 식후 불편감이 반복되어 기능성 소화불량에 합당한 양상으로 판단함.' },
      { label: '치료·처방·교육', value: '소량씩 나누어 먹고 자극적인 음식과 늦은 야식을 피하도록 안내함. 체중 감소, 반복 구토 또는 흑색변 발생 시 즉시 내원하도록 교육함.' },
    ],
    clinician: '홍길동 의사', approvedAt: '2026.07.18 16:05',
    courseSummary: [
      { title: '소화기 증상', status: '관찰 필요', summary: '조기 포만감은 비슷하게 지속되며 늦은 식사 후 복부 팽만이 두드러짐.', sources: ['2026.06.30', '2026.07.18'] },
      { title: '위험 신호·검사', status: '호전', summary: '체중 감소·반복 구토·흑색변이 없고 내시경과 초음파에서도 특이소견이 없음.', sources: ['2026.06.30', '2026.07.18'] },
      { title: '생활관리', status: '유지', summary: '식사량 분할과 야식 제한을 유지하며 6주 후 증상 변화를 평가할 예정임.', sources: ['2026.06.30', '2026.07.18'] },
    ],
    previousRecords: [
      { date: '2026.06.30', visitType: '재진', chiefComplaint: '식후 복부 팽만과 더부룩함', assessment: '복부 초음파에서 간담췌 특이소견 없이 기능성 원인을 우선 고려함.', treatment: '식사량을 나누고 식후 바로 눕지 않도록 생활지도를 시행함.', clinician: '홍길동 의사' },
      { date: '2026.05.14', visitType: '초진', chiefComplaint: '식후 조기 포만감과 반복되는 소화불량', assessment: '체중 감소와 출혈 증상은 없으며 우선 기질적 원인 감별을 계획함.', treatment: '상부위장관 내시경과 복부 초음파를 계획하고 경고 증상을 교육함.', clinician: '홍길동 의사' },
    ],
    soap: {
      S: '식후 더부룩함과 조기 포만감이 반복됨. 체중 감소나 흑색변은 없음.',
      O: '복부 진찰상 압통 없음. 상부위장관 내시경 특이소견 없음.',
      A: '기능성 소화불량에 합당한 양상.',
      P: '식사량 분할, 자극적 음식 제한. 6주 후 증상 변화 확인.',
    },
    tests: [['2026.07.18', '상부위장관 내시경', '특이소견 없음'], ['2026.06.30', '복부 초음파', '간담췌 특이소견 없음']],
    autonomicFiles: [
      { id: 'ANS-20260718-01426', date: '2026.07.18', fileName: 'ANS_최유진_20260718.csv', fileType: '장비 Export · CSV', summary: '첫 자율신경검사로 교감신경 우세와 높은 스트레스 지수가 확인됨.', metrics: [['HRV', '36 ms', '경계'], ['LF/HF', '2.06', '높음'], ['스트레스 지수', '71', '높음']] },
    ],
    autonomic: {
      date: '2026.07.18',
      current: [['HRV', '36 ms', '경계'], ['LF/HF', '2.06', '높음'], ['스트레스 지수', '71', '높음']],
      interpretation: '비교할 이전 자율신경검사 데이터가 없어 현재 결과만 표시합니다. 교감신경 우세와 높은 스트레스 지수가 확인되어 이번 결과를 기준 데이터로 저장하고 다음 검사에서 변화 방향을 비교합니다.',
    },
  },
];

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

function PatientDirectory({ onStartEncounter, sessionAutonomicFiles }: { onStartEncounter: (patient: PatientRecord) => void; sessionAutonomicFiles: Record<string, AutonomicFileRecord[]> }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(patientRecords[0].id);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPatients = patientRecords.filter((patient) => [patient.name, patient.id, patient.chiefComplaint, patient.department].some((value) => value.toLowerCase().includes(normalizedQuery)));
  const selectedPatient = patientRecords.find((patient) => patient.id === selectedId) ?? filteredPatients[0] ?? null;
  const availableAutonomicFiles = selectedPatient ? [...(sessionAutonomicFiles[selectedPatient.id] ?? []), ...selectedPatient.autonomicFiles].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const printDate = formatPrintDate();
  const openUploadedFile = (record: AutonomicFileRecord) => {
    if (!record.file) return;
    const fileUrl = URL.createObjectURL(record.file);
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
  };
  const printPatientRecord = () => {
    if (!selectedPatient) return;
    printDocument('printing-patient-record', `${selectedPatient.name}_${selectedPatient.id}_진료기록`);
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
            <section className="record-chart-card">
              <header><div><p className="eyebrow">TODAY&apos;S CLINICAL SUMMARY</p><h2>오늘 진료 요약</h2></div><span><b>요약</b><time>{selectedPatient.lastVisit}</time></span></header>
              <div className="chart-narrative-grid">
                <article><i>환자</i><div><strong>환자가 설명한 증상과 경과</strong><p>{selectedPatient.chart.symptoms}</p></div></article>
                <article><i>판단</i><div><strong>의사의 판단</strong><p>{selectedPatient.chart.assessment}</p></div></article>
                <article><i>계획</i><div><strong>치료·관리 계획</strong><p>{selectedPatient.chart.plan}</p></div></article>
              </div>
            </section>
            <section className="record-detailed-card" id={`current-record-${selectedPatient.lastVisit.replace(/\./g, '-')}`}>
              <header>
                <div><p className="eyebrow">CURRENT ENCOUNTER DETAIL</p><h2>오늘의 상세 진료기록</h2><span>요약에 생략된 진찰·치료 내용을 포함한 승인 기록입니다.</span></div>
                <b>의사 승인 완료</b>
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
      <div className="audio-to-chart-route"><span><i>1</i>진료 녹음·파일</span><b>→</b><span><i>2</i>음성 내용 분석</span><b>→</b><span><i>3</i>차트·SOAP 초안</span><b>→</b><span><i>4</i>의사 수정·승인</span></div>
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
      <header className="step-heading"><div><p className="eyebrow">STEP {stepNumber} · DOCTOR REVIEW</p><h2>녹음 기반 진료차트 초안 검토</h2><span>진료 녹음 내용을 중심으로 검사자료를 보완하여 AI가 작성한 SOAP 차트를 의사가 직접 확인·수정합니다.</span></div><span className="step-status">차트 생성 대기</span></header>
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
  const reportText = (key: string, fallback: string) => soapValues[key]?.trim() || fallback;
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
            <article><i>환자</i><label><strong>환자가 설명한 증상과 경과</strong><AutoResizeTextarea disabled={approved} value={soapValues.S} onChange={(event) => onSoapChange('S', event.target.value)} placeholder="환자의 주호소, 증상 양상, 기간과 악화·완화 요인을 입력하세요." /></label></article>
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
      {showPreview && <div className="report-modal-backdrop" onMouseDown={closeReport}>
        <section className="report-modal" role="dialog" aria-modal="true" aria-label="환자 종합 진료 안내서 미리보기" onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div><p className="eyebrow">PATIENT REPORT PREVIEW</p><h3>환자 종합 진료 안내서</h3><span>진료 내용을 환자가 이해하기 쉬운 한 문서로 통합합니다.</span></div>
            <div className="report-actions"><b>{approved ? '의사 승인 완료' : '승인 전 미리보기'}</b><button disabled={!approved} onClick={printReport}>PDF 출력</button><button className="report-modal-close" onClick={closeReport} aria-label="미리보기 닫기">×</button></div>
          </header>
          <div className="report-modal-scroll">
          <article className={approved ? 'patient-report-paper approved' : 'patient-report-paper'}>
          <div className="report-document-head">
            <div><span>병원명</span><strong>환자 종합 진료 안내서</strong><small>Clinical Visit Summary</small></div>
            <b>{approved ? '의사 승인본' : '미리보기 · 승인 전'}</b>
          </div>
          <dl className="report-patient-info">
            <div><dt>환자</dt><dd>{patient?.name ?? '캡처한 환자정보'}</dd></div><div><dt>환자등록번호</dt><dd>{patient?.id ?? '캡처 후 표시'}</dd></div><div><dt>진료일</dt><dd>{reportDate}</dd></div><div><dt>담당의</dt><dd>담당의사</dd></div>
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
          <div className="report-result-grid single">
            <section>
              <header><div><span>AUTONOMIC TEST</span><strong>자율신경검사 설명</strong></div><b>{autonomicFile ? '검사파일 연결' : '입력 대기'}</b></header>
              <p>{editableAutonomicSummary}</p>
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
          </div>
        </section>
      </div>}
      <div className="final-approval-only">
        <button disabled={approved} onClick={onApprove}>{approved ? '최종 승인 완료' : '내용을 확인하고 최종 승인'} <b>✓</b></button>
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

  const flowSteps = encounterType === 'followup' ? followupVisitSteps : firstVisitSteps;
  const encounterLabel = encounterType === 'new' ? '초진' : '재진';
  const currentIndex = flowSteps.findIndex((step) => step.id === activeStep);
  const resetScroll = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  const goHome = () => { setActiveView('home'); resetScroll(); };
  const openPatientDirectory = () => { setActiveView('patients'); resetScroll(); };

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
  const startEncounter = (patient: PatientRecord | null = null) => {
    const isFollowup = Boolean(patient);
    setSelectedPatient(patient);
    setEncounterType(isFollowup ? 'followup' : 'new');
    setApproved(false);
    setEmrCaptured(isFollowup);
    setSoapValues({ S: '', O: '', A: '', P: '' });
    setChartText('');
    setAudioFile(null);
    setAutonomicFile(null);
    setHasPreviousAutonomic(isFollowup ? true : null);
    setAutonomicValues({});
    setRecording(false);
    setRecordingStarted(false);
    setRecordingSeconds(0);
    setRecordingPosition(null);
    setActiveStep(isFollowup ? 'tests' : 'emr');
    setEncounterStarted(true);
    setActiveView('encounter');
    resetScroll();
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
        <button className={activeView === 'patients' ? 'patient-records-button active' : 'patient-records-button'} onClick={openPatientDirectory}><i>기록</i><span>환자기록</span></button>
        <div className="flow-rail-line" />
        <nav className={`flow-step-count-${flowSteps.length}`} aria-label="진료 진행 단계">
          {flowSteps.map((step, index) => (
            <button className={activeView === 'encounter' && activeStep === step.id ? 'flow-step-nav active' : encounterStarted && currentIndex > index ? 'flow-step-nav done' : 'flow-step-nav'} key={step.id} onClick={() => openStep(step.id)} disabled={!encounterStarted}>
              <i>{currentIndex > index ? '✓' : index + 1}</i><span>{step.label}</span>
            </button>
          ))}
        </nav>
        {encounterStarted && <button className="new-encounter" onClick={() => startEncounter()}><i>＋</i><span>새 진료</span></button>}
      </aside>

      <section className="flow-workspace">
        <header className={recordingStarted ? 'flow-topbar has-recording' : 'flow-topbar'}>
          <div><div className="product-name">MEDIFLOW <span>Clinical AI Agent</span></div><div className="local-badge"><i /> 병원 내부망 · Local AI</div></div>
          <div className={recordingStarted ? 'flow-topbar-context has-recording' : 'flow-topbar-context'}>
            {activeView === 'encounter' ? <div className="active-patient-mini"><i>환자</i><span><strong>{patientName}</strong><small>{patientMeta}</small></span><b>{encounterLabel}</b></div> : <div className="topbar-idle"><i>✓</i><span>{activeView === 'patients' ? '기존 환자 기록 · 병원 내부 조회' : '환자 데이터 외부 전송 없음'}</span></div>}
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

        {activeView === 'home' && <HomeScreen onStart={() => startEncounter()} onOpenPatients={openPatientDirectory} />}
        {activeView === 'patients' && <PatientDirectory onStartEncounter={startEncounter} sessionAutonomicFiles={sessionAutonomicFiles} />}
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
            <div className="draft-account-plan"><i>K</i><span><strong>카카오 로그인은 한 곳에서</strong><small>정식 연동 시 하나의 로그인 화면에서 인증하고, 같은 계정의 iPad와 데스크탑에서 임시저장을 동기화하도록 연결합니다.</small></span></div>
            <p className="draft-local-limit">현재 GitHub Pages 시제품은 이 브라우저에만 임시 저장됩니다. 실제 기기 간 공유에는 카카오 로그인과 서버 저장소 연결이 필요합니다.</p>
            <footer><button onClick={() => { setDeferredDraft(draftPrompt); setDeferredDraftPosition(null); setDraftPrompt(null); }}>나중에</button><button onClick={() => restoreEncounterDraft(draftPrompt)}>확인하고 이어서 작성 <b>→</b></button></footer>
          </section>
        </div>
      )}
    </main>
  );
}

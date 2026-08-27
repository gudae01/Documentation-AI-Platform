const runtimeEnv = import.meta.env as ImportMetaEnv & { VITE_API_BASE_URL?: string };
const browserBackend = typeof window !== 'undefined' && !window.location.hostname.endsWith('.github.io')
  ? `${window.location.protocol}//${window.location.hostname}:8080`
  : 'http://localhost:8080';
const BASE = runtimeEnv.VITE_API_BASE_URL || browserBackend;
const LOGIN_RETURN_URL = typeof window !== 'undefined'
  ? `${window.location.origin}${window.location.pathname}`
  : '';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type AuthResponse = { authenticated: boolean; nickname: string | null };
export type Invite = {
  id: string; channel: string; status: string; deliveryStatus: string; deliveryMessage: string;
  plannedDate: string; expiresAt: string; createdAt: string; link?: string;
};
export type PublicMeta = {
  expiresAt: string; plannedDate: string | null; draftJson: string | null; draftSavedAt: string | null;
};
export type Questionnaire = {
  id: string; patientId: string; name: string; birth6: string; sex: string; plannedDate: string;
  respondentType: string; rawJson: string; structuredJson: string; chart: string; status: string;
  submittedAt: string; reviewedAt: string | null; version: number;
};
export type PdClinicalRecord = {
  id: string;
  patientId: string;
  questionnaireId: string;
  rawExaminationText: string;
  structuredResults: Array<{ source: string; title: string; value: string; status: string }>;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  autonomic: Record<string, string>;
  audioFileName: string | null;
  autonomicFileName: string | null;
  clinician: string;
  approvedAt: string;
};
export type Admission = {
  id: string; patientId: string; name: string; birth6: string; sex: string; parsedJson: string;
  report: string; status: string; createdAt: string; reviewedAt: string | null;
  approvedAt: string | null; version: number;
};
export type AdmissionAttachment = {
  id: string; fileName: string; contentType: string; size: number; createdAt: string;
};
export type ClinicalTest = {
  id: string; testDate: string; category: string; metric: string; value: string;
  unit: string | null; condition: string | null; raw: string | null; createdAt: string;
};
export type ClinicalTestBundle = {
  tests: ClinicalTest[];
  comparisons: Array<{ category: string; metric: string; unit: string | null; condition: string | null;
    first: string; last: string; delta: number | null; firstDate: string; lastDate: string }>;
};

let csrf: { headerName: string; token: string } | null = null;

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = csrf ?? await call<{ headerName: string; token: string }>('/api/auth/csrf');
    csrf = token;
    headers.set(token.headerName, token.token);
  }
  const response = await fetch(BASE + path, {
    ...options, headers, credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;
    try { message = (await response.json()).message || message; } catch { /* empty error body */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function download(path: string): Promise<Blob> {
  const response = await fetch(BASE + path, {
    credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new ApiError(response.status, `다운로드 실패 (${response.status})`);
  return response.blob();
}

export const pdApi = {
  me: () => call<AuthResponse>('/api/auth/me'),
  loginUrl: `${BASE}/api/auth/login?returnUrl=${encodeURIComponent(LOGIN_RETURN_URL)}`,
  questionnaireEventsUrl: `${BASE}/api/pd/questionnaire-events`,
  logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
  invite: (body: object) => call<Invite>('/api/pd/questionnaire-invitations', {
    method: 'POST', body: JSON.stringify(body),
  }),
  invites: () => call<Invite[]>('/api/pd/questionnaire-invitations'),
  revoke: (id: string) => call<void>(`/api/pd/questionnaire-invitations/${id}`, { method: 'DELETE' }),
  publicMeta: (token: string) => call<PublicMeta>(`/api/public/questionnaires/${encodeURIComponent(token)}`),
  saveDraft: (token: string, body: object) => call<PublicMeta>(
    `/api/public/questionnaires/${encodeURIComponent(token)}/draft`,
    { method: 'PUT', body: JSON.stringify(body) },
  ),
  submit: (token: string, body: object) => call<{ id: string; status: string; submittedAt: string }>(
    `/api/public/questionnaires/${encodeURIComponent(token)}/submit`,
    { method: 'POST', body: JSON.stringify(body) },
  ),
  questionnaires: (filters: Record<string, string> = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
    return call<Questionnaire[]>(`/api/pd/questionnaires${query ? `?${query}` : ''}`);
  },
  review: (id: string, body: object) => call<Questionnaire>(`/api/pd/questionnaires/${id}/review`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  clinicalRecords: () => call<PdClinicalRecord[]>('/api/pd/clinical-records'),
  patientClinicalRecords: (patientId: string) => call<PdClinicalRecord[]>(`/api/pd/patients/${patientId}/clinical-records`),
  approveClinicalRecord: (questionnaireId: string, body: object) => call<PdClinicalRecord>(
    `/api/pd/questionnaires/${questionnaireId}/clinical-record`,
    { method: 'PUT', body: JSON.stringify(body) },
  ),
  admissions: () => call<Admission[]>('/api/pd/admissions'),
  parseAdmission: (body: object) => call<Admission>('/api/pd/admissions', {
    method: 'POST', body: JSON.stringify(body),
  }),
  saveReport: (id: string, body: object) => call<Admission>(`/api/pd/admissions/${id}/report`, {
    method: 'PUT', body: JSON.stringify(body),
  }),
  approve: (id: string) => call<Admission>(`/api/pd/admissions/${id}/approve`, { method: 'POST' }),
  rebuildReport: (id: string) => call<Admission>(`/api/pd/admissions/${id}/rebuild-report`, { method: 'POST' }),
  reportPdf: (id: string) => download(`/api/pd/admissions/${id}/pdf`),
  attachments: (id: string) => call<AdmissionAttachment[]>(`/api/pd/admissions/${id}/attachments`),
  uploadAttachment: (id: string, file: File) => {
    const body = new FormData(); body.append('file', file);
    return call<AdmissionAttachment>(`/api/pd/admissions/${id}/attachments`, { method: 'POST', body });
  },
  downloadAttachment: (admissionId: string, attachmentId: string) =>
    download(`/api/pd/admissions/${admissionId}/attachments/${attachmentId}`),
  clinicalTests: (id: string) => call<ClinicalTestBundle>(`/api/pd/admissions/${id}/tests`),
  addClinicalTest: (id: string, body: object) => call<ClinicalTest>(`/api/pd/admissions/${id}/tests`, {
    method: 'POST', body: JSON.stringify(body),
  }),
};

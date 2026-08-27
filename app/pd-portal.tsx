'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  pdApi, type Admission, type AdmissionAttachment, type ClinicalTestBundle, type Invite, type Questionnaire,
} from './pd-api';

type Tab = 'links' | 'questionnaires' | 'admissions';
type FormDataState = Record<string, string>;

const EMPTY_FORM: FormDataState = {
  name: '', birth6: '', sex: '', plannedDate: '', respondent: '본인', relationship: '',
  allergy: '모름', foodAllergy: '모름', otherAllergy: '', nonPdMedications: '',
  pdOnset: '', pdDiagnosis: '', pdDiagnosisHospital: '', initialSymptoms: '', onsetSide: '',
  currentStage: '', dbsHistory: '', rehabilitationHistory: '', pdMedication: '',
  medicationTiming: '', medicationEffect: '', wearingOff: '', medicationSideEffects: '',
  chiefComplaint: '', symptomDetail: '', symptomTiming: '', laterality: '', onOffRelation: '',
  aggravatingFactors: '', relievingFactors: '', painNrs: '', fallSafety: '', pastHistory: '',
  familyHistory: '', diet: '', digestion: '', bowel: '', urine: '', sleep: '',
  bodyFacts: '', brainFacts: '',
};

export default function Page() {
  const token = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
    .get('questionnaireToken');
  return token ? <PublicQuestionnaire token={token} /> : <ClinicianApp />;
}

export function PublicQuestionnaire({ token }: { token: string }) {
  const [data, setData] = useState<FormDataState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    pdApi.publicMeta(token).then((meta) => {
      let restored: FormDataState = {};
      if (meta.draftJson) {
        try { restored = JSON.parse(meta.draftJson) as FormDataState; } catch { restored = {}; }
      }
      setData({ ...EMPTY_FORM, ...restored, plannedDate: restored.plannedDate || meta.plannedDate || '' });
      setLoaded(true);
    }).catch((reason: Error) => setError(reason.message));
  }, [token]);

  useEffect(() => {
    if (!loaded || !dirty || done) return;
    const timer = window.setTimeout(() => {
      setSaveState('저장 중…');
      pdApi.saveDraft(token, data).then(() => {
        setDirty(false); setSaveState('임시저장 완료');
      }).catch((reason: Error) => setSaveState(`임시저장 실패: ${reason.message}`));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [data, dirty, done, loaded, token]);

  function update(name: string, value: string) {
    setData((current) => ({ ...current, [name]: value }));
    setDirty(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await pdApi.submit(token, data); setDone(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '문진을 제출하지 못했습니다.'); }
  }

  if (error && !loaded) return <Centered title="링크를 사용할 수 없습니다" text={error} />;
  if (done) return <Centered title="문진 제출 완료" text="담당 의료진에게 안전하게 전달했습니다. 이 링크는 다시 사용할 수 없습니다." />;
  if (!loaded) return <Centered title="보안 링크 확인 중" text="잠시만 기다려 주세요." />;

  return <main className="public-page">
    <header className="public-header"><b>MEDIFLOW</b><span>파킨슨병 사전 문진</span></header>
    <form className="card questionnaire-form" onSubmit={submit}>
      <div className="notice">환자 표현은 임의로 고치거나 추론하지 않고 전달합니다. 주민등록번호 뒷자리는 입력하지 마세요.</div>
      <FormSection title="기본정보와 안전정보">
        <div className="grid grid-3">
          <Field label="성명" name="name" value={data.name} update={update} required />
          <Field label="생년월일 앞 6자리" name="birth6" value={data.birth6} update={update}
                 pattern="[0-9]{6}" inputMode="numeric" required />
          <SelectField label="성별" name="sex" value={data.sex} update={update}
                       options={[['', '선택'], ['M', '남성'], ['F', '여성']]} required />
          <Field label="진료/입원 예정일" name="plannedDate" value={data.plannedDate}
                 update={update} type="date" required />
          <SelectField label="작성자" name="respondent" value={data.respondent} update={update}
                       options={[['본인', '본인'], ['보호자', '보호자']]} />
          <Field label="보호자 관계" name="relationship" value={data.relationship} update={update}
                 disabled={data.respondent !== '보호자'} />
        </div>
        <div className="grid grid-3">
          <TriState label="약물 알레르기" name="allergy" value={data.allergy} update={update} />
          <TriState label="음식 알레르기" name="foodAllergy" value={data.foodAllergy} update={update} />
          <Field label="기타 알레르기" name="otherAllergy" value={data.otherAllergy} update={update} />
        </div>
        <TextField label="현재 비-PD 복용약" name="nonPdMedications" value={data.nonPdMedications} update={update} />
      </FormSection>

      <FormSection title="파킨슨병 병력">
        <div className="grid grid-3">
          <Field label="증상 발병 시기" name="pdOnset" value={data.pdOnset} update={update} />
          <Field label="진단 시기" name="pdDiagnosis" value={data.pdDiagnosis} update={update} />
          <Field label="진단 기관" name="pdDiagnosisHospital" value={data.pdDiagnosisHospital} update={update} />
          <Field label="발병 측" name="onsetSide" value={data.onsetSide} update={update} placeholder="오른쪽/왼쪽/모름" />
          <Field label="현재 단계 또는 상태" name="currentStage" value={data.currentStage} update={update} />
          <Field label="DBS·수술력" name="dbsHistory" value={data.dbsHistory} update={update} />
        </div>
        <TextField label="진단 당시 증상" name="initialSymptoms" value={data.initialSymptoms} update={update} />
        <TextField label="재활치료력" name="rehabilitationHistory" value={data.rehabilitationHistory} update={update} />
      </FormSection>

      <FormSection title="파킨슨병 약물">
        <TextField label="제품명·성분·1회 용량·횟수" name="pdMedication" value={data.pdMedication} update={update} />
        <div className="grid grid-2">
          <TextField label="복용 시간과 식사 관계" name="medicationTiming" value={data.medicationTiming} update={update} />
          <TextField label="복용 후 효과" name="medicationEffect" value={data.medicationEffect} update={update} />
          <TextField label="Wearing-off 또는 다음 복용 전 증상" name="wearingOff" value={data.wearingOff} update={update} />
          <TextField label="이상운동·어지럼·환각 등 부작용" name="medicationSideEffects" value={data.medicationSideEffects} update={update} />
        </div>
      </FormSection>

      <FormSection title="현재 가장 불편한 증상">
        <TextField label="주호소" name="chiefComplaint" value={data.chiefComplaint} update={update} required />
        <TextField label="환자 설명" name="symptomDetail" value={data.symptomDetail} update={update} required />
        <div className="grid grid-3">
          <Field label="발생 시점·지속시간" name="symptomTiming" value={data.symptomTiming} update={update} />
          <Field label="좌우·부위" name="laterality" value={data.laterality} update={update} />
          <Field label="ON/OFF 관계" name="onOffRelation" value={data.onOffRelation} update={update} />
          <Field label="악화 요인" name="aggravatingFactors" value={data.aggravatingFactors} update={update} />
          <Field label="완화 요인" name="relievingFactors" value={data.relievingFactors} update={update} />
          <Field label="직접 선택한 통증 NRS" name="painNrs" value={data.painNrs} update={update}
                 type="number" min="0" max="10" />
        </div>
        <TextField label="낙상·보행·운전·연하 등 안전 문제" name="fallSafety" value={data.fallSafety} update={update} />
      </FormSection>

      <FormSection title="과거력과 일상생활">
        <div className="grid grid-2">
          <TextField label="과거력" name="pastHistory" value={data.pastHistory} update={update} />
          <TextField label="가족력" name="familyHistory" value={data.familyHistory} update={update} />
          <TextField label="식사·식욕" name="diet" value={data.diet} update={update} />
          <TextField label="소화" name="digestion" value={data.digestion} update={update} />
          <TextField label="대변" name="bowel" value={data.bowel} update={update} />
          <TextField label="소변" name="urine" value={data.urine} update={update} />
          <TextField label="수면" name="sleep" value={data.sleep} update={update} />
        </div>
      </FormSection>

      <FormSection title="추가 사실">
        <div className="grid grid-2">
          <TextField label="Body facts" name="bodyFacts" value={data.bodyFacts} update={update} />
          <TextField label="Brain facts" name="brainFacts" value={data.brainFacts} update={update} />
        </div>
      </FormSection>
      <div className="form-footer"><span>{saveState}</span><button className="primary">안전하게 제출</button></div>
      {error && <p className="error">{error}</p>}
    </form>
  </main>;
}

function ClinicianApp() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<Tab>('links');
  const [view, setView] = useState<'home' | 'workspace'>('home');
  useEffect(() => { pdApi.me().then((response) => {
    setAuth(response.authenticated); setName(response.nickname || '의료진');
  }).catch(() => setAuth(false)); }, []);
  if (auth === null) return <Centered title="접속 확인 중" text="" />;
  if (!auth) return <LoginGate />;
  const openWorkspace = (nextTab: Tab) => { setTab(nextTab); setView('workspace'); window.scrollTo(0, 0); };
  const logout = () => pdApi.logout().then(() => location.reload());
  if (view === 'home') return <PortalHome name={name} onOpen={openWorkspace} onLogout={logout} />;
  return <div className="shell">
    <aside><b className="logo">M</b>
      <NavButton active={false} onClick={() => setView('home')}>홈</NavButton>
      <NavButton active={tab === 'links'} onClick={() => setTab('links')}>문진 링크</NavButton>
      <NavButton active={tab === 'questionnaires'} onClick={() => setTab('questionnaires')}>제출 문진</NavButton>
      <NavButton active={tab === 'admissions'} onClick={() => setTab('admissions')}>입원 결과</NavButton>
    </aside>
    <main><header className="topbar"><div><h1>MEDIFLOW</h1><small>파킨슨병 임상 문서 관리</small></div>
      <div className="user-session"><span>{name}</span><button onClick={logout}>로그아웃</button></div>
    </header>{tab === 'links' ? <Links /> : tab === 'questionnaires' ? <Questionnaires /> : <Admissions />}</main>
  </div>;
}

export function LoginGate() {
  return <main className="login-gate">
    <header className="portal-header"><div className="portal-brand"><i>M</i><span><b>MEDIFLOW</b><small>Clinical Documentation</small></span></div></header>
    <section className="login-card">
      <p className="eyebrow">CLINICIAN ACCESS</p>
      <h1>의료진 로그인</h1>
      <p>사전 문진 링크 전송과 제출 문진·입원 결과 확인은<br />허용된 의료진 계정만 이용할 수 있습니다.</p>
      <a className="kakao-login" href={pdApi.loginUrl}><span>카카오로 로그인</span><b>→</b></a>
      <small>카카오 회원번호 허용 목록과 보안 세션으로 접근을 제한합니다.</small>
    </section>
  </main>;
}

function PortalHome({ name, onOpen, onLogout }: {
  name: string; onOpen: (tab: Tab) => void; onLogout: () => void;
}) {
  const steps: { tab: Tab; label: string; description: string }[] = [
    { tab: 'links', label: '문진 링크 전송', description: '1회용 보안 링크 생성' },
    { tab: 'questionnaires', label: '제출 문진 검토', description: '환자 설명과 문진 확인' },
    { tab: 'admissions', label: '입원 결과 작성', description: 'EMR 연결·검토·승인' },
  ];
  return <div className="portal-home-shell">
    <header className="portal-header">
      <div className="portal-brand"><i>M</i><span><b>MEDIFLOW</b><small>Clinical Documentation</small></span></div>
      <div className="user-session"><span>{name}</span><button onClick={onLogout}>로그아웃</button></div>
    </header>
    <section className="agent-home">
      <div className="agent-hero">
        <div className="agent-copy">
          <p className="eyebrow">ONE PATIENT · ONE CLINICAL FLOW</p>
          <h1>한 명의 환자,<br />하나의 진료 흐름</h1>
          <p>환자가 방문 전에 작성한 사전 문진을 시작점으로, 의료진 검토와 입원 결과 보고서까지 한 흐름에서 관리합니다.</p>
          <div className="home-primary-actions">
            <button className="hero-start" onClick={() => onOpen('links')}><i>＋</i><span><strong>사전 문진 보내기</strong><small>1회용 문진 링크 생성</small></span><b>→</b></button>
            <button className="patient-history-start" onClick={() => onOpen('questionnaires')}><i>문진</i><span><strong>제출 문진 확인</strong><small>환자 설명·검토 문안 조회</small></span><b>→</b></button>
          </div>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <div className="orbit-center"><i>M</i><strong>Clinical<br />Flow</strong></div>
          {['링크', '작성', '제출', '검토', '입원', '결과'].map((label, index) => <span className={`orbit-item orbit-${index}`} key={label}>{label}</span>)}
        </div>
      </div>

      <div className="journey-board">
        <header><div><p className="eyebrow">CLINICAL DOCUMENT JOURNEY</p><h2>사전 문진부터 입원 결과까지</h2></div><span>새 진료 생성 없이 제출된 사전 문진에서 흐름을 시작합니다.</span></header>
        <div className="journey-steps">
          {steps.map((step, index) => <button key={step.tab} onClick={() => onOpen(step.tab)}>
            <i>{index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span>{index < steps.length - 1 && <b>→</b>}
          </button>)}
        </div>
      </div>

      <div className="home-bottom-grid">
        <section className="agent-info-card"><i className="agent-info-icon">✓</i><div><strong>개인정보 없는 1회용 링크</strong><p>원본 토큰은 저장하지 않고 만료·철회·제출 후 재사용을 차단합니다.</p></div></section>
        <section className="agent-info-card"><i className="agent-info-icon doctor-icon">D</i><div><strong>허용된 의료진만 접근</strong><p>카카오 회원번호 허용 목록과 서버 세션으로 관리 화면을 보호합니다.</p></div></section>
        <section className="active-encounter-card"><div><p className="eyebrow">ADMISSION REPORT</p><strong>입원 결과를 한곳에서</strong><span>검토된 문진과 입원 EMR을 연결해 결과 보고서를 확인합니다.</span></div><button onClick={() => onOpen('admissions')}>입원 결과 보기 →</button></section>
      </div>
    </section>
  </div>;
}

export function Links() {
  const [items, setItems] = useState<Invite[]>([]);
  const [result, setResult] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const load = () => pdApi.invites().then(setItems).catch((reason: Error) => setError(reason.message));
  useEffect(() => { load(); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const form = new FormData(event.currentTarget);
    try {
      const response = await pdApi.invite({ recipient: form.get('recipient'), channel: form.get('channel'),
        plannedDate: form.get('plannedDate'), expiresInHours: Number(form.get('hours')) });
      setResult(response); load(); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '링크를 만들지 못했습니다.'); }
  }
  return <Section title="사전 문진 링크 전송" description="개인정보가 없는 1회용 링크를 생성하고 설정된 병원 전송 웹훅으로 보냅니다.">
    <form className="card invite-form" onSubmit={create}>
      <label>전송 방식<select name="channel"><option>SMS</option><option>KAKAO</option><option>EMAIL</option></select></label>
      <label>수신처<input name="recipient" required placeholder="전화번호 또는 이메일" /></label>
      <label>진료/입원 예정일<input name="plannedDate" type="date" required /></label>
      <label>유효 시간<input name="hours" type="number" min="1" max="168" defaultValue="24" required /></label>
      <button className="primary">링크 생성 및 전송</button>
    </form>
    {result?.link && <div className="card result"><strong>{result.deliveryStatus === 'SENT' ? '전송 완료' : '링크 생성 완료'}</strong>
      <p>{result.deliveryMessage}</p><div className="copy"><input readOnly value={result.link} />
        <button onClick={() => navigator.clipboard.writeText(result.link || '')}>복사</button></div>
      <div className="qr-code"><QRCodeSVG value={result.link} size={180} level="M" marginSize={2} />
        <span>병원 화면에서 환자가 직접 스캔할 수 있습니다.</span></div></div>}
    {error && <p className="error">{error}</p>}
    <DataTable headers={['생성일', '예정일', '방식', '상태', '전송', '만료', '']}
      rows={items.map((item) => [format(item.createdAt), item.plannedDate, item.channel,
        statusText(item.status), statusText(item.deliveryStatus), format(item.expiresAt),
        <button key={item.id} className="danger" onClick={() => pdApi.revoke(item.id).then(load)}>철회</button>])} />
  </Section>;
}

function Questionnaires() {
  const [items, setItems] = useState<Questionnaire[]>([]);
  const [selected, setSelected] = useState<Questionnaire | null>(null);
  const [chart, setChart] = useState('');
  const [error, setError] = useState('');
  const load = (filters: Record<string, string> = {}) => pdApi.questionnaires(filters).then(setItems)
    .catch((reason: Error) => setError(reason.message));
  useEffect(() => { load(); }, []);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); load(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>);
  }
  function choose(item: Questionnaire) { setSelected(item); setChart(item.chart); }
  async function review() {
    if (!selected) return;
    const response = await pdApi.review(selected.id, { chart, version: selected.version });
    setSelected(response); setChart(response.chart); load();
  }
  return <Section title="제출 문진 검토" description="환자 설명 원문·구조화 결과·검토 문안을 함께 확인합니다.">
    <form className="card search-form" onSubmit={search}>
      <input name="name" placeholder="이름" /><input name="birth6" placeholder="생년월일 앞 6자리" pattern="[0-9]{6}" />
      <select name="sex"><option value="">성별 전체</option><option value="M">남성</option><option value="F">여성</option></select>
      <input name="plannedDate" type="date" /><select name="status"><option value="">상태 전체</option>
        <option value="UNREVIEWED">미검토</option><option value="REVIEWED">검토완료</option></select>
      <button className="primary">검색</button>
    </form>
    {error && <p className="error">{error}</p>}
    <div className="split-layout"><DataTable headers={['환자', '예정일', '성별', '작성자', '상태', '제출일']}
      rows={items.map((item) => [<button key={item.id} className="text-button" onClick={() => choose(item)}>{item.name}</button>,
        item.plannedDate, item.sex, item.respondentType, statusText(item.status), format(item.submittedAt)])} />
      {selected && <div className="card review-panel"><h3>{selected.name} 문진</h3>
        <details open><summary>환자 설명</summary><JsonView value={selected.rawJson} /></details>
        <details><summary>구조화 데이터와 출처</summary><JsonView value={selected.structuredJson} /></details>
        <label>의료진 검토 문안<textarea rows={22} value={chart} onChange={(event) => setChart(event.target.value)} /></label>
        <button className="primary" onClick={review}>검토 완료 저장</button></div>}
    </div>
  </Section>;
}

export function Admissions() {
  const [patients, setPatients] = useState<Questionnaire[]>([]);
  const [items, setItems] = useState<Admission[]>([]);
  const [current, setCurrent] = useState<Admission | null>(null);
  const [report, setReport] = useState('');
  const [attachments, setAttachments] = useState<AdmissionAttachment[]>([]);
  const [clinicalTests, setClinicalTests] = useState<ClinicalTestBundle>({ tests: [], comparisons: [] });
  const [error, setError] = useState('');
  const loadAdmissions = () => pdApi.admissions().then(setItems);
  useEffect(() => { pdApi.questionnaires().then(setPatients); loadAdmissions(); }, []);
  useEffect(() => { if (current) {
    pdApi.attachments(current.id).then(setAttachments);
    pdApi.clinicalTests(current.id).then(setClinicalTests);
  } }, [current]);
  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const form = new FormData(event.currentTarget);
    const patient = patients.find((item) => item.id === form.get('questionnaireId'));
    if (!patient) { setError('사전 문진 환자를 선택해 주세요.'); return; }
    try {
      const response = await pdApi.parseAdmission({ name: patient.name, birth6: patient.birth6,
        sex: patient.sex, rawEmr: form.get('rawEmr') });
      setCurrent(response); setReport(response.report); loadAdmissions();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'EMR을 처리하지 못했습니다.'); }
  }
  function select(item: Admission) { setCurrent(item); setReport(item.report); }
  async function save() {
    if (!current) return; const response = await pdApi.saveReport(current.id, { report, version: current.version });
    setCurrent(response); setReport(response.report); loadAdmissions();
  }
  async function approve() { if (!current) return; const response = await pdApi.approve(current.id);
    setCurrent(response); loadAdmissions(); }
  async function pdf() { if (!current) return; saveBlob(await pdApi.reportPdf(current.id), `admission-report-${current.id}.pdf`); }
  async function upload(file: File) { if (!current) return; await pdApi.uploadAttachment(current.id, file);
    setAttachments(await pdApi.attachments(current.id)); }
  async function attachment(item: AdmissionAttachment) { if (!current) return;
    saveBlob(await pdApi.downloadAttachment(current.id, item.id), item.fileName); }
  async function addTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!current) return; const form = new FormData(event.currentTarget);
    await pdApi.addClinicalTest(current.id, Object.fromEntries(form));
    setClinicalTests(await pdApi.clinicalTests(current.id));
    if (current.status === 'DRAFT') {
      const rebuilt = await pdApi.rebuildReport(current.id); setCurrent(rebuilt); setReport(rebuilt.report);
    }
    event.currentTarget.reset();
  }

  const reviewedPatients = useMemo(() => patients.filter((item) => item.status === 'REVIEWED'), [patients]);
  return <Section title="입원 결과 보고서" description="검토된 사전 문진 환자와 입원 EMR을 연결해 구조화·비교·결과지를 만듭니다.">
    <form className="card admission-form" onSubmit={parse}>
      <label>검토된 사전 문진 환자<select name="questionnaireId" required><option value="">환자 선택</option>
        {reviewedPatients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.birth6} · {item.plannedDate}</option>)}</select></label>
      <label>EMR 원문<textarea name="rawEmr" rows={12} required placeholder={'2026-01-01\t09:00\tS/O\t# 보행 NRS7 -> NRS6\n- 환자 설명\n- 관찰 내용'} /></label>
      <button className="primary">구조화 및 결과지 생성</button>
    </form>
    {error && <p className="error">{error}</p>}
    <div className="split-layout"><DataTable headers={['환자', '상태', '작성일']}
      rows={items.map((item) => [<button key={item.id} className="text-button" onClick={() => select(item)}>{item.name}</button>,
        statusText(item.status), format(item.createdAt)])} />
      {current && <div className="card review-panel"><h3>{current.name} 입원 결과</h3>
        <ParsedSummary json={current.parsedJson} />
        <label>검사·EMR 첨부파일<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt"
          disabled={current.status === 'APPROVED'} onChange={(event) => {
            const file = event.target.files?.[0]; if (file) upload(file).catch((reason: Error) => setError(reason.message));
          }} /></label>
        <ul className="attachments">{attachments.map((item) => <li key={item.id}><button onClick={() => attachment(item)}>{item.fileName}</button><span>{fileSize(item.size)}</span></li>)}</ul>
        <form className="clinical-test-form" onSubmit={(event) => addTest(event).catch((reason: Error) => setError(reason.message))}>
          <h4>검사 결과 구조화 입력</h4><input name="testDate" type="date" required />
          <select name="category" required><option value="PEDISOL">PediSol</option><option value="HRV">HRV/자율신경</option>
            <option value="LAB">혈액·소변검사</option><option value="RADIOLOGY">방사선</option>
            <option value="PD_SCALE">PD scale</option><option value="OTHER">기타</option></select>
          <input name="metric" placeholder="측정 항목" required /><input name="value" placeholder="값 또는 판독" required />
          <input name="unit" placeholder="단위" /><input name="condition" placeholder="조건(ON/OFF 등)" />
          <input name="raw" placeholder="원문 또는 출처 메모" /><button disabled={current.status === 'APPROVED'}>검사 추가</button>
        </form>
        <DataTable headers={['날짜', '분류', '항목', '값', '단위', '조건']} rows={clinicalTests.tests.map((test) =>
          [test.testDate, test.category, test.metric, test.value, test.unit || '-', test.condition || '-'])} />
        {clinicalTests.comparisons.length > 0 && <div className="comparison-list"><strong>동일 조건 전후 비교</strong>
          {clinicalTests.comparisons.map((comparison, index) => <p key={`${comparison.metric}-${index}`}>
            {comparison.metric}: {comparison.first} ({comparison.firstDate}) → {comparison.last} ({comparison.lastDate})
          </p>)}</div>}
        <label>환자용 결과지<textarea rows={28} value={report} onChange={(event) => setReport(event.target.value)}
          disabled={current.status === 'APPROVED'} /></label>
        <div className="actions"><button onClick={save} disabled={current.status === 'APPROVED'}>검토 저장</button>
          <button className="primary" onClick={approve} disabled={current.status !== 'REVIEWED'}>최종 승인</button>
          <button onClick={pdf}>PDF 다운로드</button><button onClick={() => window.print()}>인쇄</button></div>
      </div>}
    </div>
  </Section>;
}

function ParsedSummary({ json }: { json: string }) {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(json) as Record<string, unknown>; } catch { return <p className="error">구조화 데이터를 읽을 수 없습니다.</p>; }
  const counts = ['entries', 'medications', 'tests', 'events', 'comparisons', 'testComparisons'].map((key) => {
    const value = parsed[key]; return [key, Array.isArray(value) ? value.length : 0] as const;
  });
  return <details><summary>구조화 결과 요약</summary><div className="metric-grid">
    {counts.map(([key, count]) => <div key={key}><strong>{count}</strong><span>{key}</span></div>)}</div>
    <JsonView value={json} /></details>;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset><legend>{title}</legend>{children}</fieldset>;
}
function Field({ label, name, value, update, required, ...props }: {
  label: string; name: string; value: string; update: (name: string, value: string) => void;
  required?: boolean; [key: string]: unknown;
}) {
  return <label>{label}<input name={name} value={value} required={required}
    onChange={(event) => update(name, event.target.value)} {...props} /></label>;
}
function TextField({ label, name, value, update, required }: {
  label: string; name: string; value: string; update: (name: string, value: string) => void; required?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  return <label>{label}<textarea ref={textareaRef} className="auto-grow-textarea" name={name} rows={3} maxLength={2000} value={value} required={required}
    onChange={(event) => update(name, event.target.value)} /></label>;
}
function SelectField({ label, name, value, update, options, required }: {
  label: string; name: string; value: string; update: (name: string, value: string) => void;
  options: [string, string][]; required?: boolean;
}) {
  return <label>{label}<select name={name} value={value} required={required}
    onChange={(event) => update(name, event.target.value)}>{options.map(([key, text]) =>
      <option key={key} value={key}>{text}</option>)}</select></label>;
}
function TriState(props: Omit<Parameters<typeof SelectField>[0], 'options'>) {
  return <SelectField {...props} options={[['없음', '없음 (-)'], ['있음', '있음 (+)'], ['모름', '모름 (UK)']]} />;
}
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="workspace-section"><h2>{title}</h2><p className="description">{description}</p>{children}</section>;
}
function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{children}</button>;
}
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) =>
      <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>저장된 데이터가 없습니다.</td></tr>}</tbody></table></div>;
}
function JsonView({ value }: { value: string }) {
  let formatted = value;
  try { formatted = JSON.stringify(JSON.parse(value), null, 2); } catch { /* keep original text */ }
  return <pre>{formatted}</pre>;
}
function Centered({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <main className="centered"><div className="card"><h1>{title}</h1><p>{text}</p>{action}</div></main>;
}
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}
function statusText(value: string) {
  return ({ ISSUED: '발급', SENT: '전송완료', IN_PROGRESS: '작성중', SUBMITTED: '제출완료',
    REVOKED: '철회', EXPIRED: '만료', NOT_CONFIGURED: '전송설정 없음', FAILED: '실패',
    UNREVIEWED: '미검토', REVIEWED: '검토완료', APPROVED: '승인완료', DRAFT: '초안' } as Record<string, string>)[value] || value;
}
const format = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR') : '-';
const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

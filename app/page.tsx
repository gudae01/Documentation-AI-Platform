'use client';

import { useState } from 'react';

const transcript = [
  { speaker: '의사', role: 'doctor', time: '00:18', text: '지난번보다 속 불편한 증상은 어떠셨어요?' },
  { speaker: '환자', role: 'patient', time: '00:24', text: '통증은 덜한데 식후에 명치가 답답하고, 가끔 신물이 올라와요.' },
  { speaker: '의사', role: 'doctor', time: '00:37', text: '야간에도 불편한가요? 처방드린 약은 규칙적으로 복용하셨고요?' },
  { speaker: '환자', role: 'patient', time: '00:46', text: '밤에는 괜찮고 약은 아침, 저녁으로 챙겨 먹었습니다.' },
];

const soap = [
  ['S', '식후 명치 답답함과 간헐적인 신물 역류를 호소함. 이전보다 통증은 감소했으며 야간 증상은 없음.'],
  ['O', '복부 진찰상 압통 없음. HRV 39 ms (이전 28 ms).'],
  ['A', '기능성 소화불량 — 담당의 확인 내용'],
  ['P', '기존 처방 유지. 2주 후 경과 관찰 예정.'],
];

const navItems = ['홈', '환자', '진료 기록', '검사', '문서함'];

const soapLabels: Record<string, string> = {
  S: 'Subjective',
  O: 'Objective',
  A: 'Assessment',
  P: 'Plan',
};

export default function Home() {
  const [recording, setRecording] = useState(true);
  const [captureMode, setCaptureMode] = useState<'live' | 'upload'>('live');
  const [fileSelected, setFileSelected] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [soapValues, setSoapValues] = useState(() => Object.fromEntries(soap));

  return (
    <main className="app-shell">
      <aside className="nav-rail">
        <div className="brand-mark" aria-label="MediFlow 홈">M</div>
        <nav aria-label="주요 메뉴">
          {navItems.map((item, index) => (
            <button className={index === 2 ? 'nav-item active' : 'nav-item'} key={item}>
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
            <input aria-label="환자 검색" placeholder="환자명 또는 등록번호 검색" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="user-area">
            <button className="notification" aria-label="알림"><i /></button>
            <div className="avatar">김</div>
            <div><strong>김민준 원장</strong><small>소화기내과</small></div>
            <button className="chevron" aria-label="계정 메뉴">⌄</button>
          </div>
        </header>

        <div className="patient-bar">
          <div className="patient-avatar">이</div>
          <div className="patient-identity">
            <div><h1>이서연</h1><span>여 · 42세</span><span className="patient-id">P-2026-01842</span></div>
            <p>1974.06.18 <i /> 초진 2026.07.03 <i /> 최근 내원 2026.08.25</p>
          </div>
          <div className="patient-tags">
            <span>주호소 <b>명치 답답함</b></span>
            <span>알레르기 <b className="safe">없음</b></span>
          </div>
          <button className="ghost-button">환자 차트 열기 <b>↗</b></button>
        </div>

        <div className="encounter-head">
          <div>
            <p className="eyebrow">TODAY · 2026.08.25</p>
            <h2>진료 기록 <span className="visit-chip">재진</span></h2>
          </div>
          <div className="workflow-state" aria-label="문서 처리 단계">
            <span className="done"><i>✓</i>AI 생성</span><b />
            <span className={approved ? 'done' : 'current'}><i>{approved ? '✓' : '2'}</i>의사 검토</span><b />
            <span className={approved ? 'current' : ''}><i>{approved ? '✓' : '3'}</i>최종 승인</span>
          </div>
          <button className="more-button" aria-label="더 보기">•••</button>
        </div>

        <div className="content-grid">
          <section className="panel transcript-panel">
            <header className="panel-title">
              <div><p className="eyebrow">LIVE TRANSCRIPT</p><h3>실시간 진료 기록</h3></div>
              <div className="capture-switch" role="tablist" aria-label="오디오 입력 방식">
                <button className={captureMode === 'live' ? 'active' : ''} onClick={() => setCaptureMode('live')}>실시간 녹음</button>
                <button className={captureMode === 'upload' ? 'active' : ''} onClick={() => setCaptureMode('upload')}>파일 업로드</button>
              </div>
            </header>

            {captureMode === 'live' ? (
              <>
                <div className="record-console">
                  <div className="timer"><span>00</span><b>:</b><span>03</span><b>:</b><span>12</span></div>
                  <div className="wave" aria-hidden="true">
                    {[18,34,22,48,29,56,31,40,21,51,37,26,45,20,33,49,25,38,17,30].map((height, index) => (
                      <i style={{height}} key={index} />
                    ))}
                  </div>
                  <div className="record-controls">
                    <span className={recording ? 'record-status' : 'record-status paused'}><i /> {recording ? '녹음 중' : '일시 정지'}</span>
                    <button className="stop-recording" onClick={() => setRecording(!recording)}><i /> {recording ? '중지' : '재개'}</button>
                  </div>
                </div>

                <div className="transcript-list">
                  {transcript.map((line) => (
                    <article className={`transcript-line ${line.role}`} key={line.time}>
                      <div className="speaker-avatar">{line.speaker[0]}</div>
                      <div>
                        <div className="speaker-meta"><strong>{line.speaker}</strong><time>{line.time}</time></div>
                        <p>{line.text}</p>
                      </div>
                      <button aria-label={`${line.time} 대화 수정`}>수정</button>
                    </article>
                  ))}
                  <div className="listening"><i /><span>음성을 듣고 있습니다</span><b>•••</b></div>
                </div>
              </>
            ) : (
              <div className="upload-workspace">
                {!fileSelected ? (
                  <div className="dropzone">
                    <div className="upload-icon"><i /></div>
                    <h4>진료 녹음파일 가져오기</h4>
                    <p>iPhone 음성 메모와 Android 녹음파일을 사용할 수 있습니다.</p>
                    <button onClick={() => setFileSelected(true)}>파일 선택</button>
                    <small>M4A, MP3, WAV, AAC · 최대 500MB</small>
                  </div>
                ) : (
                  <>
                    <div className="selected-file">
                      <div className="file-type">M4A</div>
                      <div><strong>진료녹음_20260825.m4a</strong><span>23.5 MB <i /> 18분 32초</span></div>
                      <span className="secure-file">내부 저장소</span>
                      <button aria-label="파일 제거" onClick={() => { setFileSelected(false); setAnalysisStarted(false); }}>×</button>
                    </div>
                    {!analysisStarted ? (
                      <div className="analysis-ready">
                        <div><i>✓</i><p><strong>파일 검증 완료</strong><span>Codec AAC · 44.1kHz · 악성 파일 없음</span></p></div>
                        <button onClick={() => setAnalysisStarted(true)}>분석 시작 <span>→</span></button>
                      </div>
                    ) : (
                      <div className="pipeline-card">
                        <div className="pipeline-heading"><div><strong>오디오 분석 중</strong><span>예상 소요 시간 약 3분</span></div><b>54%</b></div>
                        <div className="progress-track"><i /></div>
                        <ol>
                          {['파일 확인', 'Audio 변환', '음성 구간 탐지', 'STT', '의사/환자 화자 구분', '의료용어 보정', 'SOAP 생성'].map((step, index) => (
                            <li className={index < 3 ? 'complete' : index === 3 ? 'processing' : ''} key={step}>
                              <i>{index < 3 ? '✓' : index === 3 ? '•••' : index + 1}</i><span>{step}</span><b>{index < 3 ? '완료' : index === 3 ? '진행 중' : '대기'}</b>
                            </li>
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
              <span><i>✓</i> 화자 자동 구분</span>
              <button>+ 메모 추가</button>
            </footer>
          </section>

          <aside className="panel soap-panel">
            <header className="panel-title soap-title">
              <div><p className="eyebrow">AI DRAFT</p><h3>SOAP 초안</h3></div>
              <span className={approved ? 'approved-chip' : 'ai-chip'}><i>{approved ? '✓' : '✦'}</i> {approved ? '최종 승인' : 'AI 생성'}</span>
            </header>
            <div className="grounding-note"><i>✓</i><p><strong>입력 기반 검증 완료</strong><span>Transcript에 있는 내용만 사용했습니다.</span></p></div>
            <div className="soap-sections">
              {soap.map(([letter, text]) => (
                <label className="soap-field" key={letter}>
                  <span className={`soap-letter soap-${letter.toLowerCase()}`}>{letter}</span>
                  <span className="soap-label">{soapLabels[letter]}</span>
                  <textarea
                    value={soapValues[letter]}
                    onChange={(event) => setSoapValues({...soapValues, [letter]: event.target.value})}
                    aria-label={`${letter} 항목`}
                    readOnly={approved}
                  />
                </label>
              ))}
            </div>
            <div className="soap-actions">
              <button className="secondary-button">AI 원본 비교</button>
              <button className="primary-button" onClick={() => setReviewOpen(true)}>{approved ? '승인 기록 보기' : '검토 화면으로'} <span>→</span></button>
            </div>
            <p className="safety-copy"><i>i</i> AI가 작성한 초안입니다. 최종 승인 전 반드시 내용을 확인해 주세요.</p>
          </aside>
        </div>
      </section>

      {reviewOpen && (
        <div className="review-layer" role="dialog" aria-modal="true" aria-label="SOAP 검토 및 승인">
          <button className="layer-backdrop" aria-label="검토 화면 닫기" onClick={() => setReviewOpen(false)} />
          <section className="review-drawer">
            <header>
              <div><p className="eyebrow">DOCTOR REVIEW</p><h3>SOAP 검토 및 승인</h3></div>
              <button aria-label="닫기" onClick={() => setReviewOpen(false)}>×</button>
            </header>
            <div className="review-patient"><span>이서연 · P-2026-01842</span><b>2026.08.25 진료</b><i>{approved ? 'FINALIZED' : 'DOCTOR REVIEWING'}</i></div>
            <div className="review-alert"><i>i</i><p><strong>의사의 확인이 필요한 AI 초안입니다.</strong><span>원본 Transcript와 숫자, 진단 및 처방 내용을 대조해 주세요.</span></p></div>
            <div className="compare-legend"><span><i className="original" />AI 원본</span><span><i className="revision" />의사 수정본</span></div>
            <div className="compare-list">
              {soap.map(([letter, original]) => (
                <article className="compare-section" key={letter}>
                  <div className={`soap-letter soap-${letter.toLowerCase()}`}>{letter}</div>
                  <div>
                    <strong>{soapLabels[letter]}</strong>
                    <div className="compare-grid">
                      <p>{original}</p>
                      <p className={soapValues[letter] !== original ? 'changed' : ''}>{soapValues[letter]}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="validation-card"><div><i>✓</i><p><strong>Validation 6개 항목 통과</strong><span>숫자 · 약품명 · 검사명 · 입력 근거 · SOAP 구분 · 진단 발화</span></p></div><button>상세 보기</button></div>
            <footer>
              <button className="secondary-button" onClick={() => setReviewOpen(false)}>수정 계속하기</button>
              <button className="approve-button" disabled={approved} onClick={() => setApproved(true)}>{approved ? '승인 완료됨' : '확인 후 최종 승인'} <span>✓</span></button>
            </footer>
            <small className="audit-note">승인 시 담당의, 시간, 변경 이력이 감사 로그에 저장됩니다.</small>
          </section>
        </div>
      )}
    </main>
  );
}

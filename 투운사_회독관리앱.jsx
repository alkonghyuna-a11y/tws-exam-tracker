import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ────────────────────────────────────────────────────────────
   투자자산운용사 모의고사 회독 관리
   문항 매핑 기준: 투운사 세부과목 구성표 (100문항)
   ──────────────────────────────────────────────────────────── */

const SECTIONS = [
  { sid: 1, code: "S01", subject: 1, name: "세제관련 법규/세무전략", start: 1, end: 7 },
  { sid: 2, code: "S02", subject: 1, name: "금융상품", start: 8, end: 15 },
  { sid: 3, code: "S03", subject: 1, name: "부동산관련 상품", start: 16, end: 20 },
  { sid: 4, code: "S04", subject: 2, name: "대안투자운용/투자전략", start: 21, end: 25 },
  { sid: 5, code: "S05", subject: 2, name: "해외증권투자운용/투자전략", start: 26, end: 30 },
  { sid: 6, code: "S06", subject: 2, name: "투자분석기법", start: 31, end: 42 },
  { sid: 7, code: "S07", subject: 2, name: "리스크관리", start: 43, end: 50 },
  { sid: 8, code: "S08", subject: 3, name: "직무윤리", start: 51, end: 55 },
  { sid: 9, code: "S09", subject: 3, name: "자본시장 관련 법률", start: 56, end: 66 },
  { sid: 10, code: "S10", subject: 3, name: "한국금융투자협회규정", start: 67, end: 69 },
  { sid: 11, code: "S11", subject: 3, name: "주식투자운용/투자전략", start: 70, end: 75 },
  { sid: 12, code: "S12", subject: 3, name: "채권투자운용/투자전략", start: 76, end: 81 },
  { sid: 13, code: "S13", subject: 3, name: "파생상품투자운용/투자전략", start: 82, end: 87 },
  { sid: 14, code: "S14", subject: 3, name: "투자운용결과분석", start: 88, end: 91 },
  { sid: 15, code: "S15", subject: 3, name: "거시경제", start: 92, end: 95 },
  { sid: 16, code: "S16", subject: 3, name: "분산투자기법", start: 96, end: 100 },
];

const SUBJECTS = [
  { no: 1, name: "금융상품 및 세제", total: 20, cut: 8 },
  { no: 2, name: "투자운용 및 전략Ⅱ 및 투자분석", total: 30, cut: 12 },
  { no: 3, name: "직무윤리 및 법규/투자운용 및 전략Ⅰ 등", total: 50, cut: 20 },
];

const PASS_TOTAL = 70;

const sectionOf = (qno) => SECTIONS.find((s) => qno >= s.start && qno <= s.end);
const emptyArr = () => Array(100).fill(0);
const storeKey = (examId) => `tws:v1:${examId}`;
const EXAM_LIST_KEY = "tws:v1:examlist";
const newExamId = () => "e" + Date.now().toString(36) + Math.floor(Math.random() * 900 + 100);

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/* 붙여넣기 문자열 → 100문항 배열 파싱
   허용: "1234123..." / "1.③ 2.① ..." / "1 2 3 4" / 줄바꿈·쉼표 혼용 */
function parseBulk(raw) {
  if (!raw) return null;
  let t = raw.replace(/[①②③④]/g, (c) => ({ "①": "1", "②": "2", "③": "3", "④": "4" }[c]));
  // "12.3" 형태(문항.정답) 우선 처리
  const paired = [...t.matchAll(/(\d{1,3})\s*[.:)\-]\s*([1-4])(?![0-9])/g)];
  if (paired.length >= 20) {
    const out = emptyArr();
    paired.forEach((m) => {
      const q = parseInt(m[1], 10);
      const a = parseInt(m[2], 10);
      if (q >= 1 && q <= 100) out[q - 1] = a;
    });
    return out;
  }
  const digits = t.replace(/[^1-4]/g, "");
  if (digits.length === 0) return null;
  const out = emptyArr();
  for (let i = 0; i < Math.min(100, digits.length); i++) out[i] = parseInt(digits[i], 10);
  return out;
}

/* 채점 */
function grade(answers, key) {
  const marks = answers.map((a, i) => (key[i] === 0 ? null : a === 0 ? false : a === key[i]));
  const correct = marks.filter((m) => m === true).length;
  const bySection = SECTIONS.map((s) => {
    let c = 0, n = 0;
    for (let q = s.start; q <= s.end; q++) {
      n++;
      if (marks[q - 1] === true) c++;
    }
    return { ...s, correct: c, total: n, rate: n ? c / n : 0 };
  });
  const bySubject = SUBJECTS.map((sub) => {
    const secs = bySection.filter((s) => s.subject === sub.no);
    const c = secs.reduce((a, b) => a + b.correct, 0);
    return { ...sub, correct: c, rate: c / sub.total, fail: c < sub.cut };
  });
  const passed = correct >= PASS_TOTAL && !bySubject.some((s) => s.fail);
  return { marks, correct, bySection, bySubject, passed };
}

/* ───────────────────────── 앱 ───────────────────────── */

export default function App() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [examsReady, setExamsReady] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [tab, setTab] = useState("solve");
  const [key, setKey] = useState(emptyArr());
  const [draft, setDraft] = useState(emptyArr());
  const [attempts, setAttempts] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkTarget, setBulkTarget] = useState("key");
  const saveTimer = useRef(null);

  /* 시험 목록 불러오기 */
  useEffect(() => {
    let alive = true;
    (async () => {
      let list = [];
      try {
        const r = await window.storage.get(EXAM_LIST_KEY);
        if (r) list = JSON.parse(r.value);
      } catch (e) {
        list = [];
      }
      if (!alive) return;
      setExams(Array.isArray(list) ? list : []);
      setExamId(list?.[0]?.id ?? "");
      setExamsReady(true);
      if (!list || list.length === 0) setManageOpen(true);
    })();
    return () => { alive = false; };
  }, []);

  const saveExams = useCallback(async (list) => {
    setExams(list);
    try {
      await window.storage.set(EXAM_LIST_KEY, JSON.stringify(list));
    } catch (e) {
      setNotice("시험 목록 저장에 실패했습니다. 잠시 후 다시 시도하세요.");
    }
  }, []);

  const addExam = async (label) => {
    const name = (label || "").trim();
    if (!name) return;
    const item = { id: newExamId(), label: name };
    const next = [...exams, item];
    await saveExams(next);
    setExamId(item.id);
  };

  const renameExam = async (id, label) => {
    const name = (label || "").trim();
    if (!name) return;
    await saveExams(exams.map((e) => (e.id === id ? { ...e, label: name } : e)));
  };

  const removeExam = async (id) => {
    const next = exams.filter((e) => e.id !== id);
    await saveExams(next);
    try {
      await window.storage.delete(storeKey(id));
    } catch (e) {
      /* 기록이 없으면 무시 */
    }
    if (examId === id) setExamId(next[0]?.id ?? "");
  };

  /* 회차 데이터 불러오기 */
  useEffect(() => {
    if (!examsReady) return;
    let alive = true;
    setLoading(true);
    setResult(null);
    if (!examId) {
      setKey(emptyArr());
      setDraft(emptyArr());
      setAttempts([]);
      setElapsed(0);
      setRunning(false);
      setLoading(false);
      return;
    }
    (async () => {
      let data = null;
      try {
        const r = await window.storage.get(storeKey(examId));
        if (r) data = JSON.parse(r.value);
      } catch (e) {
        data = null;
      }
      if (!alive) return;
      setKey(data?.key ?? emptyArr());
      setDraft(data?.draft ?? emptyArr());
      setAttempts(data?.attempts ?? []);
      setElapsed(data?.elapsed ?? 0);
      setRunning(false);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [examId, examsReady]);

  /* 저장 (디바운스) */
  const persist = useCallback((next) => {
    if (!examId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(storeKey(examId), JSON.stringify(next));
      } catch (e) {
        setNotice("저장에 실패했습니다. 잠시 후 다시 시도하세요.");
      }
    }, 900);
  }, [examId]);

  useEffect(() => {
    if (loading) return;
    persist({ key, draft, attempts, elapsed });
  }, [key, draft, attempts, elapsed, loading, persist]);

  /* 타이머 */
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const answeredCount = draft.filter((v) => v > 0).length;
  const keyCount = key.filter((v) => v > 0).length;
  const round = attempts.length + 1;

  const pick = (qno, val) => {
    if (tab === "key") {
      setKey((prev) => {
        const n = [...prev];
        n[qno - 1] = n[qno - 1] === val ? 0 : val;
        return n;
      });
    } else {
      if (!running && answeredCount === 0) setRunning(true);
      setDraft((prev) => {
        const n = [...prev];
        n[qno - 1] = n[qno - 1] === val ? 0 : val;
        return n;
      });
    }
  };

  const doGrade = () => {
    if (keyCount < 100) {
      setNotice(`정답이 ${keyCount}/100 등록되어 있습니다. 정답 등록 탭에서 100개를 모두 채워주세요.`);
      return;
    }
    const g = grade(draft, key);
    setRunning(false);
    const rec = {
      round,
      date: new Date().toISOString(),
      answers: [...draft],
      marks: g.marks,
      correct: g.correct,
      elapsed,
    };
    setAttempts((prev) => [...prev, rec]);
    setResult({ ...g, round, elapsed });
    setNotice("");
  };

  const resetDraft = () => {
    setDraft(emptyArr());
    setElapsed(0);
    setRunning(false);
    setResult(null);
  };

  const applyBulk = () => {
    const parsed = parseBulk(bulkText);
    if (!parsed) {
      setNotice("숫자를 읽지 못했습니다. 1~4 사이 숫자로 입력해 주세요.");
      return;
    }
    if (bulkTarget === "key") setKey(parsed);
    else setDraft(parsed);
    setBulkOpen(false);
    setBulkText("");
    setNotice(`${parsed.filter((v) => v > 0).length}개 문항을 채웠습니다.`);
  };

  const deleteAttempt = (idx) => {
    setAttempts((prev) => prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, round: i + 1 })));
    setResult(null);
  };

  /* 문항별 이력 분석 */
  const history = useMemo(() => {
    return Array.from({ length: 100 }, (_, i) => {
      const seq = attempts.map((a) => a.marks?.[i]);
      const done = seq.filter((v) => v === true || v === false);
      const wrong = done.filter((v) => v === false).length;
      let status = "none";
      if (done.length > 0) {
        if (wrong === done.length) status = "unsolved";
        else if (wrong === 0) status = "stable";
        else if (done[done.length - 1] === false) status = "slip";
        else status = "shaky";
      }
      return { qno: i + 1, seq, wrong, done: done.length, status, sec: sectionOf(i + 1) };
    });
  }, [attempts]);

  const sectionStats = useMemo(() => {
    return SECTIONS.map((s) => {
      let c = 0, n = 0;
      attempts.forEach((a) => {
        for (let q = s.start; q <= s.end; q++) {
          if (a.marks?.[q - 1] === true) c++;
          if (a.marks?.[q - 1] !== null && a.marks?.[q - 1] !== undefined) n++;
        }
      });
      return { ...s, correct: c, n, rate: n ? c / n : null };
    });
  }, [attempts]);

  const showKey = tab === "key";
  const current = showKey ? key : draft;
  const marksForGrid = result ? result.marks : null;

  /* 상단 고정 헤더의 실제 높이를 재서, 세부과목 머리글이 그 아래에 정확히 붙도록 함 */
  const hdRef = useRef(null);
  const [hdH, setHdH] = useState(88);
  useEffect(() => {
    const el = hdRef.current;
    if (!el) return;
    const update = () => setHdH(el.offsetHeight);
    update();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [tab, exams.length, manageOpen]);

  return (
    <div className="tws" style={{ "--hdh": `${hdH}px` }}>
      <style>{CSS}</style>

      <header className="hd" ref={hdRef}>
        <div className="hd-row">
          <div className="brand">
            <span className="brand-mark">투운사</span>
            <span className="brand-sub">모의고사 회독 관리</span>
          </div>
          <div className="hd-pick">
            <select
              className="sel"
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              disabled={exams.length === 0}
            >
              {exams.length === 0 ? (
                <option value="">등록된 시험 없음</option>
              ) : (
                exams.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))
              )}
            </select>
            <button
              className={manageOpen ? "btn ghost sm on" : "btn ghost sm"}
              onClick={() => setManageOpen((v) => !v)}
            >
              시험 관리
            </button>
          </div>
        </div>

        <nav className="tabs">
          <button className={tab === "solve" ? "tab on" : "tab"} onClick={() => setTab("solve")}>
            문제 풀기
          </button>
          <button className={tab === "key" ? "tab on" : "tab"} onClick={() => setTab("key")}>
            정답 등록 <span className="pill">{keyCount}/100</span>
          </button>
          <button className={tab === "stats" ? "tab on" : "tab"} onClick={() => setTab("stats")}>
            통계 <span className="pill">{attempts.length}회독</span>
          </button>
        </nav>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice} <span className="notice-x">닫기</span>
        </div>
      )}

      {manageOpen && (
        <ExamManager
          exams={exams}
          examId={examId}
          onAdd={addExam}
          onRename={renameExam}
          onRemove={removeExam}
          onSelect={(id) => { setExamId(id); setManageOpen(false); }}
          onClose={() => setManageOpen(false)}
        />
      )}

      {!examsReady || loading ? (
        <div className="empty">불러오는 중입니다.</div>
      ) : !examId ? (
        <div className="empty">
          등록된 시험이 없습니다.<br />
          시험 관리에서 문제집 이름을 추가하면 답안지가 열립니다.
        </div>
      ) : tab === "stats" ? (
        <StatsView
          attempts={attempts}
          history={history}
          sectionStats={sectionStats}
          answerKey={key}
          examLabel={exams.find((e) => e.id === examId)?.label ?? ""}
          onDelete={deleteAttempt}
        />
      ) : (
        <>
          <div className="bar">
            <div className="bar-left">
              {showKey ? (
                <span className="bar-label">정답 입력 {keyCount}<span className="dim">/100</span></span>
              ) : (
                <>
                  <span className="bar-label">{round}회독 · {answeredCount}<span className="dim">/100</span></span>
                  <span className="clock">{fmtTime(elapsed)}</span>
                </>
              )}
            </div>
            <div className="bar-right">
              <button className="btn ghost" onClick={() => { setBulkTarget(showKey ? "key" : "draft"); setBulkOpen(true); }}>
                한번에 입력
              </button>
              {showKey ? (
                <button className="btn ghost" onClick={() => setKey(emptyArr())}>전체 지우기</button>
              ) : (
                <>
                  <button className="btn ghost" onClick={resetDraft}>새로 풀기</button>
                  <button className="btn solid" onClick={doGrade}>채점하기</button>
                </>
              )}
            </div>
          </div>

          <div className="progress"><i style={{ width: `${(showKey ? keyCount : answeredCount)}%` }} /></div>

          {bulkOpen && (
            <div className="bulk">
              <p className="bulk-help">
                번호만 이어서 붙여넣으세요. <code>3142…</code> 또는 <code>1.③ 2.① 3.②</code> 형식을 모두 읽습니다.
              </p>
              <textarea
                className="bulk-input"
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="예: 3142231… 또는 1.3 2.1 3.4 …"
              />
              <div className="bulk-act">
                <button className="btn ghost" onClick={() => setBulkOpen(false)}>취소</button>
                <button className="btn solid" onClick={applyBulk}>채우기</button>
              </div>
            </div>
          )}

          {result && <ResultPanel result={result} onClose={() => setResult(null)} />}

          <main className="sheet">
            {SECTIONS.map((s) => {
              const secRes = result ? result.bySection.find((x) => x.sid === s.sid) : null;
              return (
                <section key={s.sid} className="sec">
                  <div className="sec-hd">
                    <div className="sec-name">
                      <b>{s.name}</b>
                      <span className="sec-meta">{s.subject}과목 · {s.start}~{s.end}번</span>
                    </div>
                    {secRes && (
                      <span className={"sec-rate " + rateClass(secRes.rate)}>
                        {secRes.correct}/{secRes.total}
                      </span>
                    )}
                  </div>
                  <div className="rows">
                    {Array.from({ length: s.end - s.start + 1 }, (_, k) => {
                      const q = s.start + k;
                      const mark = marksForGrid ? marksForGrid[q - 1] : null;
                      return (
                        <div key={q} className={"row" + (mark === false ? " row-bad" : mark === true ? " row-ok" : "")}>
                          <span className="qno">{q}</span>
                          <div className="opts">
                            {[1, 2, 3, 4].map((v) => {
                              const on = current[q - 1] === v;
                              const isKey = !showKey && result && key[q - 1] === v;
                              return (
                                <button
                                  key={v}
                                  className={
                                    "opt" +
                                    (on ? " on" : "") +
                                    (on && mark === false ? " wrong" : "") +
                                    (on && mark === true ? " right" : "") +
                                    (!on && isKey && mark === false ? " answer" : "")
                                  }
                                  onClick={() => pick(q, v)}
                                  aria-label={`${q}번 ${v}번 선택`}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <div className="foot-space" />
          </main>
        </>
      )}
    </div>
  );
}

/* ───────────────── 시험 관리 ───────────────── */

function ExamManager({ exams, examId, onAdd, onRename, onRemove, onSelect, onClose }) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const submitNew = () => {
    if (!newName.trim()) return;
    onAdd(newName);
    setNewName("");
  };

  return (
    <div className="mgr">
      <div className="mgr-hd">
        <h3>시험 관리</h3>
        <button className="btn ghost sm" onClick={onClose}>닫기</button>
      </div>

      <div className="mgr-add">
        <input
          className="mgr-input"
          value={newName}
          maxLength={40}
          placeholder="문제집·회차 이름 (예: 43회 기출유형 3회)"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
        />
        <button className="btn solid" onClick={submitNew}>추가</button>
      </div>

      {exams.length === 0 ? (
        <p className="mgr-empty">
          이름을 하나 추가하면 그 시험의 정답표와 회독 기록이 따로 저장됩니다.
        </p>
      ) : (
        <ul className="mgr-list">
          {exams.map((x) => (
            <li key={x.id} className={x.id === examId ? "mgr-item cur" : "mgr-item"}>
              {editId === x.id ? (
                <>
                  <input
                    className="mgr-input flex"
                    value={editName}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onRename(x.id, editName); setEditId(null); }
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <button className="btn solid xs" onClick={() => { onRename(x.id, editName); setEditId(null); }}>저장</button>
                  <button className="btn ghost xs" onClick={() => setEditId(null)}>취소</button>
                </>
              ) : confirmId === x.id ? (
                <>
                  <span className="mgr-warn">기록까지 함께 지웁니다. 삭제할까요?</span>
                  <button className="btn danger xs" onClick={() => { onRemove(x.id); setConfirmId(null); }}>삭제</button>
                  <button className="btn ghost xs" onClick={() => setConfirmId(null)}>취소</button>
                </>
              ) : (
                <>
                  <button className="mgr-name" onClick={() => onSelect(x.id)}>
                    {x.label}
                    {x.id === examId && <em>선택됨</em>}
                  </button>
                  <button className="btn ghost xs" onClick={() => { setEditId(x.id); setEditName(x.label); }}>이름 수정</button>
                  <button className="btn ghost xs" onClick={() => setConfirmId(x.id)}>삭제</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────── 채점 결과 패널 ───────────────── */

function ResultPanel({ result, onClose }) {
  const { correct, bySubject, passed, round, elapsed } = result;
  const wrongList = SECTIONS.map((s) => {
    const qs = [];
    for (let q = s.start; q <= s.end; q++) if (result.marks[q - 1] === false) qs.push(q);
    return { name: s.name, qs };
  }).filter((x) => x.qs.length);

  return (
    <div className="res">
      <div className="res-hd">
        <div>
          <span className="res-round">{round}회독 결과</span>
          <span className="res-time">{fmtTime(elapsed)} 소요</span>
        </div>
        <button className="btn ghost sm" onClick={onClose}>닫기</button>
      </div>

      <div className="res-score">
        <div className="score-num">
          {correct}<span className="score-den">/100</span>
        </div>
        <div className={"verdict " + (passed ? "pass" : "fail")}>
          {passed ? "합격선 통과" : correct < PASS_TOTAL ? `합격선까지 ${PASS_TOTAL - correct}문항` : "과락 발생"}
        </div>
      </div>

      <div className="subs">
        {bySubject.map((s) => (
          <div key={s.no} className={"sub" + (s.fail ? " sub-fail" : "")}>
            <div className="sub-top">
              <b>{s.no}과목</b>
              <span>{s.correct}/{s.total}</span>
            </div>
            <div className="sub-bar">
              <i style={{ width: `${s.rate * 100}%` }} className={s.fail ? "bad" : "ok"} />
              <u style={{ left: `${(s.cut / s.total) * 100}%` }} />
            </div>
            <div className="sub-note">{s.fail ? `과락 (${s.cut}문항 미달)` : `과락 기준 ${s.cut}문항 충족`}</div>
          </div>
        ))}
      </div>

      {wrongList.length > 0 && (
        <div className="wrongs">
          <div className="wrongs-hd">틀린 문항</div>
          {wrongList.map((w) => (
            <div key={w.name} className="wrong-line">
              <span className="wrong-sec">{w.name}</span>
              <span className="wrong-qs">{w.qs.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────── 내보내기 ───────────────── */

function buildReport({ examLabel, attempts, history, sectionStats, answerKey }) {
  const L = [];
  const pct = (r) => (r === null || r === undefined ? "-" : `${Math.round(r * 100)}%`);
  L.push(`# 투자자산운용사 회독 분석 자료`);
  L.push(`시험: ${examLabel || "(이름 없음)"}`);
  L.push(`총 회독: ${attempts.length}회 / 내보낸 날짜: ${new Date().toLocaleDateString("ko-KR")}`);
  L.push("");

  L.push(`## 1. 회독별 성적`);
  L.push(`회독 | 날짜 | 점수 | 소요시간 | 1과목 | 2과목 | 3과목 | 과락`);
  attempts.forEach((a) => {
    const g = { bySubject: SUBJECTS.map((sub) => {
      let c = 0;
      SECTIONS.filter((s) => s.subject === sub.no).forEach((s) => {
        for (let q = s.start; q <= s.end; q++) if (a.marks?.[q - 1] === true) c++;
      });
      return { ...sub, correct: c, fail: c < sub.cut };
    }) };
    const fails = g.bySubject.filter((s) => s.fail).map((s) => `${s.no}과목`);
    L.push(
      `${a.round}회독 | ${new Date(a.date).toLocaleDateString("ko-KR")} | ${a.correct}/100 | ${fmtTime(a.elapsed || 0)} | ` +
      g.bySubject.map((s) => `${s.correct}/${s.total}`).join(" | ") +
      ` | ${fails.length ? fails.join(",") : "없음"}`
    );
  });
  L.push("");

  L.push(`## 2. 세부과목별 누적 정답률 (낮은 순)`);
  [...sectionStats].sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1)).forEach((s) => {
    L.push(`${s.subject}과목 | ${s.name} (${s.start}~${s.end}번, ${s.end - s.start + 1}문항) | ${s.correct}/${s.n} | ${pct(s.rate)}`);
  });
  L.push("");

  L.push(`## 3. 반복 오답 문항 (오답 횟수 순)`);
  L.push(`문항 | 세부과목 | 회독기록 | 오답횟수 | 상태 | 회독별 내가고른답 | 정답`);
  history
    .filter((h) => h.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.qno - b.qno)
    .forEach((h) => {
      const seq = h.seq.map((v) => (v === true ? "O" : v === false ? "X" : "-")).join("");
      const picks = attempts.map((a) => a.answers?.[h.qno - 1] || "-").join(",");
      L.push(
        `${h.qno}번 | ${h.sec.name} | ${seq} | ${h.wrong}회 | ${STATUS_META[h.status].label} | ${picks} | ${answerKey?.[h.qno - 1] || "-"}`
      );
    });
  L.push("");

  L.push(`## 4. 상태 분류 요약`);
  ["unsolved", "slip", "shaky", "stable"].forEach((k) => {
    const qs = history.filter((h) => h.status === k).map((h) => h.qno);
    L.push(`${STATUS_META[k].label} (${qs.length}문항): ${qs.length ? qs.join(", ") : "없음"}`);
  });
  L.push("");
  L.push(`※ 상태 정의 — 완전 미해결: 전 회독 오답 / 방심 오답: 맞다가 최근 회독 오답 / 불안정: 정오 반복 / 안정: 전 회독 정답`);
  return L.join("\n");
}

function buildCSV({ attempts, history, answerKey }) {
  const head = ["문항", "과목", "세부과목", "정답", "오답횟수", "상태"];
  attempts.forEach((a) => head.push(`${a.round}회독_선택`, `${a.round}회독_정오`));
  const rows = [head.join(",")];
  history.forEach((h) => {
    const r = [
      h.qno,
      `${h.sec.subject}과목`,
      `"${h.sec.name}"`,
      answerKey?.[h.qno - 1] || "",
      h.wrong,
      STATUS_META[h.status].label,
    ];
    attempts.forEach((a) => {
      r.push(a.answers?.[h.qno - 1] || "");
      r.push(a.marks?.[h.qno - 1] === true ? "O" : a.marks?.[h.qno - 1] === false ? "X" : "");
    });
    rows.push(r.join(","));
  });
  return rows.join("\n");
}

function ExportPanel({ examLabel, attempts, history, sectionStats, answerKey }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState(null);
  const [copied, setCopied] = useState("");
  const areaRef = useRef(null);

  const show = (which) => {
    const t =
      which === "report"
        ? buildReport({ examLabel, attempts, history, sectionStats, answerKey })
        : buildCSV({ attempts, history, answerKey });
    setText(t);
    setMode(which);
    setCopied("");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("복사했습니다.");
    } catch (e) {
      if (areaRef.current) {
        areaRef.current.select();
        setCopied("전체 선택했습니다. 직접 복사해 주십시오.");
      }
    }
  };

  const download = () => {
    try {
      const blob = new Blob([mode === "csv" ? "\uFEFF" + text : text], {
        type: mode === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(examLabel || "회독분석").replace(/[\\/:*?"<>|]/g, "")}_${mode === "csv" ? "문항표.csv" : "분석자료.txt"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCopied("파일을 내려받았습니다.");
    } catch (e) {
      setCopied("내려받기가 막혀 있습니다. 복사 버튼을 사용해 주십시오.");
    }
  };

  return (
    <div className="exp">
      <div className="exp-btns">
        <button className={mode === "report" ? "btn solid" : "btn ghost"} onClick={() => show("report")}>
          분석용 요약 만들기
        </button>
        <button className={mode === "csv" ? "btn solid" : "btn ghost"} onClick={() => show("csv")}>
          문항표 CSV 만들기
        </button>
      </div>
      {mode && (
        <>
          <div className="exp-act">
            <button className="btn ghost sm" onClick={copy}>복사</button>
            <button className="btn ghost sm" onClick={download}>파일로 저장</button>
            {copied && <span className="exp-msg">{copied}</span>}
          </div>
          <textarea ref={areaRef} className="exp-area" readOnly value={text} rows={10} />
        </>
      )}
    </div>
  );
}

/* ───────────────── 통계 ───────────────── */

const STATUS_META = {
  unsolved: { label: "완전 미해결", cls: "st-unsolved", desc: "회독 내내 계속 틀린 문항" },
  slip: { label: "방심 오답", cls: "st-slip", desc: "맞다가 최근 회독에서 틀린 문항" },
  shaky: { label: "불안정", cls: "st-shaky", desc: "맞았다 틀렸다 반복하는 문항" },
  stable: { label: "안정", cls: "st-stable", desc: "회독 내내 맞은 문항" },
  none: { label: "미응시", cls: "st-none", desc: "" },
};

function StatsView({ attempts, history, sectionStats, answerKey, examLabel, onDelete }) {
  const [focus, setFocus] = useState("all");

  if (attempts.length === 0) {
    return (
      <div className="empty">
        아직 채점 기록이 없습니다.<br />
        정답을 등록하고 한 회독을 채점하면 여기에 통계가 쌓입니다.
      </div>
    );
  }

  const avg = attempts.reduce((a, b) => a + b.correct, 0) / attempts.length;
  const last3 = attempts.slice(-3);
  const avg3 = last3.reduce((a, b) => a + b.correct, 0) / last3.length;
  const best = Math.max(...attempts.map((a) => a.correct));
  const counts = Object.keys(STATUS_META).reduce((acc, k) => {
    acc[k] = history.filter((h) => h.status === k).length;
    return acc;
  }, {});

  const filtered = focus === "all" ? history : history.filter((h) => h.status === focus);
  const maxScore = 100;

  return (
    <div className="stats">
      <div className="cards">
        <Card k="전체 평균" v={avg.toFixed(1)} s="문항" />
        <Card k="최근 3회독" v={avg3.toFixed(1)} s="문항" />
        <Card k="최고 점수" v={best} s="문항" />
        <Card k="누적 회독" v={attempts.length} s="회" />
      </div>

      <Block title="회독별 점수 추이" note="가로선은 합격선 70문항입니다.">
        <div className="chart">
          <div className="chart-line" style={{ bottom: `${(PASS_TOTAL / maxScore) * 100}%` }}><span>70</span></div>
          <div className="bars">
            {attempts.map((a) => (
              <div key={a.round} className="barwrap">
                <div className={"barv " + (a.correct >= PASS_TOTAL ? "ok" : "bad")} style={{ height: `${(a.correct / maxScore) * 100}%` }}>
                  <span className="barv-num">{a.correct}</span>
                </div>
                <span className="barv-lbl">{a.round}회</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title="세부과목별 누적 정답률" note="전 회독을 합산한 정답률입니다. 낮은 순으로 복습하십시오.">
        <div className="secstats">
          {[...sectionStats].sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1)).map((s) => (
            <div key={s.sid} className="secrow">
              <span className="secrow-sub">{s.subject}</span>
              <span className="secrow-name">{s.name}</span>
              <span className="secrow-bar">
                <i className={rateClass(s.rate ?? 0)} style={{ width: `${(s.rate ?? 0) * 100}%` }} />
              </span>
              <span className="secrow-num">{s.rate === null ? "-" : `${Math.round(s.rate * 100)}%`}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="문항별 회독 이력" note="칸을 채운 색은 상태입니다. 상태를 눌러 걸러 볼 수 있습니다.">
        <div className="legend">
          <button className={focus === "all" ? "lg on" : "lg"} onClick={() => setFocus("all")}>전체 100</button>
          {["unsolved", "slip", "shaky", "stable"].map((k) => (
            <button key={k} className={"lg " + STATUS_META[k].cls + (focus === k ? " on" : "")} onClick={() => setFocus(k)}>
              {STATUS_META[k].label} {counts[k]}
            </button>
          ))}
        </div>
        <div className="grid100">
          {history.map((h) => (
            <div
              key={h.qno}
              className={"cell " + STATUS_META[h.status].cls + (focus !== "all" && h.status !== focus ? " dim" : "")}
              title={`${h.qno}번 · ${h.sec.name} · ${STATUS_META[h.status].label}`}
            >
              {h.qno}
            </div>
          ))}
        </div>
      </Block>

      <Block title={focus === "all" ? "반복 오답 상세" : `${STATUS_META[focus].label} 상세`} note="오답 횟수가 많은 순입니다.">
        <div className="tbl">
          <div className="tr th">
            <span>문항</span><span>세부과목</span><span>회독 기록</span><span>상태</span>
          </div>
          {filtered
            .filter((h) => h.status !== "none" && (focus !== "all" || h.wrong > 0))
            .sort((a, b) => b.wrong - a.wrong || a.qno - b.qno)
            .slice(0, 60)
            .map((h) => (
              <div key={h.qno} className="tr">
                <span className="td-q">{h.qno}</span>
                <span className="td-s">{h.sec.name}</span>
                <span className="td-seq">
                  {h.seq.map((v, i) => (
                    <em key={i} className={v === true ? "sq ok" : v === false ? "sq bad" : "sq na"}>
                      {v === true ? "O" : v === false ? "X" : "-"}
                    </em>
                  ))}
                </span>
                <span className={"td-st " + STATUS_META[h.status].cls}>{STATUS_META[h.status].label}</span>
              </div>
            ))}
        </div>
      </Block>

      <Block title="자료 내보내기" note="복사해서 클로드에 붙여넣으면 오답 원인 분석을 이어서 할 수 있습니다.">
        <ExportPanel
          examLabel={examLabel}
          attempts={attempts}
          history={history}
          sectionStats={sectionStats}
          answerKey={answerKey}
        />
      </Block>

      <Block title="회독 기록" note="기록을 지우면 통계에서도 함께 빠집니다.">
        <div className="tbl">
          <div className="tr th log">
            <span>회독</span><span>날짜</span><span>점수</span><span>소요</span><span></span>
          </div>
          {attempts.map((a, i) => (
            <div key={i} className="tr log">
              <span>{a.round}회독</span>
              <span>{new Date(a.date).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span>
              <span className={a.correct >= PASS_TOTAL ? "hi ok" : "hi bad"}>{a.correct}</span>
              <span>{fmtTime(a.elapsed || 0)}</span>
              <span><button className="btn ghost xs" onClick={() => onDelete(i)}>삭제</button></span>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

const Card = ({ k, v, s }) => (
  <div className="card">
    <span className="card-k">{k}</span>
    <span className="card-v">{v}<em>{s}</em></span>
  </div>
);

const Block = ({ title, note, children }) => (
  <section className="block">
    <div className="block-hd">
      <h3>{title}</h3>
      {note && <p>{note}</p>}
    </div>
    {children}
  </section>
);

const rateClass = (r) => (r >= 0.7 ? "r-hi" : r >= 0.4 ? "r-mid" : "r-lo");

/* ───────────────── 스타일 ───────────────── */

const CSS = `
.tws{
  --ink:#131A24; --paper:#EDF0F4; --panel:#FFFFFF; --line:#D4DAE3;
  --muted:#6C7787; --navy:#22456F; --navy-soft:#E4EBF4;
  --ok:#0C7561; --bad:#C1382B; --warn:#A76A05;
  background:var(--paper); color:var(--ink); min-height:100vh;
  font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
  font-size:15px; line-height:1.5; padding-bottom:40px;
}
.tws *{box-sizing:border-box;}
.tws button{font-family:inherit;cursor:pointer;}

/* 헤더 */
.hd{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--line);}
.hd-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 8px;}
.brand{display:flex;align-items:baseline;gap:8px;min-width:0;}
.brand-mark{font-weight:800;font-size:17px;letter-spacing:-.04em;color:var(--navy);}
.brand-sub{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hd-pick{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.sel{border:1px solid var(--line);background:var(--panel);border-radius:7px;padding:7px 9px;font-size:13px;color:var(--ink);max-width:170px;}
.sel:disabled{color:var(--muted);background:var(--paper);}
.btn.on{background:var(--navy-soft);border-color:var(--navy);color:var(--navy);}
.btn.danger{background:var(--bad);border-color:var(--bad);color:#fff;}

/* 시험 관리 */
.mgr{margin:12px 14px 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px;}
.mgr-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.mgr-hd h3{margin:0;font-size:14px;font-weight:700;letter-spacing:-.02em;}
.mgr-add{display:flex;gap:6px;}
.mgr-input{flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:13.5px;font-family:inherit;color:var(--ink);}
.mgr-input:focus{outline:2px solid var(--navy);outline-offset:-1px;border-color:var(--navy);}
.mgr-empty{margin:10px 0 0;font-size:12.5px;color:var(--muted);line-height:1.7;}
.mgr-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;}
.mgr-item{display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid #F1F3F7;}
.mgr-item:last-child{border-bottom:0;}
.mgr-name{flex:1;min-width:0;text-align:left;border:0;background:transparent;padding:4px 0;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mgr-item.cur .mgr-name{font-weight:700;color:var(--navy);}
.mgr-name em{font-style:normal;margin-left:6px;font-size:10.5px;font-weight:600;color:var(--navy);background:var(--navy-soft);padding:1px 6px;border-radius:20px;}
.mgr-warn{flex:1;font-size:12px;color:var(--bad);font-weight:600;}
.tabs{display:flex;gap:2px;padding:0 10px;}
.tab{flex:1;border:0;background:transparent;padding:10px 4px 11px;font-size:13.5px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;}
.tab.on{color:var(--navy);border-bottom-color:var(--navy);}
.pill{display:inline-block;margin-left:4px;font-size:11px;font-weight:600;color:var(--muted);background:var(--paper);padding:1px 5px;border-radius:20px;}
.tab.on .pill{background:var(--navy-soft);color:var(--navy);}

.notice{margin:10px 14px 0;background:#FFF6E0;border:1px solid #EBD9A8;color:#7A5A05;padding:9px 12px;border-radius:8px;font-size:13px;cursor:pointer;}
.notice-x{float:right;font-size:12px;color:#A08430;}
.empty{padding:70px 24px;text-align:center;color:var(--muted);font-size:14px;line-height:1.9;}

/* 상단 바 */
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px 10px;flex-wrap:wrap;}
.bar-left{display:flex;align-items:baseline;gap:10px;}
.bar-label{font-size:15px;font-weight:700;letter-spacing:-.02em;}
.dim{color:var(--muted);font-weight:500;}
.clock{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:var(--muted);}
.bar-right{display:flex;gap:6px;}
.btn{border-radius:7px;font-size:13px;font-weight:600;padding:8px 12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);}
.btn.solid{background:var(--navy);border-color:var(--navy);color:#fff;}
.btn.ghost:hover{background:var(--navy-soft);}
.btn.sm{padding:5px 10px;font-size:12px;}
.btn.xs{padding:3px 8px;font-size:11px;}
.btn:focus-visible{outline:2px solid var(--navy);outline-offset:2px;}
.progress{height:3px;background:var(--line);margin:0 14px;border-radius:3px;overflow:hidden;}
.progress i{display:block;height:100%;background:var(--navy);transition:width .2s;}

/* 일괄 입력 */
.bulk{margin:12px 14px 0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;}
.bulk-help{margin:0 0 8px;font-size:12.5px;color:var(--muted);}
.bulk-help code{background:var(--paper);padding:1px 5px;border-radius:4px;font-size:12px;}
.bulk-input{width:100%;border:1px solid var(--line);border-radius:7px;padding:9px;font-size:14px;font-family:ui-monospace,monospace;resize:vertical;}
.bulk-act{display:flex;gap:6px;justify-content:flex-end;margin-top:8px;}

/* 결과 패널 */
.res{margin:12px 14px 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;}
.res-hd{display:flex;justify-content:space-between;align-items:center;}
.res-round{font-weight:700;font-size:14px;}
.res-time{margin-left:8px;font-size:12px;color:var(--muted);}
.res-score{display:flex;align-items:baseline;gap:12px;margin:10px 0 14px;flex-wrap:wrap;}
.score-num{font-size:40px;font-weight:800;letter-spacing:-.05em;font-variant-numeric:tabular-nums;line-height:1;}
.score-den{font-size:17px;color:var(--muted);font-weight:600;}
.verdict{font-size:13px;font-weight:700;padding:4px 10px;border-radius:20px;}
.verdict.pass{background:#E1F2ED;color:var(--ok);}
.verdict.fail{background:#FBE7E4;color:var(--bad);}
.subs{display:grid;grid-template-columns:1fr;gap:10px;}
.sub{border:1px solid var(--line);border-radius:9px;padding:10px 11px;}
.sub-fail{border-color:#E8B3AC;background:#FEF6F5;}
.sub-top{display:flex;justify-content:space-between;font-size:13px;font-variant-numeric:tabular-nums;}
.sub-bar{position:relative;height:7px;background:var(--paper);border-radius:4px;margin:7px 0 6px;overflow:visible;}
.sub-bar i{display:block;height:100%;border-radius:4px;}
.sub-bar i.ok{background:var(--ok);} .sub-bar i.bad{background:var(--bad);}
.sub-bar u{position:absolute;top:-3px;width:2px;height:13px;background:var(--ink);opacity:.55;}
.sub-note{font-size:11.5px;color:var(--muted);}
.sub-fail .sub-note{color:var(--bad);font-weight:600;}
.wrongs{margin-top:12px;border-top:1px solid var(--line);padding-top:10px;}
.wrongs-hd{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;}
.wrong-line{display:flex;gap:8px;font-size:12.5px;padding:3px 0;}
.wrong-sec{flex:0 0 42%;color:var(--muted);}
.wrong-qs{font-variant-numeric:tabular-nums;font-weight:600;color:var(--bad);}

/* 답안 시트 */
.sheet{padding:12px 14px 0;}
.sec{margin-bottom:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;}
.sec-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:#F6F8FB;border-bottom:1px solid var(--line);border-radius:11px 11px 0 0;position:sticky;top:var(--hdh,88px);z-index:5;}
.sec-name b{font-size:13.5px;letter-spacing:-.02em;display:block;}
.sec-meta{font-size:11px;color:var(--muted);}
.sec-rate{font-size:12px;font-weight:700;padding:3px 9px;border-radius:20px;font-variant-numeric:tabular-nums;}
.sec-rate.r-hi{background:#E1F2ED;color:var(--ok);}
.sec-rate.r-mid{background:#FDF1DC;color:var(--warn);}
.sec-rate.r-lo{background:#FBE7E4;color:var(--bad);}
.rows{padding:4px 0;}
.row{display:flex;align-items:center;gap:12px;padding:5px 12px;border-bottom:1px solid #F1F3F7;}
.row:last-child{border-bottom:0;}
.row-bad{background:#FEF6F5;}
.row-ok{background:#F4FAF8;}
.qno{flex:0 0 30px;font-size:13px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;text-align:right;}
.row-bad .qno{color:var(--bad);}
.opts{display:flex;gap:6px;flex:1;}
.opt{flex:1;height:38px;border:1px solid var(--line);background:var(--panel);border-radius:8px;font-size:14px;font-weight:600;color:var(--muted);transition:.12s;}
.opt:hover{border-color:var(--navy);}
.opt.on{background:var(--navy);border-color:var(--navy);color:#fff;}
.opt.on.wrong{background:var(--bad);border-color:var(--bad);}
.opt.on.right{background:var(--ok);border-color:var(--ok);}
.opt.answer{border:2px dashed var(--ok);color:var(--ok);background:#F4FAF8;}
.foot-space{height:24px;}

/* 통계 */
.stats{padding:14px;}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 12px;}
.card-k{display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px;}
.card-v{font-size:22px;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums;}
.card-v em{font-size:12px;font-weight:600;color:var(--muted);font-style:normal;margin-left:3px;}
.block{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px;margin-bottom:14px;}
.block-hd h3{margin:0;font-size:14px;font-weight:700;letter-spacing:-.02em;}
.block-hd p{margin:3px 0 11px;font-size:11.5px;color:var(--muted);}

.chart{position:relative;height:150px;padding-top:4px;}
.chart-line{position:absolute;left:0;right:0;border-top:1px dashed #A9B4C4;}
.chart-line span{position:absolute;right:0;top:-14px;font-size:10px;color:var(--muted);background:var(--panel);padding:0 3px;}
.bars{display:flex;align-items:flex-end;gap:8px;height:100%;}
.barwrap{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;}
.barv{width:100%;max-width:44px;border-radius:5px 5px 0 0;position:relative;min-height:3px;}
.barv.ok{background:var(--ok);} .barv.bad{background:var(--navy);}
.barv-num{position:absolute;top:-17px;left:0;right:0;text-align:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;}
.barv-lbl{font-size:10.5px;color:var(--muted);margin-top:4px;}

.secstats{display:flex;flex-direction:column;gap:5px;}
.secrow{display:flex;align-items:center;gap:7px;font-size:12px;}
.secrow-sub{flex:0 0 16px;text-align:center;font-size:10px;font-weight:700;color:var(--muted);background:var(--paper);border-radius:4px;padding:1px 0;}
.secrow-name{flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.secrow-bar{flex:1;height:7px;background:var(--paper);border-radius:4px;overflow:hidden;}
.secrow-bar i{display:block;height:100%;border-radius:4px;}
.r-hi{background:var(--ok);} .r-mid{background:var(--warn);} .r-lo{background:var(--bad);}
.secrow-num{flex:0 0 34px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}

.legend{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
.lg{border:1px solid var(--line);background:var(--panel);border-radius:20px;padding:4px 10px;font-size:11.5px;font-weight:600;color:var(--muted);}
.lg.on{border-color:var(--navy);color:var(--navy);background:var(--navy-soft);}
.grid100{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;}
.cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:9.5px;font-weight:600;font-variant-numeric:tabular-nums;border:1px solid transparent;}
.cell.dim{opacity:.16;}
.st-unsolved{background:#F6D6D1;color:#8E271C;}
.st-slip{background:#FBE3BE;color:#7A4D04;}
.st-shaky{background:#E3E9F3;color:#3A5478;}
.st-stable{background:#DCEFE8;color:#0A5B4C;}
.st-none{background:var(--paper);color:#AAB3C0;}

/* 내보내기 */
.exp-btns{display:flex;gap:6px;flex-wrap:wrap;}
.exp-act{display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap;}
.exp-msg{font-size:11.5px;color:var(--ok);font-weight:600;}
.exp-area{width:100%;margin-top:8px;border:1px solid var(--line);border-radius:8px;padding:9px;font-size:11.5px;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#FAFBFD;color:var(--ink);resize:vertical;white-space:pre;overflow-x:auto;}

.tbl{display:flex;flex-direction:column;font-size:12px;}
.tr{display:grid;grid-template-columns:34px 1fr auto 64px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #F1F3F7;}
.tr.log{grid-template-columns:52px 48px 40px 48px 1fr;}
.tr.th{font-size:10.5px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);}
.td-q{font-weight:700;font-variant-numeric:tabular-nums;}
.td-s{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);}
.td-seq{display:flex;gap:2px;}
.sq{font-style:normal;width:15px;height:15px;border-radius:3px;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.sq.ok{background:#DCEFE8;color:var(--ok);} .sq.bad{background:#F6D6D1;color:var(--bad);} .sq.na{background:var(--paper);color:#B4BCC8;}
.td-st{font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:20px;text-align:center;}
.hi{font-weight:700;font-variant-numeric:tabular-nums;}
.hi.ok{color:var(--ok);} .hi.bad{color:var(--ink);}

@media (min-width:640px){
  .subs{grid-template-columns:repeat(3,1fr);}
  .cards{grid-template-columns:repeat(4,1fr);}
  .sheet,.stats{max-width:860px;margin:0 auto;}
  .hd-row,.tabs,.bar,.progress,.res,.bulk,.notice,.mgr{max-width:860px;margin-left:auto;margin-right:auto;}
  .opt{height:34px;}
}
@media (prefers-reduced-motion:reduce){ .tws *{transition:none !important;} }
`;

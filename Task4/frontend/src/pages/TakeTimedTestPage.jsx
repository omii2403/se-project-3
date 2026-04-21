import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getTimedTestSession,
  reportTestViolation,
  runSampleTestCase,
  submitTimedTest
} from "../api";

const VIOLATION_AUTO_SUBMIT_LIMIT = 2;
const FULLSCREEN_TRANSITION_BUFFER_MS = 1500;
const ANSWER_AUTOSAVE_INTERVAL_MS = 5000;
const ANSWER_AUTOSAVE_KEY_PREFIX = "task4_timed_test_answers_";

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function editorLanguage(language) {
  if (language === "cpp") {
    return "cpp";
  }
  if (language === "python") {
    return "python";
  }
  return "javascript";
}

function formatRunTime(isoString) {
  if (!isoString) {
    return "-";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString();
}

function tryParseRunnerJson(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    return null;
  }

  try {
    let parsed = JSON.parse(text);
    if (typeof parsed === "string") {
      const nested = parsed.trim();
      const maybeNestedJson =
        (nested.startsWith("{") && nested.endsWith("}")) ||
        (nested.startsWith("[") && nested.endsWith("]"));
      if (maybeNestedJson) {
        parsed = JSON.parse(nested);
      }
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function formatNormalOutput(rawValue) {
  if (rawValue == null) {
    return "No output";
  }

  const parsed = tryParseRunnerJson(rawValue);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const lines = parsed.map((item, index) => {
      if (item && typeof item === "object") {
        const expected = item.expected != null ? String(item.expected) : "-";
        const actual = item.actual != null ? String(item.actual) : "-";
        const passed = item.passed != null ? String(item.passed) : "-";
        const stderr = item.stderr ? `, stderr: ${String(item.stderr)}` : "";
        return `Case ${index + 1}: expected: ${expected}, actual: ${actual}, passed: ${passed}${stderr}`;
      }
      return `Case ${index + 1}: ${String(item)}`;
    });
    return lines.join("\n");
  }

  if (parsed && typeof parsed === "object") {
    if (parsed.details) {
      return String(parsed.details);
    }
    if (parsed.stdout) {
      return String(parsed.stdout);
    }
    return String(rawValue).trim() || "No output";
  }

  const text = String(rawValue).trim();
  return text || "No output";
}

function summarizeRunOutput(result) {
  if (result?.output?.details) {
    return formatNormalOutput(result.output.details);
  }
  if (result?.output?.stdout) {
    return formatNormalOutput(result.output.stdout);
  }
  return "No output";
}

function summarizeResultDetails(details) {
  const text = String(details || "").trim();
  if (!text) {
    return "-";
  }

  if (text.length <= 140) {
    return text;
  }

  return `${text.slice(0, 137)}...`;
}

function getAutosaveStorageKey(sessionId) {
  return `${ANSWER_AUTOSAVE_KEY_PREFIX}${String(sessionId || "")}`;
}

function safeParseAnswers(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

function buildTopicReport(results) {
  const groups = new Map();

  for (const item of results || []) {
    const topic = String(item?.topic || "Unknown");
    const current = groups.get(topic) || {
      topic,
      attempts: 0,
      passed: 0,
      scoreTotal: 0
    };

    current.attempts += 1;
    current.passed += item?.passed ? 1 : 0;
    current.scoreTotal += Number(item?.score || 0);
    groups.set(topic, current);
  }

  return [...groups.values()]
    .map((item) => ({
      topic: item.topic,
      attempts: item.attempts,
      passed: item.passed,
      avgScore: item.attempts > 0 ? Math.round(item.scoreTotal / item.attempts) : 0,
      accuracy: item.attempts > 0 ? Math.round((item.passed / item.attempts) * 100) : 0
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

function buildImprovementTips(topicReport, summary) {
  const weakTopics = topicReport.filter((item) => item.accuracy < 60);
  const tips = [];

  if (weakTopics.length === 0 && Number(summary?.averageScore || 0) >= 75) {
    tips.push("Strong performance overall. Keep solving mixed-difficulty questions to retain speed.");
  }

  for (const item of weakTopics.slice(0, 3)) {
    tips.push(
      `Focus on ${item.topic}: accuracy ${item.accuracy}%. Practice at least ${Math.max(3, item.attempts)} targeted questions before next test.`
    );
  }

  const attempted = Number(summary?.attempted || 0);
  const total = Number(summary?.totalQuestions || 0);
  const unattempted = Math.max(0, total - attempted);
  if (unattempted > 0) {
    tips.push(
      `You left ${unattempted} question(s) unattempted. Improve time allocation and move quickly if stuck for more than 3 minutes.`
    );
  }

  if (tips.length === 0) {
    tips.push("Review incorrect answers and rerun sample tests before your next timed attempt.");
  }

  return tips;
}

function buildAutoSubmitWarning(violationCount, isTimeExpired) {
  if (violationCount >= VIOLATION_AUTO_SUBMIT_LIMIT) {
    return "Timed test auto-submitted due to anti-cheat violation (second violation).";
  }

  if (isTimeExpired) {
    return "Timed test auto-submitted because test timer ended.";
  }

  return "Timed test auto-submitted by system safety rules.";
}

function buildViolationModal(violationCount) {
  if (violationCount >= VIOLATION_AUTO_SUBMIT_LIMIT) {
    return {
      type: "forced",
      title: "Second Violation Detected",
      description: "Your timed test is being force submitted now."
    };
  }

  return {
    type: "warning",
    title: `Warning ${violationCount} of ${VIOLATION_AUTO_SUBMIT_LIMIT}`,
    description: "Next violation will trigger immediate forced submit."
  };
}

function getSessionStatusBadge(session) {
  const status = String(session?.status || "").toUpperCase();
  const violationCount = Number(session?.violationCount || 0);

  if (status === "AUTO_SUBMITTED" && violationCount >= VIOLATION_AUTO_SUBMIT_LIMIT) {
    return {
      label: "Violation of test",
      className: "status-badge warning"
    };
  }

  if (status === "AUTO_SUBMITTED") {
    return {
      label: "Auto submitted",
      className: "status-badge warning"
    };
  }

  if (status === "SUBMITTED") {
    return {
      label: "Submitted",
      className: "status-badge success"
    };
  }

  if (status === "ACTIVE") {
    return {
      label: "Active",
      className: "status-badge info"
    };
  }

  if (status === "EXPIRED") {
    return {
      label: "Expired",
      className: "status-badge neutral"
    };
  }

  return {
    label: status || "-",
    className: "status-badge neutral"
  };
}

function getQuestionTypeModal(type) {
  if (type === "code") {
    return {
      title: "Coding Question Instructions",
      notes: [
        "Select language first, then write complete runnable code.",
        "Use Run Sample Tests to verify logic before final submit.",
        "Avoid excessive trial runs near test end to save time."
      ]
    };
  }

  if (type === "sql") {
    return {
      title: "SQL Question Instructions",
      notes: [
        "Write one valid SQL query as your final answer.",
        "Table CSV and expected output CSV are visible for reference.",
        "Your query output is checked with expected CSV to mark correctness."
      ]
    };
  }

  return {
    title: "MCQ Instructions",
    notes: [
      "Read the full question before selecting an option.",
      "Only one option can be selected for each MCQ.",
      "Review marked options before final submission."
    ]
  };
}

function TakeTimedTestPage({ token }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [sampleResultByQuestion, setSampleResultByQuestion] = useState({});
  const [runHistoryByQuestion, setRunHistoryByQuestion] = useState({});
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");
  const [nowMs, setNowMs] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [violationModal, setViolationModal] = useState(null);
  const [questionTypeModal, setQuestionTypeModal] = useState(null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState("");
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false
  );

  const autoSubmitRef = useRef(false);
  const lastViolationAtRef = useRef(0);
  const autoFullscreenTriedRef = useRef(false);
  const fullscreenIgnoreUntilRef = useRef(0);
  const redirectTimerRef = useRef(null);
  const answersRef = useRef({});
  const lastAutosavePayloadRef = useRef("");

  const isActive = session?.status === "ACTIVE";
  const endMs = session?.endsAt ? new Date(session.endsAt).getTime() : Date.now();
  const secondsLeft = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  const autosaveStorageKey = useMemo(() => getAutosaveStorageKey(sessionId), [sessionId]);

  const sortedQuestions = useMemo(() => {
    return Array.isArray(questions) ? questions : [];
  }, [questions]);

  useEffect(() => {
    if (!sortedQuestions.length) {
      if (currentQuestionIndex !== 0) {
        setCurrentQuestionIndex(0);
      }
      return;
    }

    const maxIndex = sortedQuestions.length - 1;
    if (currentQuestionIndex > maxIndex) {
      setCurrentQuestionIndex(maxIndex);
    }
  }, [currentQuestionIndex, sortedQuestions.length]);

  const questionTitleMap = useMemo(() => {
    const map = new Map();
    for (const question of sortedQuestions) {
      map.set(String(question._id || ""), String(question.title || ""));
    }
    return map;
  }, [sortedQuestions]);

  const topicReport = useMemo(() => {
    if (!Array.isArray(session?.results)) {
      return [];
    }

    return buildTopicReport(session.results);
  }, [session?.results]);

  const improvementTips = useMemo(() => {
    return buildImprovementTips(topicReport, session?.summary || {});
  }, [session?.summary, topicReport]);

  const sessionStatusBadge = useMemo(() => getSessionStatusBadge(session), [session]);

  const loadSession = useCallback(async () => {
    try {
      const data = await getTimedTestSession(token, sessionId);
      setSession(data.session);
      setQuestions(data.session?.questions || []);

      const restored = safeParseAnswers(window.localStorage.getItem(autosaveStorageKey));
      if (restored) {
        setAnswers(restored);
        answersRef.current = restored;
        lastAutosavePayloadRef.current = JSON.stringify(restored);
        setDraftRecovered(true);
      }
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }, [autosaveStorageKey, sessionId, token]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const payload = JSON.stringify(answersRef.current || {});
      if (payload === lastAutosavePayloadRef.current) {
        return;
      }

      window.localStorage.setItem(autosaveStorageKey, payload);
      lastAutosavePayloadRef.current = payload;
      setLastAutoSavedAt(new Date().toISOString());
    }, ANSWER_AUTOSAVE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [autosaveStorageKey, isActive]);

  const handleSubmitTest = useCallback(
    async (autoSubmit = false) => {
      if (!session || submitting) {
        return;
      }

      setSubmitting(true);
      setMessage("");

      try {
        const answerList = Object.entries(answers).map(([questionId, answer]) => ({
          questionId,
          ...answer
        }));

        const data = await submitTimedTest(token, sessionId, {
          answers: answerList,
          autoSubmit
        });

        setSession((prev) => ({
          ...(prev || {}),
          ...data.session,
          questions: prev?.questions || questions
        }));

        window.localStorage.removeItem(autosaveStorageKey);
        lastAutosavePayloadRef.current = "";
        setDraftRecovered(false);

        if (data.session.status === "AUTO_SUBMITTED") {
          const savedViolations = Number(
            data.session?.violationCount ?? session?.violationCount ?? 0
          );
          const isTimeExpired = secondsLeft <= 0;
          const warningText = buildAutoSubmitWarning(savedViolations, isTimeExpired);

          setMessageColor("#b45309");
          setMessage(`${warningText} Redirecting to dashboard...`);

          if (redirectTimerRef.current) {
            window.clearTimeout(redirectTimerRef.current);
          }

          redirectTimerRef.current = window.setTimeout(() => {
            navigate("/student/dashboard", {
              replace: true,
              state: {
                autoSubmitWarning: warningText
              }
            });
          }, 900);
        } else {
          setMessageColor("#047857");
          setMessage("Test submitted successfully. Redirecting to dashboard...");

          if (redirectTimerRef.current) {
            window.clearTimeout(redirectTimerRef.current);
          }

          redirectTimerRef.current = window.setTimeout(() => {
            navigate("/student/dashboard", {
              replace: true,
              state: {
                testSubmitted: true
              }
            });
          }, 900);
        }

        setViolationModal(null);
      } catch (error) {
        const text = String(error?.message || "").toLowerCase();
        if (text.includes("already submitted")) {
          setMessageColor("#047857");
          setMessage("Test is already submitted. Redirecting to dashboard...");

          if (redirectTimerRef.current) {
            window.clearTimeout(redirectTimerRef.current);
          }

          redirectTimerRef.current = window.setTimeout(() => {
            navigate("/student/dashboard", {
              replace: true,
              state: {
                testSubmitted: true
              }
            });
          }, 600);
          return;
        }

        setMessageColor("#b91c1c");
        setMessage(error.message);
      } finally {
        setSubmitting(false);
      }
    },
    [answers, autosaveStorageKey, navigate, questions, secondsLeft, session, sessionId, submitting, token]
  );

  useEffect(() => {
    if (!session || session.status !== "ACTIVE") {
      return;
    }

    if (secondsLeft > 0) {
      return;
    }

    if (autoSubmitRef.current) {
      return;
    }

    autoSubmitRef.current = true;
    void handleSubmitTest(true);
  }, [handleSubmitTest, secondsLeft, session]);

  const recordViolation = useCallback(async (reason = "Anti-cheat violation detected.") => {
    if (!isActive || submitting || autoSubmitRef.current) {
      return;
    }

    const now = Date.now();
    if (now <= fullscreenIgnoreUntilRef.current) {
      return;
    }

    if (now - lastViolationAtRef.current < 3000) {
      return;
    }
    lastViolationAtRef.current = now;

    try {
      const data = await reportTestViolation(token, sessionId, { reason });
      const violationCount = Number(data.violationCount || 0);

      setSession((prev) => ({
        ...(prev || {}),
        violationCount,
        status: data.status
      }));
      setMessageColor("#b91c1c");
      setMessage(
        `Violation ${Math.min(violationCount, VIOLATION_AUTO_SUBMIT_LIMIT)}/${VIOLATION_AUTO_SUBMIT_LIMIT}: ${data.message || "Violation recorded"}`
      );

      if (violationCount > 0) {
        setViolationModal(buildViolationModal(violationCount));
      }

      if (data.status === "AUTO_SUBMITTED" || violationCount >= VIOLATION_AUTO_SUBMIT_LIMIT) {
        if (!autoSubmitRef.current) {
          autoSubmitRef.current = true;
          void handleSubmitTest(true);
        }
      }
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }, [handleSubmitTest, isActive, sessionId, submitting, token]);

  const enterFullscreenMode = useCallback(async () => {
    if (!document.fullscreenEnabled || !document.documentElement?.requestFullscreen) {
      setMessageColor("#b91c1c");
      setMessage("Full-screen mode is not supported on this browser.");
      return;
    }

    if (document.fullscreenElement) {
      setIsFullscreen(true);
      return;
    }

    try {
      fullscreenIgnoreUntilRef.current = Date.now() + FULLSCREEN_TRANSITION_BUFFER_MS;
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch (error) {
      setMessageColor("#b45309");
      setMessage("Browser blocked automatic full-screen. Click once on page to retry.");
    }
  }, []);

  useEffect(() => {
    if (!isActive || isFullscreen) {
      return undefined;
    }

    if (!autoFullscreenTriedRef.current) {
      autoFullscreenTriedRef.current = true;
      void enterFullscreenMode();
    }

    const retryOnFirstGesture = () => {
      if (!document.fullscreenElement && isActive) {
        void enterFullscreenMode();
      }
    };

    window.addEventListener("pointerdown", retryOnFirstGesture, true);
    window.addEventListener("keydown", retryOnFirstGesture, true);

    return () => {
      window.removeEventListener("pointerdown", retryOnFirstGesture, true);
      window.removeEventListener("keydown", retryOnFirstGesture, true);
    };
  }, [enterFullscreenMode, isActive, isFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const activeFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(activeFullscreen);

      if (isActive && !activeFullscreen) {
        void recordViolation("Full-screen mode exited during timed test.");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [isActive, recordViolation]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const onBlockedAction = (event) => {
      event.preventDefault();
      void recordViolation("Blocked action detected during timed test.");
    };

    const onBlur = () => {
      void recordViolation("Window focus lost during timed test.");
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void recordViolation("Tab switched during timed test.");
      }
    };

    window.addEventListener("copy", onBlockedAction);
    window.addEventListener("paste", onBlockedAction);
    window.addEventListener("cut", onBlockedAction);
    window.addEventListener("contextmenu", onBlockedAction);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("copy", onBlockedAction);
      window.removeEventListener("paste", onBlockedAction);
      window.removeEventListener("cut", onBlockedAction);
      window.removeEventListener("contextmenu", onBlockedAction);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isActive, recordViolation]);

  function updateAnswer(questionId, patch) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        ...patch
      }
    }));
  }

  const handleEditorDidMount = useCallback((editor, monaco) => {
    if (!editor || !monaco) {
      return;
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      const action = editor.getAction("editor.action.commentLine");
      if (action) {
        void action.run();
      }
    });
  }, []);

  async function handleRunSample(question) {
    const questionId = String(question._id || "");
    const draft = answers[questionId] || {};
    const effectiveLanguage =
      draft.language || question.languageHints?.[0] || "javascript";

    if (!draft.code || !effectiveLanguage) {
      setMessageColor("#b91c1c");
      setMessage("Select language and write code before sample run.");
      return;
    }

    try {
      const data = await runSampleTestCase(token, sessionId, {
        questionId,
        language: effectiveLanguage,
        code: draft.code
      });

      setSampleResultByQuestion((prev) => ({
        ...prev,
        [questionId]: data.result
      }));

      setRunHistoryByQuestion((prev) => ({
        ...prev,
        [questionId]: [
          {
            ranAt: new Date().toISOString(),
            passed: Boolean(data.result?.passed),
            score: Number(data.result?.score || 0),
            details: summarizeRunOutput(data.result)
          },
          ...(prev[questionId] || [])
        ].slice(0, 10)
      }));

      setMessageColor("#047857");
      setMessage("Sample test run completed");
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  if (!session) {
    return <section className="card">Loading test session...</section>;
  }

  const currentQuestion = sortedQuestions[currentQuestionIndex] || null;

  return (
    <section className="card">
      <div className="row-between">
        <h2>Timed Test</h2>

        <div className="timer-actions">
          <div className="timer-pill">Time Left: {formatCountdown(secondsLeft)}</div>
        </div>
      </div>

      <div className="session-status-row">
        <span className="meta">Status:</span>
        <span className={sessionStatusBadge.className}>{sessionStatusBadge.label}</span>
        <span className="meta">
          Violations: {session.violationCount || 0} / {VIOLATION_AUTO_SUBMIT_LIMIT}
        </span>
      </div>

      {draftRecovered && <p className="meta">Saved draft answers were restored for this session.</p>}

      {isActive && (
        <p className="meta">
          Auto-save: every {Math.round(ANSWER_AUTOSAVE_INTERVAL_MS / 1000)} seconds
          {lastAutoSavedAt ? ` | Last saved at ${formatRunTime(lastAutoSavedAt)}` : ""}
        </p>
      )}

      {session.status !== "ACTIVE" && (
        <p className="meta">This session is no longer active. You can review result summary below.</p>
      )}

      {sortedQuestions.length > 0 && (
        <div className="question-nav-strip" role="tablist" aria-label="Question navigation">
          {sortedQuestions.map((question, index) => {
            const questionId = String(question._id || "");
            const draft = answers[questionId] || {};
            const hasAnswer =
              String(draft.answer || "").trim().length > 0 ||
              String(draft.code || "").trim().length > 0;

            return (
              <button
                key={questionId}
                type="button"
                className={`question-nav-button ${
                  index === currentQuestionIndex ? "active" : ""
                } ${hasAnswer ? "answered" : ""}`.trim()}
                onClick={() => setCurrentQuestionIndex(index)}
                aria-selected={index === currentQuestionIndex}
              >
                Q{index + 1}
              </button>
            );
          })}
        </div>
      )}

      {currentQuestion && (() => {
        const question = currentQuestion;
        const questionId = String(question._id || "");
        const draft = answers[questionId] || {};
        const sampleResult = sampleResultByQuestion[questionId];
        const runHistory = runHistoryByQuestion[questionId] || [];

        return (
          <div className="question-card" key={questionId}>
            <h3>
              Q{currentQuestionIndex + 1}. {question.title}
            </h3>
            <p className="meta">
              {question.type} | {question.topic} | {question.difficulty}
            </p>
            <p className="meta">
              Question {currentQuestionIndex + 1} of {sortedQuestions.length}
            </p>
            <p>{question.description}</p>

            {question.type === "code" && String(question.constraints || "").trim() && (
              <div className="constraint-box">
                <p className="meta">
                  <strong>Constraints</strong>
                </p>
                <pre>{String(question.constraints || "")}</pre>
              </div>
            )}

            <button
              type="button"
              className="secondary"
              onClick={() =>
                setQuestionTypeModal({
                  type: question.type,
                  ...getQuestionTypeModal(question.type)
                })
              }
            >
              View {String(question.type || "").toUpperCase()} Instructions
            </button>

            {question.type === "mcq" && Array.isArray(question.choices) && (
              <div className="option-list">
                {question.choices.map((choice) => (
                  <label key={choice} className="option-item">
                    <input
                      type="radio"
                      name={`mcq-${questionId}`}
                      checked={draft.answer === choice}
                      onChange={() => updateAnswer(questionId, { answer: choice })}
                      disabled={!isActive}
                    />
                    <span>{choice}</span>
                  </label>
                ))}
              </div>
            )}

            {question.type === "sql" && (
              <>
                {String(question.sqlTableCsv || "").trim() && (
                  <div className="subcard">
                    <h4>Table CSV (Given)</h4>
                    <pre>{String(question.sqlTableCsv || "")}</pre>
                  </div>
                )}

                {String(question.sqlExpectedOutputCsv || "").trim() && (
                  <div className="subcard">
                    <h4>Expected Output CSV (Visible)</h4>
                    <pre>{String(question.sqlExpectedOutputCsv || "")}</pre>
                  </div>
                )}

                <Editor
                  height="220px"
                  language="sql"
                  value={draft.answer || ""}
                  onChange={(value) => updateAnswer(questionId, { answer: value || "" })}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    automaticLayout: true,
                    readOnly: !isActive
                  }}
                />
                <p className="meta">Your SQL query output will be checked against expected CSV.</p>
                <p className="meta">Tip: use Ctrl + / to toggle comments quickly.</p>
              </>
            )}

            {question.type === "code" && (
              <>
                <div className="inline-form">
                  <select
                    value={draft.language || question.languageHints?.[0] || "javascript"}
                    onChange={(event) =>
                      updateAnswer(questionId, { language: event.target.value })
                    }
                    disabled={!isActive}
                  >
                    <option value="javascript">javascript</option>
                    <option value="python">python</option>
                    <option value="cpp">cpp</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void handleRunSample(question)}
                    disabled={!isActive}
                  >
                    Run Sample Tests
                  </button>
                </div>

                {Array.isArray(question.sampleTestCases) && question.sampleTestCases.length > 0 && (
                  <div className="sample-tests">
                    <p className="meta">Visible sample test cases:</p>
                    <div className="table-wrap">
                      <table className="question-table compact-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Input</th>
                            <th>Expected Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {question.sampleTestCases.map((item, itemIndex) => (
                            <tr key={`${questionId}-sample-${itemIndex}`}>
                              <td>{itemIndex + 1}</td>
                              <td>{String(item?.input || "").trim() || "(no input)"}</td>
                              <td>{item.expectedOutput}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <Editor
                  height="260px"
                  language={editorLanguage(draft.language || question.languageHints?.[0])}
                  value={draft.code || ""}
                  onChange={(value) => updateAnswer(questionId, { code: value || "" })}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    automaticLayout: true,
                    readOnly: !isActive
                  }}
                />

                <p className="meta">Tip: use Ctrl + / to toggle line comments for all supported languages.</p>

                {sampleResult && (
                  <div className="subcard">
                    <h4>Sample Run Output</h4>
                    <p>
                      <strong>Passed:</strong> {String(sampleResult.passed)}
                    </p>
                    <p>
                      <strong>Score:</strong> {sampleResult.score}
                    </p>
                    <pre>{summarizeRunOutput(sampleResult)}</pre>
                  </div>
                )}

                {runHistory.length > 0 && (
                  <div className="subcard">
                    <h4>Per Question Run History</h4>
                    <div className="table-wrap">
                      <table className="question-table compact-table run-history-table">
                        <thead>
                          <tr>
                            <th>Run</th>
                            <th>Time</th>
                            <th>Passed</th>
                            <th>Score</th>
                            <th>Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runHistory.map((entry, entryIndex) => (
                            <tr key={`${questionId}-run-${entryIndex}`}>
                              <td>{runHistory.length - entryIndex}</td>
                              <td>{formatRunTime(entry.ranAt)}</td>
                              <td>{String(entry.passed)}</td>
                              <td>{entry.score}</td>
                              <td className="run-history-output" title={entry.details}>
                                {summarizeResultDetails(entry.details)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div className="row-between">
        {isActive ? (
          <p className="meta">Navigation options are hidden during active test for integrity.</p>
        ) : (
          <button type="button" className="secondary" onClick={() => navigate("/student/dashboard")}>
            Back To Dashboard
          </button>
        )}

        {sortedQuestions.length > 1 && (
          <div className="inline-form question-pager-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setCurrentQuestionIndex((prev) => Math.min(sortedQuestions.length - 1, prev + 1))
              }
              disabled={currentQuestionIndex >= sortedQuestions.length - 1}
            >
              Next
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSubmitTest(false)}
          disabled={!isActive || submitting}
        >
          {submitting ? "Submitting..." : "Submit Timed Test"}
        </button>
      </div>

      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>

      {Array.isArray(session.results) && session.results.length > 0 && (
        <>
          <div className="subcard">
            <h3>Result Summary</h3>
            <p className="meta">
              Attempted: {session.summary?.attempted || 0} / {session.summary?.totalQuestions || 0} | Passed: {session.summary?.passedCount || 0} | Average Score: {session.summary?.averageScore || 0}
            </p>

            <div className="table-wrap">
              <table className="question-table compact-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Topic</th>
                    <th>Type</th>
                    <th>Score</th>
                    <th>Passed</th>
                    <th>Review Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {session.results.map((result, index) => {
                    const questionId = String(result.questionId || "");
                    const title =
                      result.title ||
                      questionTitleMap.get(questionId) ||
                      `Question ${index + 1}`;

                    return (
                      <tr key={`${result.questionId}-${index}`}>
                        <td>{title}</td>
                        <td>{result.topic}</td>
                        <td>{result.type}</td>
                        <td>{result.score}</td>
                        <td>{String(result.passed)}</td>
                        <td>{summarizeResultDetails(result.details)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="subcard">
            <h3>Topic-wise Weakness Report</h3>

            <div className="table-wrap">
              <table className="question-table compact-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Attempts</th>
                    <th>Passed</th>
                    <th>Average Score</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {topicReport.map((item) => (
                    <tr key={item.topic}>
                      <td>{item.topic}</td>
                      <td>{item.attempts}</td>
                      <td>{item.passed}</td>
                      <td>{item.avgScore}</td>
                      <td>{item.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="subcard">
            <h3>Improvement Tips</h3>
            <ul>
              {improvementTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {questionTypeModal && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-live="polite">
            <h3>{questionTypeModal.title}</h3>
            <ul>
              {(questionTypeModal.notes || []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <div className="modal-actions">
              <button type="button" onClick={() => setQuestionTypeModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {violationModal && (
        <div className="modal-overlay" role="presentation">
          <div
            className={`modal-card ${violationModal.type === "forced" ? "danger" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-live="assertive"
          >
            <h3>{violationModal.title}</h3>
            <p>{violationModal.description}</p>

            {violationModal.type === "warning" && (
              <div className="modal-actions">
                <button type="button" onClick={() => setViolationModal(null)}>
                  I Understand
                </button>
              </div>
            )}

            {violationModal.type === "forced" && <p className="meta">Submitting now...</p>}
          </div>
        </div>
      )}
    </section>
  );
}

export default TakeTimedTestPage;

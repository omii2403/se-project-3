import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listQuestionTopics, startTimedTest } from "../api";

function detectCompatibilityWarnings() {
  const warnings = [];

  if (typeof document !== "undefined" && !document.fullscreenEnabled) {
    warnings.push("Full-screen API is not available in this browser. Anti-cheat protection may fail.");
  }

  if (typeof window !== "undefined" && typeof window.fetch !== "function") {
    warnings.push("This browser is missing Fetch API support. Please update your browser.");
  }

  if (typeof navigator !== "undefined") {
    const userAgent = String(navigator.userAgent || "");
    if (/Android|iPhone|iPad|Mobile/i.test(userAgent)) {
      warnings.push("Mobile browsers are not recommended for timed tests. Use a desktop browser.");
    }
  }

  return warnings;
}

function StartTimedTestPage({ token }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    topics: [],
    type: "",
    difficulty: "",
    count: 5,
    durationMinutes: 30
  });
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");
  const [compatWarnings, setCompatWarnings] = useState([]);
  const [ackChecklist, setAckChecklist] = useState(false);
  const [topicOptions, setTopicOptions] = useState([]);

  useEffect(() => {
    setCompatWarnings(detectCompatibilityWarnings());
    void loadTopics();
  }, []);

  async function loadTopics() {
    try {
      const data = await listQuestionTopics(token);
      setTopicOptions(Array.isArray(data.topics) ? data.topics : []);
    } catch (error) {
      setTopicOptions([]);
    }
  }

  async function handleStart(event) {
    event.preventDefault();
    setMessage("");

    if (!ackChecklist) {
      setMessageColor("#b91c1c");
      setMessage("Please confirm the pre-test checklist before starting.");
      return;
    }

    try {
      const payload = {
        count: Number(form.count) || 5,
        durationMinutes: Number(form.durationMinutes) || 30
      };

      if (Array.isArray(form.topics) && form.topics.length > 0) {
        payload.topics = form.topics;
      }

      if (form.type) {
        payload.type = form.type;
      }

      if (form.difficulty) {
        payload.difficulty = form.difficulty;
      }

      const data = await startTimedTest(token, payload);
      navigate(`/student/test/${data.session.id}`);
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card">
      <h2>Start Timed Test</h2>
      <p className="meta">
        Choose filters and timer. Anti-cheat warning: copy paste, tab switch and focus loss are monitored.
      </p>

      {compatWarnings.length > 0 && (
        <div className="warning-banner">
          <strong>Browser compatibility warning</strong>
          <ul>
            {compatWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="subcard checklist-box">
        <h3>Pre-test Checklist</h3>
        <ul>
          <li>Close extra tabs and applications before starting.</li>
          <li>Use stable internet and keep charger connected.</li>
          <li>Do not copy, paste, switch tab, or exit full-screen during the test.</li>
          <li>Auto-submit may happen on anti-cheat violations or timer expiry.</li>
        </ul>

        <label className="checklist-confirm">
          <input
            type="checkbox"
            checked={ackChecklist}
            onChange={(event) => setAckChecklist(event.target.checked)}
          />
          <span>I read and agree to follow the checklist.</span>
        </label>
      </div>

      <form className="form-block" onSubmit={handleStart}>
        <label htmlFor="testTopics">Topics (optional multi-select)</label>
        <select
          id="testTopics"
          multiple
          size={Math.min(6, Math.max(3, topicOptions.length || 3))}
          value={form.topics}
          onChange={(event) => {
            const selected = [...event.target.selectedOptions].map((item) => item.value);
            setForm((prev) => ({ ...prev, topics: selected }));
          }}
        >
          {topicOptions.length === 0 && <option value="" disabled>No topics available</option>}
          {topicOptions.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <p className="meta">Hold Ctrl (or Cmd on Mac) to select multiple topics.</p>

        <label htmlFor="testType">Question type (optional)</label>
        <select
          id="testType"
          value={form.type}
          onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
        >
          <option value="">all types</option>
          <option value="code">code</option>
          <option value="mcq">mcq</option>
          <option value="sql">sql</option>
        </select>

        <label htmlFor="testDifficulty">Difficulty (optional)</label>
        <select
          id="testDifficulty"
          value={form.difficulty}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, difficulty: event.target.value }))
          }
        >
          <option value="">all levels</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>

        <label htmlFor="testCount">Number of questions</label>
        <input
          id="testCount"
          type="number"
          min="1"
          max="30"
          value={form.count}
          onChange={(event) => setForm((prev) => ({ ...prev, count: event.target.value }))}
          required
        />

        <label htmlFor="testDuration">Duration in minutes (5 to 180)</label>
        <input
          id="testDuration"
          type="number"
          min="5"
          max="180"
          value={form.durationMinutes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
          }
          required
        />

        <button type="submit" disabled={!ackChecklist}>
          Start Test Now
        </button>
      </form>

      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>
    </section>
  );
}

export default StartTimedTestPage;

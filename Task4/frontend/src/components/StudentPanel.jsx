import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getStudentSummary } from "../api";

function StudentPanel({ token }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [dashboardWarning, setDashboardWarning] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const data = await getStudentSummary(token);
      setSummary(data);
    } catch (error) {
      setSummary({ error: error.message });
    }
  }, [token]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const warning = location.state?.autoSubmitWarning;
    const submitted = Boolean(location.state?.testSubmitted);

    if (!warning && !submitted) {
      return;
    }

    if (warning) {
      setDashboardWarning(String(warning));
    } else {
      setDashboardWarning("Test submitted successfully. Latest results will appear as evaluation completes.");
    }

    void loadSummary();
    navigate(location.pathname, { replace: true, state: {} });
  }, [loadSummary, location.pathname, location.state, navigate]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadSummary();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadSummary();
      }
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("online", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSummary();
      }
    }, 15000);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("online", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [loadSummary]);

  const topicBreakdown = Array.isArray(summary?.topicBreakdown) ? summary.topicBreakdown : [];
  const chartTopics = [...topicBreakdown].sort(
    (a, b) => Number(a.accuracy || 0) - Number(b.accuracy || 0)
  );
  const totals = summary?.totals || { totalSubmissions: 0, avgScore: 0 };

  return (
    <section className="card">
      <div className="row-between">
        <h2>Student Dashboard</h2>
        <div className="inline-form">
          <Link className="button-link" to="/student/test/new">
            Start Timed Test
          </Link>
          <Link className="button-link" to="/student/submissions">
            Open Submissions Page
          </Link>
        </div>
      </div>

      {dashboardWarning && <p className="warning-banner">{dashboardWarning}</p>}

      <div className="subcard">
        <div className="row-between">
          <h3>Weak Topic Analysis</h3>
          <button type="button" onClick={() => void loadSummary()}>
            Refresh
          </button>
        </div>

        {summary?.error && <p className="error-text">{summary.error}</p>}

        {!summary?.error && (
          <div className="overview-grid">
            <div className="metric-card">
              <span>Total Submissions</span>
              <strong>{totals.totalSubmissions || 0}</strong>
            </div>
            <div className="metric-card">
              <span>Average Score</span>
              <strong>{totals.avgScore || 0}</strong>
            </div>
          </div>
        )}

        {chartTopics.length === 0 && <p>No topic analysis data available yet.</p>}

        {chartTopics.length > 0 && (
          <div className="chart-list">
            {chartTopics.map((topic) => {
              const accuracy = Math.max(0, Math.min(100, Number(topic.accuracy || 0)));
              const barWidth = Math.max(accuracy, 2);
              const isWeak = accuracy < 60;

              return (
                <div className="chart-row" key={topic.topic}>
                  <div className="chart-topic">{topic.topic}</div>
                  <div className="chart-bar-shell">
                    <div
                      className={`chart-bar ${isWeak ? "weak" : "good"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="chart-score">{accuracy}%</div>
                </div>
              );
            })}
          </div>
        )}

        {Array.isArray(summary?.weakTopics) && summary.weakTopics.length > 0 && (
          <p className="meta">Weak topics: {summary.weakTopics.map((item) => item.topic).join(", ")}</p>
        )}
      </div>
    </section>
  );
}

export default StudentPanel;

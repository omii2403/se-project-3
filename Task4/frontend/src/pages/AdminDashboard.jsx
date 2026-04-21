import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminOverview, getMonitoringDashboard, listUsersByAdmin } from "../api";

function AdminDashboard({ token }) {
  const [overview, setOverview] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);

  const loadOverview = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setOverviewLoading(true);
      }

      try {
        const data = await getAdminOverview(token);
        setOverview(data);
      } catch (error) {
        setOverview({ error: error.message });
      } finally {
        if (!silent) {
          setOverviewLoading(false);
        }
      }
    },
    [token]
  );

  const loadMonitor = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setMonitorLoading(true);
      }

      try {
        const data = await getMonitoringDashboard(token);
        setMonitor(data);
      } catch (error) {
        setMonitor({ error: error.message });
      } finally {
        if (!silent) {
          setMonitorLoading(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    void loadOverview();
    void loadMonitor();
    void listUsersByAdmin(token).catch(() => null);
  }, [loadMonitor, loadOverview, token]);

  useEffect(() => {
    const refreshAll = () => {
      void loadOverview({ silent: true });
      void loadMonitor({ silent: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    };

    window.addEventListener("focus", refreshAll);
    window.addEventListener("online", refreshAll);
    document.addEventListener("visibilitychange", handleVisibility);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    }, 15000);

    return () => {
      window.removeEventListener("focus", refreshAll);
      window.removeEventListener("online", refreshAll);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [loadMonitor, loadOverview]);

  const totals = overview?.totals || {};
  const statusRows = Array.isArray(overview?.submissionStatus) ? overview.submissionStatus : [];
  const weakRows = Array.isArray(overview?.weakestTopics) ? overview.weakestTopics : [];
  const apiMetrics = monitor?.api || {};
  const queueMetrics = monitor?.queue || {};
  const workerMetrics = monitor?.worker || {};

  return (
    <section className="card">
      <div className="row-between">
        <h2>Admin Dashboard</h2>
        <div className="inline-form">
          <Link className="button-link" to="/admin/questions">
            Open Question Management
          </Link>
          <Link className="button-link" to="/admin/users">
            Open User Management
          </Link>
        </div>
      </div>

      <div className="subcard">
        <div className="row-between">
          <h3>Overview</h3>
          <button type="button" onClick={() => void loadOverview()}>
            Refresh
          </button>
        </div>

        {overviewLoading && <p className="meta">Refreshing overview...</p>}

        {overview?.error && <p className="error-text">{overview.error}</p>}

        {!overview?.error && (
          <>
            <div className="overview-grid">
              <div className="metric-card">
                <span>Users</span>
                <strong>{totals.users || 0}</strong>
              </div>
              <div className="metric-card">
                <span>Active Questions</span>
                <strong>{totals.activeQuestions || 0}</strong>
              </div>
              <div className="metric-card">
                <span>Submissions</span>
                <strong>{totals.submissions || 0}</strong>
              </div>
            </div>

            <div className="table-wrap">
              <table className="question-table compact-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.length === 0 && (
                    <tr>
                      <td colSpan={2}>No status data</td>
                    </tr>
                  )}
                  {statusRows.map((row) => (
                    <tr key={row._id}>
                      <td>{row._id}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table className="question-table compact-table">
                <thead>
                  <tr>
                    <th>Weak Topic</th>
                    <th>Attempts</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {weakRows.length === 0 && (
                    <tr>
                      <td colSpan={3}>No weak topic data</td>
                    </tr>
                  )}
                  {weakRows.map((row) => (
                    <tr key={row.topic}>
                      <td>{row.topic}</td>
                      <td>{row.attempts}</td>
                      <td>{row.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="subcard">
        <div className="row-between">
          <h3>System Monitoring</h3>
          <button type="button" onClick={() => void loadMonitor()}>
            Refresh
          </button>
        </div>

        {monitorLoading && <p className="meta">Refreshing monitoring metrics...</p>}

        {monitor?.error && <p className="error-text">{monitor.error}</p>}

        {!monitor?.error && (
          <>
            <div className="overview-grid">
              <div className="metric-card">
                <span>API Avg Latency</span>
                <strong>{apiMetrics.avgMs || 0} ms</strong>
              </div>
              <div className="metric-card">
                <span>API P95 Latency</span>
                <strong>{apiMetrics.p95Ms || 0} ms</strong>
              </div>
              <div className="metric-card">
                <span>Queue Wait P95</span>
                <strong>{workerMetrics.queueWait?.p95Ms || 0} ms</strong>
              </div>
              <div className="metric-card">
                <span>Evaluation P95</span>
                <strong>{workerMetrics.evaluation?.p95Ms || 0} ms</strong>
              </div>
              <div className="metric-card">
                <span>Queue Waiting</span>
                <strong>{queueMetrics.waiting || 0}</strong>
              </div>
              <div className="metric-card">
                <span>Worker Ready</span>
                <strong>{workerMetrics.ready ? "Yes" : "No"}</strong>
              </div>
              <div className="metric-card">
                <span>Dead-letter Jobs</span>
                <strong>{queueMetrics.deadLetter || 0}</strong>
              </div>
              <div className="metric-card">
                <span>Expected Queue Wait</span>
                <strong>{queueMetrics.expectedQueueWaitSec || 0} sec</strong>
              </div>
            </div>

            {workerMetrics.lastFailure?.reason && (
              <p className="meta">
                Last worker failure: {workerMetrics.lastFailure.reason} ({workerMetrics.lastFailure.at})
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default AdminDashboard;

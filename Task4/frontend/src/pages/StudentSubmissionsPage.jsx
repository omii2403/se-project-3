import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getQueueStatus, listSubmissions } from "../api";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value || 0));
  if (seconds <= 0) {
    return "-";
  }
  return `${seconds}s`;
}

function getStatusBadge(item) {
  if (item?.testStatusLabel === "Violation of test") {
    return {
      label: "Violation of test",
      className: "status-badge warning"
    };
  }

  const status = String(item?.status || "").toUpperCase();
  if (status === "SUBMITTED") {
    return { label: "Submitted", className: "status-badge success" };
  }
  if (status === "AUTO_SUBMITTED") {
    return { label: "Auto submitted", className: "status-badge warning" };
  }
  if (status === "EXPIRED") {
    return { label: "Expired", className: "status-badge neutral" };
  }
  if (status === "COMPLETED") {
    return { label: "Completed", className: "status-badge success" };
  }
  if (status === "RUNNING") {
    return { label: "Running", className: "status-badge info" };
  }
  if (status === "QUEUED") {
    return { label: "Queued", className: "status-badge neutral" };
  }
  if (status === "FAILED") {
    return { label: "Failed", className: "status-badge danger" };
  }

  return { label: status || "-", className: "status-badge neutral" };
}

function StudentSubmissionsPage({ token }) {
  const [submissions, setSubmissions] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [queueStatus, setQueueStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionType, setSubmissionType] = useState("all");
  const [submissionPagination, setSubmissionPagination] = useState({
    page: 1,
    totalPages: 1,
    hasPrev: false,
    hasNext: false,
    total: 0
  });

  const loadSubmissions = useCallback(
    async (page = submissionPage, type = submissionType, options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setMessage("");
        setLoading(true);
      }

      try {
        const [data, queueData] = await Promise.all([
          listSubmissions(token, {
            limit: 10,
            page,
            type,
            fresh: true
          }),
          getQueueStatus(token).catch(() => null)
        ]);

        setSubmissions(data.submissions || []);
        setExpandedRows((prev) => {
          const next = {};
          for (const item of data.submissions || []) {
            if (prev[item._id]) {
              next[item._id] = true;
            }
          }
          return next;
        });
        setSubmissionPagination(
          data.pagination || {
            page: 1,
            totalPages: 1,
            hasPrev: false,
            hasNext: false,
            total: 0
          }
        );
        if (queueData) {
          setQueueStatus(queueData);
        }
      } catch (error) {
        setSubmissions([]);
        setQueueStatus(null);
        setSubmissionPagination({
          page: 1,
          totalPages: 1,
          hasPrev: false,
          hasNext: false,
          total: 0
        });
        setMessage(error.message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [submissionPage, submissionType, token]
  );

  useEffect(() => {
    void loadSubmissions(submissionPage, submissionType);
  }, [loadSubmissions, submissionPage, submissionType]);

  useEffect(() => {
    const hasPending = submissions.some((item) => {
      const status = String(item?.status || "").toUpperCase();
      return status === "QUEUED" || status === "RUNNING";
    });

    if (!hasPending) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadSubmissions(submissionPage, submissionType, { silent: true });
    }, 7000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadSubmissions, submissionPage, submissionType, submissions]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadSubmissions(submissionPage, submissionType, { silent: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadSubmissions(submissionPage, submissionType, { silent: true });
      }
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("online", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSubmissions(submissionPage, submissionType, { silent: true });
      }
    }, 15000);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("online", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [loadSubmissions, submissionPage, submissionType]);

  return (
    <section className="card">
      <div className="row-between">
        <h2>Student Submissions</h2>
        <div className="inline-form">
          <Link className="button-link" to="/student/dashboard">
            Back to Dashboard
          </Link>
          <Link className="button-link" to="/student/test/new">
            Start Timed Test
          </Link>
        </div>
      </div>

      <div className="subcard">
        <div className="row-between">
          <h3>Submission History</h3>
          <div className="inline-form">
            <select
              value={submissionType}
              onChange={(event) => {
                setSubmissionType(event.target.value);
                setSubmissionPage(1);
              }}
            >
              <option value="all">all types</option>
              <option value="code">code</option>
              <option value="mcq">mcq</option>
              <option value="sql">sql</option>
              <option value="test">test</option>
            </select>

            <button type="button" onClick={() => void loadSubmissions(submissionPage, submissionType)}>
              Refresh
            </button>
          </div>
        </div>

        {message && <p className="error-text">{message}</p>}
        {loading && <p className="meta">Loading latest submissions...</p>}
        {submissions.length === 0 && !message && <p>No submissions yet.</p>}

        {submissions.length > 0 && (
          <div className="table-wrap">
            <table className="question-table compact-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Questions</th>
                  <th>Topic</th>
                  <th>Difficulty</th>
                  <th>Status</th>
                  <th>Queue Status</th>
                  <th>Submitted At</th>
                  <th>Expected Time</th>
                  <th>Actual Time</th>
                  <th>Score</th>
                  <th>Passed</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => {
                  const badge = getStatusBadge(item);
                  const rowId = String(item._id || "");
                  const details = Array.isArray(item.questionDetails) ? item.questionDetails : [];
                  const canExpand = String(item.type || "") === "test" && details.length > 0;
                  const isExpanded = Boolean(expandedRows[rowId]);

                  return (
                    <Fragment key={item._id}>
                      <tr>
                        <td>{item.type}</td>
                        <td>
                          {canExpand ? (
                            <button
                              type="button"
                              className="secondary details-toggle"
                              onClick={() =>
                                setExpandedRows((prev) => ({
                                  ...prev,
                                  [rowId]: !prev[rowId]
                                }))
                              }
                            >
                              {isExpanded ? "Hide" : "View"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{Math.max(1, Number(item.questionCount || 1))}</td>
                        <td>{item.topic}</td>
                        <td>{item.difficulty}</td>
                        <td>
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td>{item.queueStatus || "-"}</td>
                        <td>{formatDateTime(item.submittedAt || item.createdAt)}</td>
                        <td>{formatSeconds(item.expectedProcessingSeconds)}</td>
                        <td>{formatSeconds(item.actualProcessingSeconds)}</td>
                        <td>{Number(item.score || 0)}</td>
                        <td>{item.passed ? "Yes" : "No"}</td>
                      </tr>

                      {canExpand && isExpanded && (
                        <tr className="submission-details-row" key={`${item._id}-details`}>
                          <td colSpan={12}>
                            <div className="subcard">
                              <h4>Questions in this test submission</h4>
                              <div className="table-wrap">
                                <table className="question-table compact-table submission-detail-table">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Type</th>
                                      <th>Topic</th>
                                      <th>Difficulty</th>
                                      <th>Status</th>
                                      <th>Submitted</th>
                                      <th>Score</th>
                                      <th>Passed</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.map((detail, index) => (
                                      <tr key={`${item._id}-question-${detail.questionId || index}`}>
                                        <td>{index + 1}</td>
                                        <td>{detail.type || "-"}</td>
                                        <td>{detail.topic || "-"}</td>
                                        <td>{detail.difficulty || "-"}</td>
                                        <td>{detail.status || "-"}</td>
                                        <td>{formatDateTime(detail.submittedAt)}</td>
                                        <td>{Number(detail.score || 0)}</td>
                                        <td>{detail.passed ? "Yes" : "No"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {queueStatus?.queue && (
          <p className="meta">
            Queue now: waiting {queueStatus.queue.waiting || 0}, active {queueStatus.queue.active || 0}
            , expected wait {queueStatus.queue.expectedQueueWaitSec || 0}s.
          </p>
        )}

        <div className="row-between">
          <p className="meta">
            Page {submissionPagination.page || 1} of {submissionPagination.totalPages || 1} | Total{" "}
            {submissionPagination.total || 0}
          </p>
          <div className="inline-form">
            <button
              type="button"
              className="secondary"
              onClick={() => setSubmissionPage((prev) => Math.max(1, prev - 1))}
              disabled={!submissionPagination.hasPrev}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setSubmissionPage((prev) =>
                  Math.min(submissionPagination.totalPages || prev, prev + 1)
                )
              }
              disabled={!submissionPagination.hasNext}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StudentSubmissionsPage;

const { useEffect, useMemo, useState } = React;

function App() {
  const [token, setToken] = useState(localStorage.getItem("task4_token") || "");
  const [user, setUser] = useState(null);

  const [authMessage, setAuthMessage] = useState({ text: "", error: true });
  const [testMessage, setTestMessage] = useState({ text: "", error: true });
  const [adminMessage, setAdminMessage] = useState({ text: "", error: true });

  const [signinForm, setSigninForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    adminKey: ""
  });

  const [testForm, setTestForm] = useState({
    topic: "",
    type: "",
    difficulty: "",
    count: 5
  });
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [submissions, setSubmissions] = useState([]);
  const [studentSummary, setStudentSummary] = useState(null);

  const [adminOverview, setAdminOverview] = useState(null);
  const [adminQuestions, setAdminQuestions] = useState([]);
  const [createQuestionForm, setCreateQuestionForm] = useState({
    title: "",
    description: "",
    type: "code",
    topic: "",
    difficulty: "easy",
    choices: "",
    correctAnswer: "",
    expectedOutputs: ""
  });

  const isAdmin = user && user.role === "admin";
  const isStudent = user && user.role === "student";

  const userLabel = useMemo(() => {
    if (!user) {
      return "";
    }

    const display = user.name || user.email;
    return `Logged in as ${display} (${user.role})`;
  }, [user]);

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || "Request failed");
    }

    return body;
  }

  function storeToken(nextToken) {
    setToken(nextToken);
    localStorage.setItem("task4_token", nextToken);
  }

  function logout() {
    setToken("");
    setUser(null);
    setGeneratedQuestions([]);
    setQuestionDrafts({});
    setSubmissions([]);
    setStudentSummary(null);
    setAdminOverview(null);
    setAdminQuestions([]);
    localStorage.removeItem("task4_token");
  }

  async function restoreSession() {
    if (!token) {
      return;
    }

    try {
      const data = await api("/api/auth/verify", { method: "GET" });
      setUser({
        id: data.user.id,
        role: data.user.role,
        email: data.user.email,
        name: data.user.email
      });
    } catch (err) {
      logout();
    }
  }

  async function loadStudentSummary() {
    try {
      const data = await api("/api/analytics/student/summary", { method: "GET" });
      setStudentSummary(data);
    } catch (err) {
      setStudentSummary({ error: err.message });
    }
  }

  async function loadSubmissions() {
    try {
      const data = await api("/api/submissions?limit=20", { method: "GET" });
      setSubmissions(data.submissions || []);
    } catch (err) {
      setSubmissions([{ error: err.message }]);
    }
  }

  async function loadAdminOverview() {
    try {
      const data = await api("/api/analytics/admin/overview", { method: "GET" });
      setAdminOverview(data);
    } catch (err) {
      setAdminOverview({ error: err.message });
    }
  }

  async function loadAdminQuestions() {
    try {
      const data = await api("/api/questions?includeInactive=true", { method: "GET" });
      setAdminQuestions(data.questions || []);
    } catch (err) {
      setAdminQuestions([{ error: err.message }]);
    }
  }

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role === "student") {
      loadStudentSummary();
      loadSubmissions();
    }

    if (user.role === "admin") {
      loadAdminOverview();
      loadAdminQuestions();
    }
  }, [user]);

  async function onSignin(event) {
    event.preventDefault();
    setAuthMessage({ text: "", error: true });

    try {
      const data = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signinForm)
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || "Signin failed");
        }
        return body;
      });

      storeToken(data.token);
      setUser(data.user);
      setSigninForm({ email: "", password: "" });
    } catch (err) {
      setAuthMessage({ text: err.message, error: true });
    }
  }

  async function onSignup(event) {
    event.preventDefault();
    setAuthMessage({ text: "", error: true });

    try {
      const payload = {
        name: signupForm.name,
        email: signupForm.email,
        password: signupForm.password,
        role: signupForm.role
      };

      if (signupForm.role === "admin") {
        payload.adminKey = signupForm.adminKey;
      }

      const data = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || "Signup failed");
        }
        return body;
      });

      storeToken(data.token);
      setUser(data.user);
      setSignupForm({
        name: "",
        email: "",
        password: "",
        role: "student",
        adminKey: ""
      });
      setAuthMessage({ text: "Signup success", error: false });
    } catch (err) {
      setAuthMessage({ text: err.message, error: true });
    }
  }

  async function onGenerateTest(event) {
    event.preventDefault();
    setTestMessage({ text: "", error: true });

    try {
      const payload = {
        count: Number(testForm.count) || 5
      };

      if (testForm.topic.trim()) payload.topic = testForm.topic.trim();
      if (testForm.type) payload.type = testForm.type;
      if (testForm.difficulty) payload.difficulty = testForm.difficulty;

      const data = await api("/api/tests/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const list = data.questions || [];
      const draft = {};

      list.forEach((question) => {
        draft[question._id] = {
          answer: "",
          language: "javascript"
        };
      });

      setGeneratedQuestions(list);
      setQuestionDrafts(draft);
      setTestMessage({ text: `Generated ${list.length} question(s)`, error: false });
    } catch (err) {
      setTestMessage({ text: err.message, error: true });
    }
  }

  function updateQuestionDraft(questionId, field, value) {
    setQuestionDrafts((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || { answer: "", language: "javascript" }),
        [field]: value
      }
    }));
  }

  async function submitQuestion(question) {
    const draft = questionDrafts[question._id] || { answer: "", language: "javascript" };

    try {
      const payload = { questionId: question._id };
      if (question.type === "code") {
        payload.language = draft.language;
        payload.code = draft.answer;
      } else {
        payload.answer = draft.answer;
      }

      const data = await api("/api/submissions", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      alert(`Submission queued: ${data.submissionId}`);
      loadSubmissions();
    } catch (err) {
      alert(err.message);
    }
  }

  async function onCreateQuestion(event) {
    event.preventDefault();
    setAdminMessage({ text: "", error: true });

    try {
      const payload = {
        title: createQuestionForm.title.trim(),
        description: createQuestionForm.description.trim(),
        type: createQuestionForm.type,
        topic: createQuestionForm.topic.trim(),
        difficulty: createQuestionForm.difficulty
      };

      if (createQuestionForm.type === "mcq") {
        payload.choices = createQuestionForm.choices
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        payload.correctAnswer = createQuestionForm.correctAnswer.trim();
      }

      if (createQuestionForm.type === "sql") {
        payload.correctAnswer = createQuestionForm.correctAnswer.trim();
      }

      if (createQuestionForm.type === "code") {
        const outputs = createQuestionForm.expectedOutputs
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        payload.testCases = outputs.map((expectedOutput) => ({ expectedOutput }));
        payload.languageHints = ["javascript", "python", "cpp"];
      }

      await api("/api/questions", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAdminMessage({ text: "Question created", error: false });
      setCreateQuestionForm({
        title: "",
        description: "",
        type: "code",
        topic: "",
        difficulty: "easy",
        choices: "",
        correctAnswer: "",
        expectedOutputs: ""
      });
      loadAdminQuestions();
      loadAdminOverview();
    } catch (err) {
      setAdminMessage({ text: err.message, error: true });
    }
  }

  async function deactivateQuestion(questionId) {
    try {
      await api(`/api/questions/${questionId}`, { method: "DELETE" });
      loadAdminQuestions();
      loadAdminOverview();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Interview Preparation Platform</h1>
        <p>Task 4 Prototype using React</p>
      </header>

      <main className="container">
        {!user && (
          <section className="card">
            <h2>Login and Signup</h2>
            <div className="grid-two">
              <form onSubmit={onSignin} className="form-block">
                <h3>Signin</h3>
                <label>Email</label>
                <input
                  type="email"
                  value={signinForm.email}
                  onChange={(event) =>
                    setSigninForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  required
                />
                <label>Password</label>
                <input
                  type="password"
                  value={signinForm.password}
                  onChange={(event) =>
                    setSigninForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  required
                />
                <button type="submit">Signin</button>
              </form>

              <form onSubmit={onSignup} className="form-block">
                <h3>Signup</h3>
                <label>Name</label>
                <input
                  type="text"
                  value={signupForm.name}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
                <label>Email</label>
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  required
                />
                <label>Password</label>
                <input
                  type="password"
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  required
                />
                <label>Role</label>
                <select
                  value={signupForm.role}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  <option value="student">student</option>
                  <option value="admin">admin</option>
                </select>
                <label>Admin key (only if role is admin)</label>
                <input
                  type="text"
                  value={signupForm.adminKey}
                  onChange={(event) =>
                    setSignupForm((prev) => ({ ...prev, adminKey: event.target.value }))
                  }
                />
                <button type="submit">Signup</button>
              </form>
            </div>
            <p className={`message ${authMessage.error ? "error" : "ok"}`}>{authMessage.text}</p>
          </section>
        )}

        {user && (
          <section className="card">
            <div className="row-between">
              <div>
                <h2>Dashboard</h2>
                <p>{userLabel}</p>
              </div>
              <button className="danger" onClick={logout}>Logout</button>
            </div>

            {isStudent && (
              <section className="panel">
                <h3>Student Dashboard</h3>

                <div className="subcard">
                  <h4>Generate Test</h4>
                  <form onSubmit={onGenerateTest} className="inline-form">
                    <input
                      type="text"
                      placeholder="topic (optional)"
                      value={testForm.topic}
                      onChange={(event) =>
                        setTestForm((prev) => ({ ...prev, topic: event.target.value }))
                      }
                    />
                    <select
                      value={testForm.type}
                      onChange={(event) =>
                        setTestForm((prev) => ({ ...prev, type: event.target.value }))
                      }
                    >
                      <option value="">all types</option>
                      <option value="code">code</option>
                      <option value="mcq">mcq</option>
                      <option value="sql">sql</option>
                    </select>
                    <select
                      value={testForm.difficulty}
                      onChange={(event) =>
                        setTestForm((prev) => ({ ...prev, difficulty: event.target.value }))
                      }
                    >
                      <option value="">all difficulty</option>
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={testForm.count}
                      onChange={(event) =>
                        setTestForm((prev) => ({ ...prev, count: event.target.value }))
                      }
                    />
                    <button type="submit">Generate</button>
                  </form>
                  <p className={`message ${testMessage.error ? "error" : "ok"}`}>{testMessage.text}</p>

                  <div>
                    {generatedQuestions.length === 0 && <p>No generated questions yet.</p>}
                    {generatedQuestions.map((question, index) => {
                      const draft = questionDrafts[question._id] || { answer: "", language: "javascript" };
                      return (
                        <div className="question-card" key={question._id}>
                          <h5>{index + 1}. {question.title}</h5>
                          <p className="meta">
                            {question.type} | {question.topic} | {question.difficulty}
                          </p>
                          <p>{question.description}</p>
                          {question.type === "mcq" && Array.isArray(question.choices) && question.choices.length > 0 && (
                            <p className="meta">Choices: {question.choices.join(", ")}</p>
                          )}

                          {question.type === "code" ? (
                            <textarea
                              rows="6"
                              placeholder="Write code here"
                              value={draft.answer}
                              onChange={(event) =>
                                updateQuestionDraft(question._id, "answer", event.target.value)
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              placeholder="Write answer here"
                              value={draft.answer}
                              onChange={(event) =>
                                updateQuestionDraft(question._id, "answer", event.target.value)
                              }
                            />
                          )}

                          {question.type === "code" && (
                            <select
                              value={draft.language}
                              onChange={(event) =>
                                updateQuestionDraft(question._id, "language", event.target.value)
                              }
                            >
                              <option value="javascript">javascript</option>
                              <option value="python">python</option>
                              <option value="cpp">cpp</option>
                            </select>
                          )}

                          <button onClick={() => submitQuestion(question)}>Submit answer</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="subcard">
                  <div className="row-between">
                    <h4>My Submissions</h4>
                    <button onClick={loadSubmissions}>Refresh</button>
                  </div>
                  <div>
                    {submissions.length === 0 && <p>No submissions found.</p>}
                    {submissions.map((submission, idx) => (
                      <div className="submission-card" key={submission._id || idx}>
                        {submission.error ? (
                          <p>{submission.error}</p>
                        ) : (
                          <>
                            <p><strong>ID:</strong> {submission._id}</p>
                            <p><strong>Status:</strong> {submission.status}</p>
                            <p><strong>Topic:</strong> {submission.topic}</p>
                            <p><strong>Score:</strong> {submission.score}</p>
                            <p><strong>Passed:</strong> {String(submission.passed)}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="subcard">
                  <div className="row-between">
                    <h4>Weak Topic Analysis</h4>
                    <button onClick={loadStudentSummary}>Refresh</button>
                  </div>
                  <pre>{JSON.stringify(studentSummary, null, 2)}</pre>
                </div>
              </section>
            )}

            {isAdmin && (
              <section className="panel">
                <h3>Admin Dashboard</h3>

                <div className="subcard">
                  <div className="row-between">
                    <h4>Overview</h4>
                    <button onClick={loadAdminOverview}>Refresh</button>
                  </div>
                  <pre>{JSON.stringify(adminOverview, null, 2)}</pre>
                </div>

                <div className="subcard">
                  <h4>Create Question</h4>
                  <form className="form-block" onSubmit={onCreateQuestion}>
                    <label>Title</label>
                    <input
                      type="text"
                      value={createQuestionForm.title}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      required
                    />

                    <label>Description</label>
                    <textarea
                      rows="3"
                      value={createQuestionForm.description}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      required
                    />

                    <label>Type</label>
                    <select
                      value={createQuestionForm.type}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, type: event.target.value }))
                      }
                    >
                      <option value="code">code</option>
                      <option value="mcq">mcq</option>
                      <option value="sql">sql</option>
                    </select>

                    <label>Topic</label>
                    <input
                      type="text"
                      value={createQuestionForm.topic}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, topic: event.target.value }))
                      }
                      required
                    />

                    <label>Difficulty</label>
                    <select
                      value={createQuestionForm.difficulty}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, difficulty: event.target.value }))
                      }
                    >
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>

                    <label>Choices comma separated (for mcq)</label>
                    <input
                      type="text"
                      value={createQuestionForm.choices}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, choices: event.target.value }))
                      }
                    />

                    <label>Correct answer (mcq and sql)</label>
                    <input
                      type="text"
                      value={createQuestionForm.correctAnswer}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, correctAnswer: event.target.value }))
                      }
                    />

                    <label>Code test expected outputs line by line (for code)</label>
                    <textarea
                      rows="4"
                      value={createQuestionForm.expectedOutputs}
                      onChange={(event) =>
                        setCreateQuestionForm((prev) => ({ ...prev, expectedOutputs: event.target.value }))
                      }
                    />

                    <button type="submit">Create question</button>
                  </form>
                  <p className={`message ${adminMessage.error ? "error" : "ok"}`}>{adminMessage.text}</p>
                </div>

                <div className="subcard">
                  <div className="row-between">
                    <h4>Question List</h4>
                    <button onClick={loadAdminQuestions}>Refresh</button>
                  </div>
                  <div>
                    {adminQuestions.length === 0 && <p>No questions found.</p>}
                    {adminQuestions.map((question, idx) => (
                      <div className="admin-question-row" key={question._id || idx}>
                        {question.error ? (
                          <p>{question.error}</p>
                        ) : (
                          <>
                            <h5>{question.title}</h5>
                            <p className="meta">
                              {question.type} | {question.topic} | {question.difficulty} | {question.isActive ? "active" : "inactive"}
                            </p>
                            {question.isActive && (
                              <button
                                className="danger"
                                onClick={() => deactivateQuestion(question._id)}
                              >
                                Deactivate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </section>
        )}
      </main>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

const state = {
  token: localStorage.getItem("task4_token") || "",
  user: null,
  generatedQuestions: []
};

const refs = {
  authSection: document.getElementById("authSection"),
  appSection: document.getElementById("appSection"),
  authMessage: document.getElementById("authMessage"),
  userInfo: document.getElementById("userInfo"),
  logoutBtn: document.getElementById("logoutBtn"),

  signinForm: document.getElementById("signinForm"),
  signupForm: document.getElementById("signupForm"),

  studentPanel: document.getElementById("studentPanel"),
  generateTestForm: document.getElementById("generateTestForm"),
  testMessage: document.getElementById("testMessage"),
  generatedQuestions: document.getElementById("generatedQuestions"),
  refreshSubmissionsBtn: document.getElementById("refreshSubmissionsBtn"),
  submissionList: document.getElementById("submissionList"),
  refreshStudentSummaryBtn: document.getElementById("refreshStudentSummaryBtn"),
  studentSummary: document.getElementById("studentSummary"),

  adminPanel: document.getElementById("adminPanel"),
  refreshAdminOverviewBtn: document.getElementById("refreshAdminOverviewBtn"),
  adminOverview: document.getElementById("adminOverview"),
  createQuestionForm: document.getElementById("createQuestionForm"),
  adminMessage: document.getElementById("adminMessage"),
  refreshQuestionListBtn: document.getElementById("refreshQuestionListBtn"),
  adminQuestionList: document.getElementById("adminQuestionList")
};

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("task4_token", token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.generatedQuestions = [];
  localStorage.removeItem("task4_token");
}

function setAuthMessage(message, isError = true) {
  refs.authMessage.textContent = message || "";
  refs.authMessage.style.color = isError ? "#b91c1c" : "#047857";
}

function setAdminMessage(message, isError = true) {
  refs.adminMessage.textContent = message || "";
  refs.adminMessage.style.color = isError ? "#b91c1c" : "#047857";
}

function setTestMessage(message, isError = true) {
  refs.testMessage.textContent = message || "";
  refs.testMessage.style.color = isError ? "#b91c1c" : "#047857";
}

function renderAuthState() {
  const hasUser = Boolean(state.user);
  refs.authSection.classList.toggle("hidden", hasUser);
  refs.appSection.classList.toggle("hidden", !hasUser);

  if (!hasUser) {
    refs.studentPanel.classList.add("hidden");
    refs.adminPanel.classList.add("hidden");
    return;
  }

  refs.userInfo.textContent = `Logged in as ${state.user.name} (${state.user.role})`;

  if (state.user.role === "admin") {
    refs.adminPanel.classList.remove("hidden");
    refs.studentPanel.classList.add("hidden");
  } else {
    refs.studentPanel.classList.remove("hidden");
    refs.adminPanel.classList.add("hidden");
  }
}

async function tryRestoreSession() {
  if (!state.token) {
    renderAuthState();
    return;
  }

  try {
    const data = await api("/api/auth/verify", { method: "GET" });
    state.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
      name: data.user.email
    };
    renderAuthState();
    await loadRoleData();
  } catch (err) {
    clearSession();
    renderAuthState();
  }
}

async function loadRoleData() {
  if (!state.user) {
    return;
  }

  if (state.user.role === "admin") {
    await Promise.all([loadAdminOverview(), loadAdminQuestions()]);
  } else {
    await Promise.all([loadStudentSummary(), loadSubmissions()]);
  }
}

refs.signinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");

  const email = document.getElementById("signinEmail").value.trim();
  const password = document.getElementById("signinPassword").value;

  try {
    const data = await api("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    saveSession(data.token, data.user);
    renderAuthState();
    await loadRoleData();
  } catch (err) {
    setAuthMessage(err.message, true);
  }
});

refs.signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const role = document.getElementById("signupRole").value;
  const adminKey = document.getElementById("signupAdminKey").value.trim();

  try {
    const payload = { name, email, password, role };
    if (role === "admin") {
      payload.adminKey = adminKey;
    }

    const data = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    saveSession(data.token, data.user);
    renderAuthState();
    await loadRoleData();
    setAuthMessage("Signup success", false);
  } catch (err) {
    setAuthMessage(err.message, true);
  }
});

refs.logoutBtn.addEventListener("click", () => {
  clearSession();
  renderAuthState();
});

refs.generateTestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setTestMessage("");

  const topic = document.getElementById("testTopic").value.trim();
  const type = document.getElementById("testType").value;
  const difficulty = document.getElementById("testDifficulty").value;
  const count = Number(document.getElementById("testCount").value || 5);

  try {
    const payload = { count };
    if (topic) payload.topic = topic;
    if (type) payload.type = type;
    if (difficulty) payload.difficulty = difficulty;

    const data = await api("/api/tests/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.generatedQuestions = data.questions || [];
    renderGeneratedQuestions();
    setTestMessage(`Generated ${state.generatedQuestions.length} question(s)`, false);
  } catch (err) {
    setTestMessage(err.message, true);
  }
});

function renderGeneratedQuestions() {
  refs.generatedQuestions.innerHTML = "";

  if (state.generatedQuestions.length === 0) {
    refs.generatedQuestions.innerHTML = "<p>No generated questions yet.</p>";
    return;
  }

  state.generatedQuestions.forEach((question, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "question-card";

    const heading = document.createElement("h5");
    heading.textContent = `${index + 1}. ${question.title}`;
    wrapper.appendChild(heading);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${question.type} | ${question.topic} | ${question.difficulty}`;
    wrapper.appendChild(meta);

    const desc = document.createElement("p");
    desc.textContent = question.description;
    wrapper.appendChild(desc);

    if (question.type === "mcq" && Array.isArray(question.choices) && question.choices.length > 0) {
      const choiceInfo = document.createElement("p");
      choiceInfo.className = "meta";
      choiceInfo.textContent = `Choices: ${question.choices.join(", ")}`;
      wrapper.appendChild(choiceInfo);
    }

    const answerInput = document.createElement(question.type === "code" ? "textarea" : "input");
    answerInput.rows = 6;
    answerInput.placeholder = question.type === "code" ? "Write code here" : "Write answer here";
    wrapper.appendChild(answerInput);

    let languageSelect;
    if (question.type === "code") {
      languageSelect = document.createElement("select");
      ["javascript", "python", "cpp"].forEach((language) => {
        const opt = document.createElement("option");
        opt.value = language;
        opt.textContent = language;
        languageSelect.appendChild(opt);
      });
      wrapper.appendChild(languageSelect);
    }

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Submit answer";
    submitBtn.addEventListener("click", async () => {
      try {
        const payload = {
          questionId: question._id
        };

        if (question.type === "code") {
          payload.language = languageSelect.value;
          payload.code = answerInput.value;
        } else {
          payload.answer = answerInput.value;
        }

        const result = await api("/api/submissions", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        alert(`Submission queued: ${result.submissionId}`);
        await loadSubmissions();
      } catch (err) {
        alert(err.message);
      }
    });
    wrapper.appendChild(submitBtn);

    refs.generatedQuestions.appendChild(wrapper);
  });
}

async function loadSubmissions() {
  try {
    const data = await api("/api/submissions?limit=20", { method: "GET" });
    const submissions = data.submissions || [];

    refs.submissionList.innerHTML = "";
    if (submissions.length === 0) {
      refs.submissionList.innerHTML = "<p>No submissions found.</p>";
      return;
    }

    submissions.forEach((item) => {
      const box = document.createElement("div");
      box.className = "submission-card";
      box.innerHTML = `
        <p><strong>ID:</strong> ${item._id}</p>
        <p><strong>Status:</strong> ${item.status}</p>
        <p><strong>Topic:</strong> ${item.topic}</p>
        <p><strong>Score:</strong> ${item.score}</p>
        <p><strong>Passed:</strong> ${item.passed}</p>
      `;
      refs.submissionList.appendChild(box);
    });
  } catch (err) {
    refs.submissionList.innerHTML = `<p>${err.message}</p>`;
  }
}

async function loadStudentSummary() {
  try {
    const data = await api("/api/analytics/student/summary", { method: "GET" });
    refs.studentSummary.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    refs.studentSummary.textContent = err.message;
  }
}

refs.refreshSubmissionsBtn.addEventListener("click", loadSubmissions);
refs.refreshStudentSummaryBtn.addEventListener("click", loadStudentSummary);

refs.refreshAdminOverviewBtn.addEventListener("click", loadAdminOverview);
refs.refreshQuestionListBtn.addEventListener("click", loadAdminQuestions);

async function loadAdminOverview() {
  try {
    const data = await api("/api/analytics/admin/overview", { method: "GET" });
    refs.adminOverview.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    refs.adminOverview.textContent = err.message;
  }
}

refs.createQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAdminMessage("");

  const type = document.getElementById("qType").value;
  const title = document.getElementById("qTitle").value.trim();
  const description = document.getElementById("qDescription").value.trim();
  const topic = document.getElementById("qTopic").value.trim();
  const difficulty = document.getElementById("qDifficulty").value;
  const choicesRaw = document.getElementById("qChoices").value.trim();
  const correctAnswer = document.getElementById("qCorrectAnswer").value.trim();
  const outputsRaw = document.getElementById("qExpectedOutputs").value;

  try {
    const payload = {
      type,
      title,
      description,
      topic,
      difficulty
    };

    if (type === "mcq") {
      payload.choices = choicesRaw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      payload.correctAnswer = correctAnswer;
    }

    if (type === "sql") {
      payload.correctAnswer = correctAnswer;
    }

    if (type === "code") {
      const lines = outputsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      payload.testCases = lines.map((expectedOutput) => ({ expectedOutput }));
      payload.languageHints = ["javascript", "python", "cpp"];
    }

    await api("/api/questions", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setAdminMessage("Question created", false);
    refs.createQuestionForm.reset();
    await loadAdminQuestions();
  } catch (err) {
    setAdminMessage(err.message, true);
  }
});

async function loadAdminQuestions() {
  try {
    const data = await api("/api/questions?includeInactive=true", { method: "GET" });
    const questions = data.questions || [];

    refs.adminQuestionList.innerHTML = "";
    if (questions.length === 0) {
      refs.adminQuestionList.innerHTML = "<p>No questions found.</p>";
      return;
    }

    questions.forEach((question) => {
      const row = document.createElement("div");
      row.className = "admin-question-row";

      const status = question.isActive ? "active" : "inactive";
      row.innerHTML = `
        <h5>${question.title}</h5>
        <p class="meta">${question.type} | ${question.topic} | ${question.difficulty} | ${status}</p>
      `;

      if (question.isActive) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "danger";
        deleteBtn.textContent = "Deactivate";
        deleteBtn.addEventListener("click", async () => {
          try {
            await api(`/api/questions/${question._id}`, { method: "DELETE" });
            await loadAdminQuestions();
          } catch (err) {
            alert(err.message);
          }
        });
        row.appendChild(deleteBtn);
      }

      refs.adminQuestionList.appendChild(row);
    });
  } catch (err) {
    refs.adminQuestionList.innerHTML = `<p>${err.message}</p>`;
  }
}

tryRestoreSession();

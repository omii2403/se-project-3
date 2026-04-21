const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const { method = "GET", token, body, cacheMode = "no-store" } = options;

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    cache: cacheMode,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export function signup(payload) {
  return request("/api/auth/signup", { method: "POST", body: payload });
}

export function signin(payload) {
  return request("/api/auth/signin", { method: "POST", body: payload });
}

export function verifyToken(token) {
  return request("/api/auth/verify", { token });
}

export function getProfile(token) {
  return request("/api/auth/profile", { token });
}

export function updateProfile(token, payload) {
  return request("/api/auth/profile", {
    method: "PUT",
    token,
    body: payload
  });
}

export function generateTest(token, payload) {
  return request("/api/tests/generate", {
    method: "POST",
    token,
    body: payload
  });
}

export function startTimedTest(token, payload) {
  return request("/api/tests/start", {
    method: "POST",
    token,
    body: payload
  });
}

export function getTimedTestSession(token, sessionId) {
  return request(`/api/tests/${sessionId}`, { token });
}

export function reportTestViolation(token, sessionId, payload = {}) {
  return request(`/api/tests/${sessionId}/violation`, {
    method: "POST",
    token,
    body: payload
  });
}

export function runSampleTestCase(token, sessionId, payload) {
  return request(`/api/tests/${sessionId}/run-sample`, {
    method: "POST",
    token,
    body: payload
  });
}

export function submitTimedTest(token, sessionId, payload) {
  return request(`/api/tests/${sessionId}/submit`, {
    method: "POST",
    token,
    body: payload
  });
}

export function createSubmission(token, payload) {
  return request("/api/submissions", {
    method: "POST",
    token,
    body: payload
  });
}

export function listSubmissions(token, options = {}) {
  const resolved = typeof options === "number" ? { limit: options } : options;
  const params = new URLSearchParams();

  if (resolved.limit) {
    params.set("limit", String(resolved.limit));
  }
  if (resolved.page) {
    params.set("page", String(resolved.page));
  }
  if (resolved.type && resolved.type !== "all") {
    params.set("type", String(resolved.type));
  }
  if (resolved.fresh) {
    params.set("fresh", "1");
  }

  const query = params.toString();
  const path = query ? `/api/submissions?${query}` : "/api/submissions";
  return request(path, { token, cacheMode: "no-store" });
}

export function getStudentSummary(token) {
  return request("/api/analytics/student/summary", { token });
}

export function getAdminOverview(token) {
  return request("/api/analytics/admin/overview", { token });
}

export function getMonitoringDashboard(token) {
  return request("/api/monitor/dashboard", { token });
}

export function getQueueStatus(token) {
  return request("/api/submissions/queue/status", { token, cacheMode: "no-store" });
}

export function listQuestionTopics(token) {
  return request("/api/questions/topics", { token });
}

export function listQuestions(token, includeInactive = true) {
  const query = includeInactive ? "?includeInactive=true" : "";
  return request(`/api/questions${query}`, { token });
}

export function createQuestion(token, payload) {
  return request("/api/questions", {
    method: "POST",
    token,
    body: payload
  });
}

export function updateQuestion(token, questionId, payload) {
  return request(`/api/questions/${questionId}`, {
    method: "PUT",
    token,
    body: payload
  });
}

export function deactivateQuestion(token, questionId) {
  return request(`/api/questions/${questionId}`, {
    method: "DELETE",
    token
  });
}

export function deleteQuestionPermanently(token, questionId) {
  return request(`/api/questions/${questionId}/permanent`, {
    method: "DELETE",
    token
  });
}

export function listUsersByAdmin(token, role = "") {
  const params = new URLSearchParams();
  if (role && role !== "all") {
    params.set("role", String(role));
  }

  const query = params.toString();
  const path = query ? `/api/users?${query}` : "/api/users";
  return request(path, { token });
}

export function updateUserByAdmin(token, userId, payload) {
  return request(`/api/users/${userId}`, {
    method: "PUT",
    token,
    body: payload
  });
}

export function deleteUserByAdmin(token, userId) {
  return request(`/api/users/${userId}`, {
    method: "DELETE",
    token
  });
}

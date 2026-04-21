import { Fragment, useEffect, useState } from "react";
import {
  createQuestion,
  deactivateQuestion,
  deleteQuestionPermanently,
  listQuestions,
  updateQuestion
} from "../api";

function toExpectedOutputLines(testCases) {
  if (!Array.isArray(testCases)) {
    return "";
  }

  return testCases
    .map((item) => String(item?.expectedOutput || "").trim())
    .filter(Boolean)
    .join("\n");
}

function toInputLines(testCases) {
  if (!Array.isArray(testCases)) {
    return "";
  }

  return testCases.map((item) => String(item?.input || "")).join("\n");
}

function buildTestCases(inputText, outputText) {
  const outputLines = String(outputText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const inputLines = String(inputText || "").split("\n");

  return outputLines.map((expectedOutput, index) => ({
    input: String(inputLines[index] || "").trim(),
    expectedOutput
  }));
}

function buildQuestionPayload(form) {
  const payload = {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    topic: form.topic.trim(),
    difficulty: form.difficulty
  };

  if (form.type === "code") {
    payload.constraints = String(form.constraints || "").trim();
  }

  if (form.type === "mcq") {
    payload.choices = form.choices
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    payload.correctAnswer = form.correctAnswer.trim();
  }

  if (form.type === "sql") {
    payload.correctAnswer = form.correctAnswer.trim();
    payload.sqlTableCsv = String(form.sqlTableCsv || "").trim();
    payload.sqlExpectedOutputCsv = String(form.sqlExpectedOutputCsv || "").trim();
  }

  if (form.type === "code") {
    payload.sampleTestCases = buildTestCases(form.sampleInputs, form.sampleExpectedOutputs);
    payload.hiddenTestCases = buildTestCases(form.hiddenInputs, form.hiddenExpectedOutputs);
    payload.languageHints = ["javascript", "python", "cpp"];
  }

  return payload;
}

function toEditForm(question) {
  return {
    title: question.title || "",
    description: question.description || "",
    constraints: question.constraints || "",
    type: question.type || "code",
    topic: question.topic || "",
    difficulty: question.difficulty || "easy",
    choices: Array.isArray(question.choices) ? question.choices.join(", ") : "",
    correctAnswer: question.correctAnswer || "",
    sqlTableCsv: question.sqlTableCsv || "",
    sqlExpectedOutputCsv: question.sqlExpectedOutputCsv || "",
    sampleInputs: toInputLines(question.sampleTestCases),
    sampleExpectedOutputs: toExpectedOutputLines(question.sampleTestCases),
    hiddenInputs: toInputLines(question.hiddenTestCases) || toInputLines(question.testCases),
    hiddenExpectedOutputs:
      toExpectedOutputLines(question.hiddenTestCases) || toExpectedOutputLines(question.testCases)
  };
}

function emptyQuestionForm() {
  return {
    title: "",
    description: "",
    constraints: "",
    type: "code",
    topic: "",
    difficulty: "easy",
    choices: "",
    correctAnswer: "",
    sqlTableCsv: "",
    sqlExpectedOutputCsv: "",
    sampleInputs: "",
    sampleExpectedOutputs: "",
    hiddenInputs: "",
    hiddenExpectedOutputs: ""
  };
}

function AdminPanel({ token }) {
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [form, setForm] = useState(emptyQuestionForm());

  useEffect(() => {
    void loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      const data = await listQuestions(token, true);
      setQuestions(data.questions || []);
    } catch (error) {
      setQuestions([]);
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  async function handleCreateQuestion(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildQuestionPayload(form);
      await createQuestion(token, payload);
      setMessageColor("#047857");
      setMessage("Question created");
      setForm(emptyQuestionForm());
      await loadQuestions();
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  async function handleDeactivate(questionId) {
    try {
      await deactivateQuestion(token, questionId);
      if (editingId === questionId) {
        setEditingId("");
        setEditForm(null);
      }
      await loadQuestions();
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  async function handlePermanentDelete(questionId) {
    const confirmed = window.confirm(
      "This will permanently delete the question. This action cannot be undone. Continue?"
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteQuestionPermanently(token, questionId);
      if (editingId === questionId) {
        setEditingId("");
        setEditForm(null);
      }
      setMessageColor("#047857");
      setMessage("Question permanently deleted");
      await loadQuestions();
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  function startEdit(question) {
    setEditingId(question._id);
    setEditForm(toEditForm(question));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editingId || !editForm) {
      return;
    }

    try {
      const payload = buildQuestionPayload(editForm);
      await updateQuestion(token, editingId, payload);
      setMessageColor("#047857");
      setMessage("Question updated");
      setEditingId("");
      setEditForm(null);
      await loadQuestions();
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card">
      <h2>Admin Question Management</h2>

      <div className="subcard">
        <h3>Add New Question</h3>
        <form className="form-block" onSubmit={handleCreateQuestion}>
          <label htmlFor="qTitle">Title</label>
          <input
            id="qTitle"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />

          <label htmlFor="qDescription">Description</label>
          <textarea
            id="qDescription"
            rows={3}
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            required
          />

          {form.type === "code" && (
            <>
              <label htmlFor="qConstraints">Constraints (optional)</label>
              <textarea
                id="qConstraints"
                rows={3}
                placeholder="Example: 1 <= n <= 10^5"
                value={form.constraints}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, constraints: event.target.value }))
                }
              />
            </>
          )}

          <div className="grid-two">
            <div>
              <label htmlFor="qType">Type</label>
              <select
                id="qType"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="code">code</option>
                <option value="mcq">mcq</option>
                <option value="sql">sql</option>
              </select>
            </div>

            <div>
              <label htmlFor="qDifficulty">Difficulty</label>
              <select
                id="qDifficulty"
                value={form.difficulty}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, difficulty: event.target.value }))
                }
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>
          </div>

          <label htmlFor="qTopic">Topic</label>
          <input
            id="qTopic"
            value={form.topic}
            onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
            required
          />

          {form.type === "mcq" && (
            <>
              <label htmlFor="qChoices">Choices (comma separated)</label>
              <input
                id="qChoices"
                value={form.choices}
                onChange={(event) => setForm((prev) => ({ ...prev, choices: event.target.value }))}
              />

              <label htmlFor="qCorrect">Correct answer</label>
              <input
                id="qCorrect"
                value={form.correctAnswer}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, correctAnswer: event.target.value }))
                }
              />
            </>
          )}

          {form.type === "sql" && (
            <>
              <label htmlFor="qSqlCorrect">Correct answer</label>
              <input
                id="qSqlCorrect"
                value={form.correctAnswer}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, correctAnswer: event.target.value }))
                }
              />

              <label htmlFor="qSqlTableCsv">Table CSV (visible to student)</label>
              <textarea
                id="qSqlTableCsv"
                rows={5}
                placeholder="id,name\n1,Alice\n2,Bob"
                value={form.sqlTableCsv}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sqlTableCsv: event.target.value }))
                }
              />

              <label htmlFor="qSqlExpectedCsv">Expected output CSV (visible + checking)</label>
              <textarea
                id="qSqlExpectedCsv"
                rows={5}
                placeholder="name\nAlice"
                value={form.sqlExpectedOutputCsv}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sqlExpectedOutputCsv: event.target.value }))
                }
              />
            </>
          )}

          {form.type === "code" && (
            <>
              <label htmlFor="qSampleInputs">Sample test inputs (line by line)</label>
              <textarea
                id="qSampleInputs"
                rows={4}
                value={form.sampleInputs}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sampleInputs: event.target.value }))
                }
              />

              <label htmlFor="qSampleOutputs">Sample test expected outputs (line by line)</label>
              <textarea
                id="qSampleOutputs"
                rows={4}
                value={form.sampleExpectedOutputs}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sampleExpectedOutputs: event.target.value }))
                }
              />

              <label htmlFor="qHiddenInputs">Hidden test inputs (line by line)</label>
              <textarea
                id="qHiddenInputs"
                rows={4}
                value={form.hiddenInputs}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, hiddenInputs: event.target.value }))
                }
              />

              <label htmlFor="qHiddenOutputs">Hidden test expected outputs (line by line)</label>
              <textarea
                id="qHiddenOutputs"
                rows={4}
                value={form.hiddenExpectedOutputs}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, hiddenExpectedOutputs: event.target.value }))
                }
              />
            </>
          )}

          <button type="submit">Create Question</button>
        </form>

        <p className="message" style={{ color: messageColor }}>
          {message}
        </p>
      </div>

      <div className="subcard">
        <div className="row-between">
          <h3>Question Table</h3>
          <button type="button" onClick={() => void loadQuestions()}>
            Refresh
          </button>
        </div>

        <div className="table-wrap">
          <table className="question-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Topic</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.length === 0 && (
                <tr>
                  <td colSpan={6}>No questions found.</td>
                </tr>
              )}

              {questions.map((question) => {
                const isEditing = editingId === question._id;

                if (!isEditing) {
                  return (
                    <tr key={question._id}>
                      <td>{question.title}</td>
                      <td>{question.type}</td>
                      <td>{question.topic}</td>
                      <td>{question.difficulty}</td>
                      <td>{question.isActive ? "active" : "inactive"}</td>
                      <td className="table-actions">
                        <button type="button" onClick={() => startEdit(question)}>
                          Edit
                        </button>
                        {question.isActive && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void handleDeactivate(question._id)}
                          >
                            Deactivate
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handlePermanentDelete(question._id)}
                        >
                          Delete Permanent
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <Fragment key={question._id}>
                    <tr>
                      <td>
                        <input
                          value={editForm?.title || ""}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, title: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={editForm?.type || "code"}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, type: event.target.value }))
                          }
                        >
                          <option value="code">code</option>
                          <option value="mcq">mcq</option>
                          <option value="sql">sql</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={editForm?.topic || ""}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, topic: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={editForm?.difficulty || "easy"}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, difficulty: event.target.value }))
                          }
                        >
                          <option value="easy">easy</option>
                          <option value="medium">medium</option>
                          <option value="hard">hard</option>
                        </select>
                      </td>
                      <td>{question.isActive ? "active" : "inactive"}</td>
                      <td className="table-actions">
                        <button type="button" onClick={() => void saveEdit()}>
                          Save
                        </button>
                        <button type="button" className="secondary" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={6}>
                        <div className="edit-details">
                          <label>Description</label>
                          <textarea
                            rows={3}
                            value={editForm?.description || ""}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, description: event.target.value }))
                            }
                          />

                          {editForm?.type === "code" && (
                            <>
                              <label>Constraints</label>
                              <textarea
                                rows={3}
                                value={editForm?.constraints || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, constraints: event.target.value }))
                                }
                              />
                            </>
                          )}

                          {editForm?.type === "mcq" && (
                            <>
                              <label>Choices comma separated</label>
                              <input
                                value={editForm?.choices || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, choices: event.target.value }))
                                }
                              />
                              <label>Correct answer</label>
                              <input
                                value={editForm?.correctAnswer || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, correctAnswer: event.target.value }))
                                }
                              />
                            </>
                          )}

                          {editForm?.type === "sql" && (
                            <>
                              <label>Correct answer</label>
                              <input
                                value={editForm?.correctAnswer || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, correctAnswer: event.target.value }))
                                }
                              />

                              <label>Table CSV (visible)</label>
                              <textarea
                                rows={5}
                                value={editForm?.sqlTableCsv || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, sqlTableCsv: event.target.value }))
                                }
                              />

                              <label>Expected output CSV (visible + checking)</label>
                              <textarea
                                rows={5}
                                value={editForm?.sqlExpectedOutputCsv || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    sqlExpectedOutputCsv: event.target.value
                                  }))
                                }
                              />
                            </>
                          )}

                          {editForm?.type === "code" && (
                            <>
                              <label>Sample inputs (line by line)</label>
                              <textarea
                                rows={4}
                                value={editForm?.sampleInputs || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    sampleInputs: event.target.value
                                  }))
                                }
                              />

                              <label>Sample expected outputs (line by line)</label>
                              <textarea
                                rows={4}
                                value={editForm?.sampleExpectedOutputs || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    sampleExpectedOutputs: event.target.value
                                  }))
                                }
                              />

                              <label>Hidden inputs (line by line)</label>
                              <textarea
                                rows={4}
                                value={editForm?.hiddenInputs || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    hiddenInputs: event.target.value
                                  }))
                                }
                              />

                              <label>Hidden expected outputs (line by line)</label>
                              <textarea
                                rows={4}
                                value={editForm?.hiddenExpectedOutputs || ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    hiddenExpectedOutputs: event.target.value
                                  }))
                                }
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AdminPanel;

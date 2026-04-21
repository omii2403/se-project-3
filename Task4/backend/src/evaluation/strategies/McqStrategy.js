class McqStrategy {
  async evaluate({ submission, question }) {
    const answer = String(submission.answer || "").trim().toLowerCase();
    const expected = String(question.correctAnswer || "").trim().toLowerCase();

    const passed = answer.length > 0 && answer === expected;

    return {
      passed,
      score: passed ? 100 : 0,
      output: {
        stdout: "",
        stderr: "",
        details: passed ? "Correct answer" : "Wrong answer"
      }
    };
  }
}

module.exports = McqStrategy;

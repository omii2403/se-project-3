const CodeStrategy = require("./strategies/CodeStrategy");
const McqStrategy = require("./strategies/McqStrategy");
const SqlStrategy = require("./strategies/SqlStrategy");

function createEvaluationStrategy(type) {
  if (type === "code") {
    return new CodeStrategy();
  }

  if (type === "mcq") {
    return new McqStrategy();
  }

  if (type === "sql") {
    return new SqlStrategy();
  }

  throw new Error(`Unsupported question type: ${type}`);
}

module.exports = {
  createEvaluationStrategy
};

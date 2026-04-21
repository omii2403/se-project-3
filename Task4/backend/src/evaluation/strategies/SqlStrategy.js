const alasql = require("alasql");

function normalizeSql(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCsv(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return "";
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()).join(","))
    .join("\n");
}

function parseCsv(value) {
  const normalized = normalizeCsv(value);
  if (!normalized) {
    return {
      headers: [],
      rows: []
    };
  }

  const lines = normalized.split("\n");
  const headers = lines[0].split(",").map((item) => item.trim()).filter(Boolean);

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((item) => item.trim());
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index] : "";
    });

    return row;
  });

  return {
    headers,
    rows
  };
}

function serializeResultToCsv(resultRows, expectedCsv) {
  const cleanRows = Array.isArray(resultRows) ? resultRows : [];
  const expected = parseCsv(expectedCsv);
  const headers = expected.headers;

  if (headers.length === 0) {
    return "";
  }

  const lines = [headers.join(",")];

  for (const row of cleanRows) {
    const values = headers.map((header) => String(row?.[header] ?? "").trim());
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function tableNameFromQuery(query) {
  const match = String(query || "").match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!match) {
    return "input_table";
  }

  return match[1];
}

function resolveSqlTableName(question) {
  const configured = String(question.sqlTableName || "").trim();
  if (configured) {
    return configured;
  }

  const fromCorrect = tableNameFromQuery(question.correctAnswer || "");
  if (fromCorrect && fromCorrect !== "input_table") {
    return fromCorrect;
  }

  return "students";
}

class SqlStrategy {
  async evaluate({ submission, question }) {
    const hasCsvExpected = String(question.sqlExpectedOutputCsv || "").trim().length > 0;

    if (hasCsvExpected) {
      const query = String(submission.answer || "").trim();
      if (!query) {
        return {
          passed: false,
          score: 0,
          output: {
            stdout: "",
            stderr: "Missing SQL query",
            details: "Please write SQL query"
          }
        };
      }

      const parsedTable = parseCsv(question.sqlTableCsv || "");
      if (parsedTable.headers.length === 0) {
        return {
          passed: false,
          score: 0,
          output: {
            stdout: "",
            stderr: "SQL table CSV is missing headers",
            details: "Admin must configure table CSV header row"
          }
        };
      }

      const tableName = resolveSqlTableName(question);

      try {
        const existing = alasql.tables[tableName];
        if (existing) {
          delete alasql.tables[tableName];
        }

        alasql(`CREATE TABLE ${tableName}`);
        alasql.tables[tableName].data = parsedTable.rows;

        const resultRows = alasql(query);
        const actualCsv = normalizeCsv(
          serializeResultToCsv(resultRows, question.sqlExpectedOutputCsv)
        );
        const expectedCsv = normalizeCsv(question.sqlExpectedOutputCsv);
        const passed = actualCsv.length > 0 && actualCsv === expectedCsv;

        return {
          passed,
          score: passed ? 100 : 0,
          output: {
            stdout: actualCsv,
            stderr: "",
            details: passed
              ? `SQL query output matched expected CSV (table: ${tableName})`
              : `SQL query output did not match expected CSV (table: ${tableName})`
          }
        };
      } catch (error) {
        return {
          passed: false,
          score: 0,
          output: {
            stdout: "",
            stderr: error.message,
            details: "SQL query execution failed"
          }
        };
      } finally {
        if (alasql.tables[tableName]) {
          delete alasql.tables[tableName];
        }
      }
    }

    const answer = normalizeSql(submission.answer);
    const expected = normalizeSql(question.correctAnswer);

    const passed = answer.length > 0 && answer === expected;

    return {
      passed,
      score: passed ? 100 : 0,
      output: {
        stdout: "",
        stderr: "",
        details: passed
          ? "SQL matched expected answer"
          : "SQL did not match expected answer"
      }
    };
  }
}

module.exports = SqlStrategy;

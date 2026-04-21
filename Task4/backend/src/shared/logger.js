function emit(level, event, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields
  };

  const line = JSON.stringify(payload);
  if (level === "error" || level === "warn") {
    console.error(line);
    return;
  }

  console.log(line);
}

function info(event, fields) {
  emit("info", event, fields);
}

function warn(event, fields) {
  emit("warn", event, fields);
}

function error(event, fields) {
  emit("error", event, fields);
}

module.exports = {
  info,
  warn,
  error
};

function splitSqlStatements(sql) {
  const chunks = sql.includes("-- @split")
    ? sql.split(/\n-- @split\n/g)
    : sql.split(/;\s*\n/g);

  return chunks
    .map((stmt) => stmt.replace(/^(?:\s*--[^\n]*\n)+/, "").trim())
    .filter((stmt) => stmt.length > 0);
}

module.exports = { splitSqlStatements };

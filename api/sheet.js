const DEFAULT_SHEET_ID = "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U";
const DEFAULT_SHEET_GID = "433514608";
const DEFAULT_MONTH_SHEETS = [
  "Janeiro",
  "Fevereiro",
  "Mar\u00e7o",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
];

function getSheetId() {
  return process.env.SHEET_ID || DEFAULT_SHEET_ID;
}

function getMonthSheets() {
  const configured = process.env.SHEET_NAMES;
  if (!configured) return DEFAULT_MONTH_SHEETS;

  return configured
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildSheetUrls() {
  const sheetId = getSheetId();
  const sheetGid = process.env.SHEET_GID || DEFAULT_SHEET_GID;

  return [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${sheetGid}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`,
  ];
}

function buildNamedSheetUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${getSheetId()}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function looksLikeCsv(text) {
  const trimmed = text.trim();
  return Boolean(trimmed) && !trimmed.startsWith("<") && !trimmed.includes("ServiceLogin");
}

function escapeCsv(value) {
  return String(value).replace(/"/g, '""');
}

async function fetchSheetCsv(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Dash-Gestao/1.0",
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Google Sheets respondeu HTTP ${response.status}.`);
  if (!looksLikeCsv(text)) throw new Error("A planilha nao esta publica ou nao retornou CSV.");
  return text;
}

async function loadMonthlySheetsCsv() {
  let header = "";
  const rows = [];
  let lastError = "Nenhuma aba mensal retornou dados.";

  for (const sheetName of getMonthSheets()) {
    try {
      const csv = await fetchSheetCsv(buildNamedSheetUrl(sheetName));
      const lines = csv
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const dataRows = lines.slice(1).filter((line) => line.replace(/,/g, "").trim());

      if (!lines[0] || !dataRows.length) continue;
      if (!header) header = `"Aba",${lines[0]}`;

      dataRows.forEach((line) => rows.push(`"${escapeCsv(sheetName)}",${line}`));
    } catch (error) {
      lastError = error.message;
    }
  }

  if (!rows.length) throw new Error(lastError);
  return `${header}\n${rows.join("\n")}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  let lastError = "Planilha indisponivel.";

  try {
    const csv = await loadMonthlySheetsCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.statusCode = 200;
    res.end(csv);
    return;
  } catch (error) {
    lastError = error.message;
  }

  for (const url of buildSheetUrls()) {
    try {
      const text = await fetchSheetCsv(url);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.statusCode = 200;
      res.end(text);
      return;
    } catch (error) {
      lastError = error.message;
    }
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 502;
  res.end(JSON.stringify({ error: lastError }));
};

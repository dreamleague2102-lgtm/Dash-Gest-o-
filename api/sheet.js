const DEFAULT_SHEET_ID = "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U";
const DEFAULT_SHEET_GID = "433514608";

function buildSheetUrls() {
  const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
  const sheetGid = process.env.SHEET_GID || DEFAULT_SHEET_GID;

  return [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${sheetGid}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`,
  ];
}

function looksLikeCsv(text) {
  const trimmed = text.trim();
  return Boolean(trimmed) && !trimmed.startsWith("<") && !trimmed.includes("ServiceLogin");
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

  for (const url of buildSheetUrls()) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Dash-Gestao/1.0",
        },
      });

      const text = await response.text();
      if (!response.ok) {
        lastError = `Google Sheets respondeu HTTP ${response.status}.`;
        continue;
      }

      if (!looksLikeCsv(text)) {
        lastError = "A planilha nao esta publica ou nao retornou CSV.";
        continue;
      }

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

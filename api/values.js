const DEFAULT_SHEET_ID = "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Valores`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Dash-Gestao/1.0" },
    });
    const text = await response.text();

    if (!response.ok || !text.trim() || text.trim().startsWith("<")) {
      throw new Error(`Google Sheets respondeu HTTP ${response.status}.`);
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.statusCode = 200;
    res.end(text);
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message }));
  }
};

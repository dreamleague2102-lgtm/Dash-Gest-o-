import os
import json
import csv
from io import StringIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote
from urllib.error import URLError
from urllib.request import Request, urlopen


SHEET_ID = os.getenv("SHEET_ID", "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U")
SHEET_GID = os.getenv("SHEET_GID", "433514608")
PORT = int(os.getenv("PORT", "8000"))
DEFAULT_MONTH_SHEETS = [
    "Janeiro",
    "Fevereiro",
    "Mar\u00e7o",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
]


def month_sheets():
    configured = os.getenv("SHEET_NAMES")
    if not configured:
        return DEFAULT_MONTH_SHEETS

    return [name.strip() for name in configured.split(",") if name.strip()]


def sheet_urls():
    return [
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid={SHEET_GID}",
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}",
    ]


def named_sheet_url(sheet_name):
    return f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={quote(sheet_name)}"


def looks_like_csv(data):
    stripped = data.strip()
    return bool(stripped) and not stripped.startswith(b"<") and b"ServiceLogin" not in stripped


def fetch_csv(url):
    request = Request(url, headers={"User-Agent": "Dash-Gestao/1.0"})
    with urlopen(request, timeout=20) as response:
        data = response.read()

    if not looks_like_csv(data):
        raise RuntimeError("A planilha nao esta publica ou nao retornou CSV.")

    return data.decode("utf-8-sig")


def combine_month_sheets_csv():
    header = None
    combined_rows = []
    last_error = "Nenhuma aba mensal retornou dados."

    for sheet_name in month_sheets():
        try:
            csv_text = fetch_csv(named_sheet_url(sheet_name))
            rows = list(csv.reader(StringIO(csv_text)))
            rows = [row for row in rows if any(str(value).strip() for value in row)]
            if len(rows) < 2:
                continue

            if header is None:
                header = ["Aba", *rows[0]]

            for row in rows[1:]:
                combined_rows.append([sheet_name, *row])
        except Exception as error:
            last_error = str(error)

    if not combined_rows or header is None:
        raise RuntimeError(last_error)

    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(combined_rows)
    return output.getvalue().encode("utf-8")


class DashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/sheet"):
            self.send_sheet_csv()
            return

        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/api/sheet"):
            self.send_sheet_csv(head_only=True)
            return

        super().do_HEAD()

    def send_sheet_csv(self, head_only=False):
        last_error = "Planilha indisponivel."

        try:
            csv_data = combine_month_sheets_csv()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.end_headers()
            if not head_only:
                self.wfile.write(csv_data)
            return
        except Exception as error:
            last_error = str(error)

        for url in sheet_urls():
            try:
                csv_data = fetch_csv(url).encode("utf-8")

                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.end_headers()
                if not head_only:
                    self.wfile.write(csv_data)
                return
            except URLError as error:
                last_error = str(error.reason)
            except Exception as error:
                last_error = str(error)

        message = json.dumps({"error": last_error}).encode("utf-8")
        self.send_response(502)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        if not head_only:
            self.wfile.write(message)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", PORT), DashboardHandler)
    print(f"Dashboard rodando em http://localhost:{PORT}")
    server.serve_forever()

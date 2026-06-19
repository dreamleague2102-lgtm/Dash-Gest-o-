import os
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import Request, urlopen


SHEET_ID = os.getenv("SHEET_ID", "18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U")
SHEET_GID = os.getenv("SHEET_GID", "433514608")
PORT = int(os.getenv("PORT", "8000"))


def sheet_urls():
    return [
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid={SHEET_GID}",
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}",
    ]


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

        for url in sheet_urls():
            try:
                request = Request(url, headers={"User-Agent": "Dash-Gestao/1.0"})
                with urlopen(request, timeout=20) as response:
                    csv = response.read()

                if csv.strip().startswith(b"<") or b"ServiceLogin" in csv:
                    last_error = "A planilha nao esta publica ou nao retornou CSV."
                    continue

                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.end_headers()
                if not head_only:
                    self.wfile.write(csv)
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

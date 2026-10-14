"""Abre o front-end no navegador servindo a pasta do projeto em http://localhost:8000."""

import http.server
import threading
import webbrowser
from functools import partial
from pathlib import Path

PORTA = 8000
PASTA = Path(__file__).parent

handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(PASTA))
servidor = http.server.ThreadingHTTPServer(("localhost", PORTA), handler)

url = f"http://localhost:{PORTA}/web/"
print(f"Front-end em {url}  (Ctrl+C para encerrar)")
threading.Timer(0.8, webbrowser.open, args=[url]).start()
try:
    servidor.serve_forever()
except KeyboardInterrupt:
    print("\nServidor encerrado.")

#!/usr/bin/env python3

from __future__ import annotations

import argparse
import http.server
import os
import socket
import sys
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENTRY_FILE = "cambridge-a1-b2-review.html"
DEFAULT_PORTS = [4211, 4212, 8000, 8080]


class PortableHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def pick_port(preferred_port: int | None) -> int:
    candidates = [preferred_port] if preferred_port else DEFAULT_PORTS
    for port in candidates:
        if port is None:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("No free local port was found.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the portable Cambridge A1-B2 review bundle locally.")
    parser.add_argument("--port", type=int, default=None, help="Preferred local port, for example 4211.")
    parser.add_argument("--no-open", action="store_true", help="Do not auto-open the browser.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(ROOT)

    if not (ROOT / ENTRY_FILE).exists():
        print(f"Missing required file: {ENTRY_FILE}", file=sys.stderr)
        return 1

    try:
        port = pick_port(args.port)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    url = f"http://127.0.0.1:{port}/{ENTRY_FILE}"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), PortableHandler)

    print("Cambridge A1-B2 portable review server")
    print(f"Folder: {ROOT}")
    print(f"URL:    {url}")
    print("Press Ctrl+C to stop the server.")
    print()

    if not args.no_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

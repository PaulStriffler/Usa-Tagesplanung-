#!/usr/bin/env python3
"""Statischer Server fuer die USA-Reise PWA (ES-Module brauchen http://)."""
import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def guess_type(self, path):
        if path.endswith('.webmanifest'):
            return 'application/manifest+json'
        return super().guess_type(path)

with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'USA-Reise auf http://localhost:{PORT}')
    httpd.serve_forever()

"""Private single-player development server. See docs/DEPLOYMENT.md before exposing it."""
import argparse
import copy
import json
import os
import secrets
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from .game import act, tick, RuleError, POIS, ITEMS, RECIPES
from .storage import Store
from .worldmap import WORLD_MAP

ROOT = Path(__file__).resolve().parent.parent


class Runtime:
    def __init__(self, path):
        self.store = Store(path)
        self.world = self.store.load()
        self.lock = threading.Lock()
        self.session = None
        self.last_seen = 0
        self.last_command = 0

    def authorize(self, token):
        now = time.monotonic()
        if self.session != token and now - self.last_seen < 4:
            raise RuleError('다른 브라우저가 플레이 중입니다. 이 프로토타입은 1인 전용입니다.')
        self.session, self.last_seen = token, now

    def snapshot(self):
        return {'world': self.world, 'pois': POIS, 'items': ITEMS, 'map': WORLD_MAP, 'recipes': RECIPES}


def make_handler(runtime, access_key):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log access credentials or action bodies.

        def send(self, status, payload, content_type='application/json; charset=utf-8'):
            body = json.dumps(payload, ensure_ascii=False).encode() if isinstance(payload, dict) else payload
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def allowed(self):
            supplied = self.headers.get('X-Access-Key', '')
            if not secrets.compare_digest(supplied, access_key):
                self.send(401, {'error': '접속 키가 필요합니다. 서버 콘솔의 링크를 사용하세요.'})
                return False
            token = self.headers.get('X-Session-ID', '')
            if len(token) < 16 or len(token) > 100:
                self.send(400, {'error': '세션 ID 오류'})
                return False
            return True

        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/api/state':
                if not self.allowed():
                    return
                with runtime.lock:
                    try:
                        runtime.authorize(self.headers['X-Session-ID'])
                        self.send(200, runtime.snapshot())
                    except RuleError as e:
                        self.send(409, {'error': str(e)})
                return
            files = {'/': ('index.html','text/html; charset=utf-8'),
                     '/app.js': ('app.js','text/javascript; charset=utf-8'),
                     '/world.js': ('world.js','text/javascript; charset=utf-8'),
                     '/style.css': ('style.css','text/css; charset=utf-8')}
            if path not in files:
                self.send(404, {'error': 'Not found'})
                return
            name, mime = files[path]
            self.send(200, (ROOT/'public'/name).read_bytes(), mime)

        def do_POST(self):
            if urlparse(self.path).path != '/api/action':
                self.send(404, {'error': 'Not found'})
                return
            if not self.allowed():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValueError('크기 오류')
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict) or not isinstance(body.get('command'), dict):
                    raise ValueError('명령 형식 오류')
            except (ValueError, UnicodeError):
                self.send(400, {'error': '잘못된 요청'})
                return
            with runtime.lock:
                try:
                    runtime.authorize(self.headers['X-Session-ID'])
                    if time.monotonic() - runtime.last_command < .06:
                        self.send(429, {'error': '입력이 너무 빠릅니다.'})
                        return
                    if body.get('revision') != runtime.world['revision']:
                        self.send(409, {'error': '상태가 변경됐습니다. 새 상태에서 다시 시도하세요.'})
                        return
                    candidate = copy.deepcopy(runtime.world)
                    act(candidate, body['command'])
                    candidate['revision'] += 1
                    runtime.store.save(candidate)
                    runtime.world = candidate
                    runtime.last_command = time.monotonic()
                    self.send(200, runtime.snapshot())
                except RuleError as e:
                    self.send(400, {'error': str(e)})
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--open-browser', action='store_true', help='Open the local play link in your browser')
    parser.add_argument('--port', default=8080, type=int)
    parser.add_argument('--data', default=str(ROOT/'data'/'world.sqlite3'))
    args = parser.parse_args()
    key_path = Path(args.data).parent/'access.key'
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = os.environ.get('BLOODFALL_ACCESS_KEY')
    if not key:
        if key_path.exists():
            key = key_path.read_text().strip()
        else:
            key = secrets.token_urlsafe(32)
            key_path.write_text(key)
            try:
                key_path.chmod(0o600)
            except OSError:
                pass
    if len(key) < 24:
        raise SystemExit('BLOODFALL_ACCESS_KEY must contain at least 24 characters.')
    runtime = Runtime(args.data)
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(runtime, key))
    httpd.daemon_threads = True
    stop = threading.Event()

    def loop():
        previous = time.monotonic()
        saved = previous
        while not stop.wait(.1):
            now = time.monotonic()
            with runtime.lock:
                if now - runtime.last_seen < 1.2:
                    tick(runtime.world, now - previous)
                if now - saved >= 2:
                    runtime.store.save(runtime.world)
                    saved = now
            previous = now
    worker = threading.Thread(target=loop, daemon=True)
    worker.start()
    print(f'BLOODFALL prototype — http://127.0.0.1:{args.port}/#key={key}', flush=True)
    print('Private single-player prototype. Ctrl+C saves and stops. Do not publish this key.', flush=True)
    if args.open_browser:
        webbrowser.open(f'http://127.0.0.1:{args.port}/#key={key}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        stop.set()
        worker.join()
        with runtime.lock:
            runtime.store.save(runtime.world)
            runtime.store.close()


if __name__ == '__main__':
    main()

import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from server.main import Runtime, make_handler


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.runtime = Runtime(Path(self.tmp.name)/'save.sqlite3')
        self.key = 'a-test-key-with-more-than-24-characters'
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.runtime, self.key))
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.httpd.server_port}'

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.thread.join()
        self.runtime.store.close(); self.tmp.cleanup()

    def request(self, path, payload=None, session='first-test-session', key=None):
        headers = {'X-Access-Key': key or self.key, 'X-Session-ID': session, 'Content-Type': 'application/json'}
        req = urllib.request.Request(self.url+path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_auth_static_allowlist_and_second_client(self):
        self.assertEqual(self.request('/api/state', key='wrong')[0], 401)
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/../data/access.key')[0], 404)
        self.assertEqual(self.request('/api/state')[0], 200)
        self.assertEqual(self.request('/api/state', session='second-test-session')[0], 409)

    def test_action_persists_and_replay_rejected(self):
        payload = {'revision': 0, 'command': {'action':'choose', 'species':'vampire'}}
        self.assertEqual(self.request('/api/action', payload)[0], 200)
        self.assertEqual(self.runtime.store.load()['player']['species'], 'vampire')
        self.runtime.last_command = 0
        self.assertEqual(self.request('/api/action', payload)[0], 409)

    def test_failed_purchase_preserves_save(self):
        self.runtime.world['player']['chosen'] = True
        self.runtime.world['inventory']['wood'] = 0
        self.runtime.store.save(self.runtime.world)
        before = self.runtime.store.load()
        payload = {'revision':0, 'command': {'action':'build', 'facility':'kitchen'}}
        self.assertEqual(self.request('/api/action', payload)[0], 400)
        self.assertEqual(before, self.runtime.store.load())

    def test_bad_action_shape(self):
        self.assertEqual(self.request('/api/action', {'command': []})[0], 400)


if __name__ == '__main__':
    unittest.main()

"""Launch the real server, play via HTTP, restart, and recover the same world."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent


class ProcessTest(unittest.TestCase):
    def test_restart_preserves_species_base_and_inventory(self):
        with tempfile.TemporaryDirectory() as d:
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            key = 'integration-key-for-private-test-only-123456'
            env = dict(os.environ, BLOODFALL_ACCESS_KEY=key)
            url = f'http://127.0.0.1:{port}'
            process = None

            def start():
                nonlocal process
                process = subprocess.Popen([sys.executable, '-m', 'server.main', '--port', str(port), '--data', str(Path(d)/'world.sqlite3')], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                for _ in range(100):
                    if process.poll() is not None:
                        raise AssertionError(process.stderr.read().decode())
                    try:
                        return request()
                    except (OSError, urllib.error.URLError):
                        time.sleep(.05)
                raise AssertionError('Server did not start')

            def request(command=None):
                path = '/api/action' if command else '/api/state'
                data = json.dumps(command).encode() if command else None
                headers = {'X-Access-Key':key, 'X-Session-ID':'integration-client-session', 'Content-Type':'application/json'}
                with urllib.request.urlopen(urllib.request.Request(url+path, data=data, headers=headers), timeout=3) as response:
                    return json.load(response)['world']

            def stop():
                if process and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
                if process and process.stderr:
                    process.stderr.close()

            try:
                w = start()
                for action in [
                    {'action':'choose','species':'human'},
                    *([{'action':'move','dx':1,'dy':1}]*22),
                    {'action':'build','facility':'kitchen'},
                    {'action':'craft','recipe':'soup'},
                    {'action':'build','facility':'medical'},
                    {'action':'convert'},
                    {'action':'build','facility':'alchemy'},
                    {'action':'craft','recipe':'elixir'},
                    {'action':'consume','item':'elixir'},
                    {'action':'convert'},
                    {'action':'enhance'},
                    {'action':'relocate'},
                    {'action':'pause'},
                ]:
                    time.sleep(.13)
                    try:
                        w = request({'revision':w['revision'], 'command':action})
                    except urllib.error.HTTPError as error:
                        self.fail(f'{action}: {error.read().decode()}')
                saved = w
                stop()
                restored = start()
                self.assertEqual(saved['inventory'], restored['inventory'])
                self.assertEqual(saved['base'], restored['base'])
                self.assertEqual(saved['player'], restored['player'])
                self.assertEqual(saved['revision'], restored['revision'])
                self.assertTrue(restored['paused'])
            finally:
                stop()


if __name__ == '__main__':
    unittest.main()

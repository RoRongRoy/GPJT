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
        self.assertEqual(self.request('/world.js')[0], 200)
        for name in ('mounts', 'salvage', 'skill-fx'):
            code, body=self.request('/art/gameplay/'+name+'.png')
            self.assertEqual(code,200)
            self.assertTrue(body.startswith(bytes([137,80,78,71])))
        self.assertEqual(self.request('/socket.io/socket.io.js')[0], 200)
        self.assertEqual(self.request('/../data/access.key')[0], 404)
        status, body = self.request('/api/state')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['map']['size'], 544)
        self.assertEqual(json.loads(body)['map']['base_radius'], 7)
        self.assertEqual(json.loads(body)['recipes']['soup']['facility'], 'kitchen')
        status2, body2 = self.request('/api/state', session='second-test-session')
        self.assertEqual(status2, 200)
        data2 = json.loads(body2)
        self.assertEqual(data2['online_count'], 2)
        self.assertEqual(len(data2['others']), 1)

    def test_socketio_multiplayer_handshake_and_server_managed_actions(self):
        # Connect Player 1 and Player 2 via Socket.IO (Engine.IO v4 polling transport)
        s1_status, s1_raw = self.request('/socket.io/?EIO=4&transport=polling', session='player-one-session')
        self.assertEqual(s1_status, 200)
        s1_packets = s1_raw.decode('utf-8').split('\x1e')
        self.assertTrue(s1_packets[0].startswith('0{'))
        sid1 = json.loads(s1_packets[0][1:])['sid']

        s2_status, s2_raw = self.request('/socket.io/?EIO=4&transport=polling', session='player-two-session')
        self.assertEqual(s2_status, 200)
        sid2 = json.loads(s2_raw.decode('utf-8').split('\x1e')[0][1:])['sid']

        # Send Socket.IO action event from Player 2 to choose vampire
        sio_packet = '421' + json.dumps(['action', {'command': {'action': 'choose', 'species': 'vampire'}}])
        post_req = urllib.request.Request(
            f'{self.url}/socket.io/?EIO=4&transport=polling&sid={sid2}',
            data=sio_packet.encode('utf-8'),
            headers={'X-Access-Key': self.key, 'X-Session-ID': 'player-two-session', 'Content-Type': 'text/plain;charset=UTF-8'},
        )
        with urllib.request.urlopen(post_req) as r:
            self.assertEqual(r.status, 200)

        # Poll Player 2 ack and verify server-managed species is vampire while Player 1 remains unchosen human
        _, poll2_raw = self.request(f'/socket.io/?EIO=4&transport=polling&sid={sid2}', session='player-two-session')
        self.assertIn('vampire', poll2_raw.decode('utf-8'))
        _, state1_raw = self.request('/api/state', session='player-one-session')
        state1 = json.loads(state1_raw)
        self.assertEqual(state1['world']['player']['species'], 'human')
        self.assertTrue(any(o['species'] == 'vampire' and o['chosen'] for o in state1['others']))

    def test_original_art_assets_are_served_without_opening_directory_access(self):
        for name in ['nightfall-city', 'human-warden', 'vampire-scholar', 'human-male-warden', 'vampire-female-scholar']:
            with self.subTest(name=name):
                status, body = self.request('/art/'+name+'.png')
                self.assertEqual(status, 200)
                self.assertTrue(body.startswith(bytes.fromhex('89504e470d0a1a0a')))
        for name in ('refuge', 'pine', 'dead-tree', 'ruin', 'human', 'vampire', 'ghoul', 'brute', 'props', 'earth', 'stone'):
            with self.subTest(gameplay=name):
                status, body = self.request('/art/gameplay/'+name+'.png')
                self.assertEqual(status, 200)
                self.assertTrue(body.startswith(b'\x89PNG\r\n\x1a\n'))
        for name in ('sprite-manifest', 'sprites'):
            self.assertEqual(self.request('/'+name+'.js')[0], 200)
        self.assertEqual(self.request('/art/gameplay/unknown.png')[0], 404)
        self.assertEqual(self.request('/gothic.js')[0], 200)
        self.assertEqual(self.request('/gothic.css')[0], 200)
        self.assertEqual(self.request('/art/unknown.png')[0], 404)
        self.assertEqual(self.request('/art/../../data/access.key')[0], 404)

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

    def test_all_camp_operations_reject_remote_requests_without_spending(self):
        world = self.runtime.world
        world['player'].update(chosen=True, x=120, y=120)
        world['base']['facilities'].update(kitchen=1, medical=1)
        self.runtime.store.save(world)
        before = self.runtime.store.load()
        for command in [
            {'action': 'craft', 'recipe': 'soup'},
            {'action': 'build', 'facility': 'alchemy'},
            {'action': 'enhance'}, {'action': 'research'},
            {'action': 'convert'}, {'action': 'dispatch'},
        ]:
            with self.subTest(command=command):
                status, _ = self.request('/api/action', {'revision': world['revision'], 'command': command})
                self.assertEqual(status, 400)
                self.assertEqual(self.runtime.store.load(), before)
                self.assertEqual(world, before)

    def test_skill_commit_and_failed_replay_are_atomic(self):
        w=self.runtime.world
        w['player'].update(chosen=True, hp=50)
        self.runtime.store.save(w)
        payload={'revision':0, 'command':{'action':'skill','skill':'recover'}}
        self.assertEqual(self.request('/api/action',payload)[0],200)
        saved=self.runtime.store.load()
        self.assertEqual(saved['player']['hp'],68)
        self.assertEqual(saved['player']['food'],82)
        self.runtime.last_command=0
        payload['revision']=saved['revision']
        self.assertEqual(self.request('/api/action',payload)[0],400)
        self.assertEqual(self.runtime.store.load(),saved)
        self.assertEqual(self.runtime.world,saved)
        status,body=self.request('/api/state')
        self.assertEqual(json.loads(body)['combat']['sweep']['cooldown'],5)
        for item in ('wood','water','crop','herb','blood','metal','scroll','soup','elixir','medicine'):
            self.assertEqual(self.request('/icons/'+item+'.svg')[0],200)
        self.assertEqual(self.request('/icons/unknown.svg')[0],404)
        self.assertEqual(self.request('/combat.js')[0],200)

    def test_bad_action_shape(self):
        self.assertEqual(self.request('/api/action', {'command': []})[0], 400)

    def test_equipment_is_owned_atomic_and_persisted(self):
        from server.equipment import roll_equipment
        w = self.runtime.world
        w['player']['chosen'] = True
        item = roll_equipment(w, w['enemies'][0], lambda: .001)
        self.runtime.store.save(w)
        payload = {'revision': 0, 'command': {'action': 'equip', 'item': item['id']}}
        status, _ = self.request('/api/action', payload)
        self.assertEqual(status, 200)
        saved = self.runtime.store.load()
        self.assertEqual(saved['equipment']['weapon'], item['id'])
        self.runtime.last_command = 0
        self.assertEqual(self.request('/api/action', payload)[0], 409)
        self.runtime.last_command = 0
        invalid = {'revision': 1, 'command': {'action': 'equip', 'item': 'gear:999', 'power': 9999}}
        self.assertEqual(self.request('/api/action', invalid)[0], 400)
        self.assertEqual(self.runtime.store.load(), saved)
        for slot in ('weapon', 'armor'):
            self.assertEqual(self.request('/icons/'+slot+'.svg')[0], 200)

    def test_new_adventurer_account_save_and_load(self):
        self.assertEqual(self.request('/api/action', {'revision': 0, 'command': {'action': 'choose', 'species': 'human'}})[0], 200)
        self.runtime.last_command = 0
        self.runtime.world['player'].update(x=self.runtime.world['base']['x'], y=self.runtime.world['base']['y'])
        self.assertEqual(self.request('/api/action', {'revision': 1, 'command': {'action': 'build', 'facility': 'kitchen'}})[0], 200)
        self.runtime.last_command = 0
        status, body = self.request('/api/action', {
            'revision': 2,
            'command': {'action': 'account_save', 'username': 'adventurer01', 'password': 'secret123'},
        })
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['world']['player']['account'], 'adventurer01')
        self.runtime.last_command = 0
        status, body = self.request('/api/action', {
            'revision': 3,
            'command': {'action': 'choose', 'species': 'vampire'},
        })
        self.assertEqual(status, 200)
        reset_world = json.loads(body)['world']
        self.assertEqual(reset_world['player']['species'], 'vampire')
        self.assertIsNone(reset_world['player'].get('account'))
        self.runtime.last_command = 0
        self.assertEqual(self.request('/api/action', {
            'revision': 4,
            'command': {'action': 'account_load', 'username': 'adventurer01', 'password': 'wrong'},
        })[0], 400)
        self.runtime.last_command = 0
        status, body = self.request('/api/action', {
            'revision': 4,
            'command': {'action': 'account_load', 'username': 'adventurer01', 'password': 'secret123'},
        })
        self.assertEqual(status, 200)
        loaded_world = json.loads(body)['world']
        self.assertEqual(loaded_world['player']['species'], 'human')
        self.assertEqual(loaded_world['player']['account'], 'adventurer01')


if __name__ == '__main__':
    unittest.main()

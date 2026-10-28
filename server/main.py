"""Server-authoritative multiplayer development server with Socket.IO support."""
import argparse
import copy
import json
import os
import secrets
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

if __name__ == '__main__' and not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = 'server'

from .game import act, tick, new_world, ensure_starter_gear, RuleError, POIS, ITEMS, RECIPES, COMBAT, JOB_SKILLS, CLASSES, GENDERS, live_pois, RARITIES, FACILITIES
from .socketio_server import SocketIOHub
from .storage import Store
from .worldmap import WORLD_MAP, BASE_SPAWN_SITES, START_BASE
from .movement import MovementInputs

ROOT = Path(__file__).resolve().parent.parent
PROFILE_KEYS = ('player', 'inventory', 'gear', 'equipment', 'cooldowns', 'quest', 'milestones', 'dispatch', 'base', 'log')


class Runtime:
    def __init__(self, path):
        self.store = Store(path)
        self.world = self.store.load()
        if self.world['player'].get('chosen') and ensure_starter_gear(self.world):
            self.store.save(self.world)
        self.world['player'].setdefault('learned_skills', ['sweep', 'recover'])
        self.world.setdefault('inventory', {}).setdefault('skillbook', 0)
        self.peers = self.store.load_peers()
        for sess_tok, peer_prof in self.peers.items():
            missing_log = 'log' not in peer_prof
            peer_prof.setdefault('log', [])
            peer_prof.get('player', {}).setdefault('learned_skills', ['sweep', 'recover'])
            peer_prof.setdefault('inventory', {}).setdefault('skillbook', 0)
            gear_changed = peer_prof.get('player', {}).get('chosen') and ensure_starter_gear(peer_prof)
            if missing_log or gear_changed:
                self.store.save_peer(sess_tok, peer_prof)
        self.lock = threading.Lock()
        self.session = None
        self.last_seen = 0
        self.last_command = 0
        self.movement = MovementInputs()
        self.sessions = {}
        self.next_player_index = 1

    def _new_peer_profile(self, index):
        fresh = new_world()
        site = BASE_SPAWN_SITES[(index - 1) % len(BASE_SPAWN_SITES)]
        fresh['base'] = {'x': None, 'y': None, 'established': False, 'facilities': dict.fromkeys(FACILITIES, 0)}
        fresh['player']['x'] = float(site[0])
        fresh['player']['y'] = float(site[1] + 1)
        return {k: copy.deepcopy(fresh[k]) for k in PROFILE_KEYS}

    def authorize(self, token):
        now = time.monotonic()
        if self.session is None:
            self.session = token
        if token not in self.sessions:
            idx = self.next_player_index
            self.next_player_index += 1
            self.sessions[token] = {'last_seen': now, 'last_command': 0.0, 'index': idx}
        else:
            self.sessions[token]['last_seen'] = now
        if token != self.session and token not in self.peers:
            profile = self._new_peer_profile(self.sessions[token]['index'])
            self.peers[token] = profile
            self.store.save_peer(token, profile)
        self.last_seen = now

    def _profile_for(self, token):
        if not token or token == self.session:
            return self.world
        return self.peers.get(token, self.world)

    def active_peer_profiles(self):
        now = time.monotonic()
        return [
            self.peers[tok]
            for tok, info in self.sessions.items()
            if tok != self.session and tok in self.peers and now - info['last_seen'] < 30
        ]

    def _handle_account_action(self, candidate, command, is_peer, sess_info=None):
        action = command.get('action')
        if action == 'account_save':
            if not candidate['player'].get('chosen'):
                raise RuleError('먼저 캐릭터(종족)를 선택해 모험을 시작한 뒤 계정을 저장하세요.')
            username = str(command.get('username') or '').strip()
            password = str(command.get('password') or '').strip()
            if len(username) < 2 or len(username) > 20:
                raise RuleError('계정 아이디는 2~20자로 입력하세요.')
            current_acc = candidate['player'].get('account')
            if not (current_acc == username and not password) and (len(password) < 1 or len(password) > 40):
                raise RuleError('비밀번호는 4~40자로 입력하세요.')
            candidate['player']['account'] = username
            account_prof = {k: copy.deepcopy(candidate[k]) for k in (*PROFILE_KEYS, 'next_gear_id') if k in candidate}
            if not self.store.save_account(username, password, account_prof, current_account=current_acc):
                raise RuleError('이미 등록된 계정 아이디이거나 비밀번호가 일치하지 않습니다.')
            candidate['log'] = [f"계정 '{username}'에 모험 데이터가 안전하게 저장되었습니다."] + candidate['log'][:7]
            return True
        if action == 'account_load':
            username = str(command.get('username') or '').strip()
            password = str(command.get('password') or '').strip()
            if not username or not password:
                raise RuleError('불러올 계정 아이디와 비밀번호를 모두 입력하세요.')
            saved_prof = self.store.load_account(username, password)
            if not saved_prof:
                backup_prof = command.get('backup_profile')
                if backup_prof and isinstance(backup_prof, dict) and backup_prof.get('player', {}).get('chosen'):
                    self.store.save_account(username, password, backup_prof)
                    saved_prof = self.store.load_account(username, password)
                if not saved_prof:
                    raise RuleError('계정 아이디 또는 비밀번호가 일치하지 않습니다.')
            candidate['log'] = []  # Old accounts have no personal history to restore.
            for k in PROFILE_KEYS:
                if k in saved_prof:
                    candidate[k] = copy.deepcopy(saved_prof[k])
            if 'next_gear_id' in saved_prof:
                candidate['next_gear_id'] = max(candidate.get('next_gear_id', 1), saved_prof['next_gear_id'])
            if 'base' in saved_prof:
                candidate['base'] = copy.deepcopy(saved_prof['base'])
                candidate['base'].setdefault('facilities', dict.fromkeys(FACILITIES, 0))
            candidate['player']['chosen'] = True
            candidate['player']['account'] = username
            candidate['player'].setdefault('mp', 100.0)
            candidate['player'].setdefault('gender', 'male')
            candidate['player'].setdefault('job', 'warrior')
            candidate['player'].setdefault('learned_skills', ['sweep', 'recover'])
            candidate.setdefault('inventory', {}).setdefault('skillbook', 0)
            ensure_starter_gear(candidate)
            candidate['cooldowns'] = {
                ck: cv for ck, cv in candidate.get('cooldowns', {}).items() if cv <= candidate['elapsed'] + 60
            }
            lvl = candidate['player'].get('combat_level', 1)
            candidate['log'] = [f"계정 '{username}' (Lv.{lvl}) 모험 데이터를 불러왔습니다."] + candidate['log'][:7]
            return True
        if action in ('restore_local_save', 'account_restore'):
            backup_prof = command.get('profile')
            if not backup_prof or not isinstance(backup_prof, dict) or not backup_prof.get('player', {}).get('chosen'):
                raise RuleError('복원할 저장 데이터가 올바르지 않습니다.')
            for k in PROFILE_KEYS:
                if k in backup_prof:
                    candidate[k] = copy.deepcopy(backup_prof[k])
            if 'next_gear_id' in backup_prof:
                candidate['next_gear_id'] = max(candidate.get('next_gear_id', 1), backup_prof['next_gear_id'])
            if 'base' in backup_prof:
                candidate['base'] = copy.deepcopy(backup_prof['base'])
                candidate['base'].setdefault('facilities', dict.fromkeys(FACILITIES, 0))
            candidate['player']['chosen'] = True
            ensure_starter_gear(candidate)
            lvl = candidate['player'].get('combat_level', 1)
            acc_name = candidate['player'].get('account') or '로컬 백업'
            candidate['log'] = [f"{acc_name} (Lv.{lvl}) 모험 데이터를 복원했습니다."] + candidate['log'][:7]
            return True
        if action == 'new_adventurer':
            fresh = new_world()
            site = BASE_SPAWN_SITES[(sess_info['index'] - 1) % len(BASE_SPAWN_SITES)] if (is_peer and sess_info) else START_BASE
            fresh['base'] = {'x': None, 'y': None, 'established': False, 'facilities': dict.fromkeys(FACILITIES, 0)}
            fresh['player']['x'] = float(site[0])
            fresh['player']['y'] = float(site[1] + 1)
            for k in PROFILE_KEYS:
                candidate[k] = copy.deepcopy(fresh[k])
            species = command.get('species')
            if species in ('human', 'vampire'):
                act(candidate, {
                    'action': 'choose',
                    'species': species,
                    'gender': command.get('gender', 'male'),
                    'job': command.get('job', 'warrior'),
                })
            candidate['log'] = ['신규 모험자로 새로운 여정을 시작합니다. 언제든 계정을 생성해 저장할 수 있습니다.'] + candidate['log'][:7]
            return True
        return False

    def receive_input(self, token, payload):
        with self.lock:
            try:
                self.authorize(token)
                return 200, self.movement.receive(self.world, self._profile_for(token), token, payload, time.monotonic())
            except RuleError as e:
                return 400, {'error': str(e)}

    def advance_inputs(self, now):
        for token in self.movement.inputs:
            self.movement.advance(self.world, self._profile_for(token), token, now)

    def execute_action(self, token, command, expected_revision=None):
        with self.lock:
            try:
                self.authorize(token)
                now = time.monotonic()
                sess_info = self.sessions[token]
                last_cmd = self.last_command if token == self.session else sess_info['last_command']
                is_move_cmd = isinstance(command, dict) and command.get('action') == 'move'
                min_gap = .028 if is_move_cmd else .055
                if last_cmd > 0 and now - last_cmd < min_gap:
                    return 429, {'error': '입력이 너무 빠릅니다.'}
                is_account_cmd = isinstance(command, dict) and command.get('action') in ('account_save', 'account_load', 'restore_local_save', 'account_restore', 'new_adventurer')
                if not is_move_cmd and not is_account_cmd and expected_revision is not None and expected_revision != self.world['revision']:
                    return 409, {'error': '상태가 변경됐습니다. 새 상태에서 다시 시도하세요.'}
                if not isinstance(command, dict):
                    raise RuleError('명령 형식 오류')
                input_seq = command.get('input_seq')
                if input_seq is not None and (type(input_seq) is not int or not 0 <= input_seq < 2**53):
                    raise RuleError('이동 순서 오류')
                self.movement.advance(self.world, self._profile_for(token), token, now)
                self.movement.stop(token, input_seq)
                if command.get('action') == 'move':
                    self.movement.check_step(token, now)
                candidate = copy.deepcopy(self.world)
                is_peer = (token != self.session)
                if is_peer:
                    peer_prof = copy.deepcopy(self.peers[token])
                    for k in PROFILE_KEYS:
                        candidate[k] = peer_prof[k]
                if not self._handle_account_action(candidate, command, is_peer, sess_info):
                    act(candidate, command)
                if command.get('action') == 'move':
                    self.movement.block_after_step(token, now)
                acc_name = candidate['player'].get('account')
                is_fast_move = isinstance(command, dict) and command.get('action') == 'move'
                if acc_name and not is_fast_move:
                    self.store.sync_account(
                        acc_name,
                        {k: copy.deepcopy(candidate[k]) for k in (*PROFILE_KEYS, 'next_gear_id') if k in candidate},
                    )
                candidate['revision'] += 1
                if is_peer:
                    updated_peer = {k: candidate[k] for k in PROFILE_KEYS}
                    for k in PROFILE_KEYS:
                        candidate[k] = self.world[k]
                    if not is_fast_move:
                        self.store.save(candidate)
                        self.store.save_peer(token, updated_peer)
                    self.world = candidate
                    self.peers[token] = updated_peer
                else:
                    if not is_fast_move:
                        self.store.save(candidate)
                    self.world = candidate
                    self.last_command = now
                if self.world['paused']:
                    for moving_token in self.movement.inputs:
                        self.movement.stop(moving_token)
                sess_info['last_command'] = now
                return 200, self.snapshot(token)
            except RuleError as e:
                return 400, {'error': str(e)}

    def snapshot(self, token=None):
        now = time.monotonic()
        active_token = token or self.session
        if active_token and active_token != self.session and active_token in self.peers:
            world_view = dict(self.world)
            for k in PROFILE_KEYS:
                world_view[k] = self.peers[active_token][k]
        else:
            world_view = self.world
        others = []
        other_bases = []
        online_count = 0
        for tok, info in self.sessions.items():
            if now - info['last_seen'] >= 30:
                continue
            online_count += 1
            if tok == active_token:
                continue
            prof = self._profile_for(tok)
            p = prof['player']
            acc = p.get('account') or f"생존자 #{info['index']}"
            if 'base' in prof and p.get('chosen') and prof['base'].get('established') and prof['base'].get('x') is not None:
                b = prof['base']
                other_bases.append({
                    'id': tok[:8],
                    'name': f"{acc}의 아지트",
                    'x': b['x'],
                    'y': b['y'],
                    'facilities': b.get('facilities', {}),
                })
            others.append({
                'id': tok[:8],
                'name': acc,
                'x': p['x'],
                'y': p['y'],
                'species': p['species'],
                'gender': p.get('gender', 'male'),
                'job': p.get('job', 'warrior'),
                'chosen': p['chosen'],
                'hp': p['hp'],
                'combat_level': p.get('combat_level', 1),
                'mounted': p.get('mounted', False),
                'unlocks': p.get('unlocks', {'human': 0, 'vampire': 0}),
            })
        return {
            'world': world_view,
            'snapshot_time': time.time(),
            'movement': self.movement.snapshot(active_token, now),
            'others': others,
            'other_bases': other_bases,
            'online_count': max(1, online_count),
            'pois': live_pois(self.world),
            'items': ITEMS,
            'map': WORLD_MAP,
            'recipes': RECIPES,
            'combat': COMBAT,
            'job_skills': {f'{sp}_{jb}': specs for (sp, jb), specs in JOB_SKILLS.items()},
            'classes': CLASSES,
            'genders': GENDERS,
            'rarities': RARITIES,
        }


def make_handler(runtime, access_key, sio=None):
    hub = sio or SocketIOHub(runtime, access_key)
    runtime.sio = hub

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
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def allowed(self):
            supplied = self.headers.get('X-Access-Key', '')
            if supplied and not secrets.compare_digest(supplied, access_key):
                self.send(401, {'error': '접속 키가 필요합니다. 서버 콘솔의 링크를 사용하세요.'})
                return False
            token = self.headers.get('X-Session-ID', '')
            if len(token) < 16 or len(token) > 100:
                self.send(400, {'error': '세션 ID 오류'})
                return False
            return True

        def do_GET(self):
            path = urlparse(self.path).path
            if path in ('/socket.io/socket.io.js', '/socket.io.js'):
                self.send(200, (ROOT/'public'/'socket.io.js').read_bytes(), 'text/javascript; charset=utf-8')
                return
            if path.startswith('/socket.io/'):
                if self.headers.get('Upgrade', '').lower() == 'websocket':
                    hub.handle_websocket(self)
                else:
                    hub.handle_http_polling(self, 'GET')
                return
            if path == '/api/state':
                if not self.allowed():
                    return
                session_id = self.headers['X-Session-ID']
                with runtime.lock:
                    try:
                        runtime.authorize(session_id)
                        self.send(200, runtime.snapshot(session_id))
                    except RuleError as e:
                        self.send(409, {'error': str(e)})
                return
            files = {'/': ('index.html', 'text/html; charset=utf-8'),
                     '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                     '/world.js': ('world.js', 'text/javascript; charset=utf-8'),
                     '/gothic.js': ('gothic.js', 'text/javascript; charset=utf-8'),
                     '/gothic.css': ('gothic.css', 'text/css; charset=utf-8'),
                     '/art/nightfall-city.png': ('art/nightfall-city.png', 'image/png'),
                     '/art/human-warden.png': ('art/human-warden.png', 'image/png'),
                     '/art/vampire-scholar.png': ('art/vampire-scholar.png', 'image/png'),
                     '/art/human-male-warden.png': ('art/human-male-warden.png', 'image/png'),
                     '/art/vampire-female-scholar.png': ('art/vampire-female-scholar.png', 'image/png'),
                     '/style.css': ('style.css', 'text/css; charset=utf-8')}
            for name in ('sprite-manifest', 'sprites', 'combat', 'socket.io'):
                files['/'+name+'.js'] = (name+'.js', 'text/javascript; charset=utf-8')
            for name in ('refuge', 'pine', 'dead-tree', 'ruin', 'human', 'human-male', 'vampire', 'vampire-female', 'ghoul', 'brute', 'props', 'earth', 'stone'):
                files['/art/gameplay/'+name+'.png'] = ('art/gameplay/'+name+'.png', 'image/png')
            for item in (*ITEMS, 'weapon', 'armor'):
                files['/icons/'+item+'.svg'] = ('icons/'+item+'.svg', 'image/svg+xml')
            if path not in files:
                self.send(404, {'error': 'Not found'})
                return
            name, mime = files[path]
            self.send(200, (ROOT/'public'/name).read_bytes(), mime)

        def do_POST(self):
            path = urlparse(self.path).path
            if path.startswith('/socket.io/'):
                hub.handle_http_polling(self, 'POST')
                return
            if path not in ('/api/action', '/api/input'):
                self.send(404, {'error': 'Not found'})
                return
            if not self.allowed():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValueError('크기 오류')
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict) or (path == '/api/action' and not isinstance(body.get('command'), dict)):
                    raise ValueError('명령 형식 오류')
            except (ValueError, UnicodeError):
                self.send(400, {'error': '잘못된 요청'})
                return
            session_id = self.headers['X-Session-ID']
            if path == '/api/input':
                status, payload = runtime.receive_input(session_id, body)
                self.send(status, payload)
                return
            status, payload = runtime.execute_action(
                session_id,
                body['command'],
                expected_revision=body.get('revision'),
            )
            self.send(status, payload)
            if status == 200:
                hub.broadcast_state()
    return Handler


def main():
    default_host = os.environ.get('HOST') or ('0.0.0.0' if (os.environ.get('PORT') or os.environ.get('RENDER')) else '127.0.0.1')
    default_port = int(os.environ.get('PORT', '8080'))
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default=default_host)
    parser.add_argument('--open-browser', action='store_true', help='Open the local play link in your browser')
    parser.add_argument('--port', default=default_port, type=int)
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
    hub = SocketIOHub(runtime, key)
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(runtime, key, hub))
    httpd.daemon_threads = True
    stop = threading.Event()

    def loop():
        previous = time.monotonic()
        saved = previous
        last_broadcast = previous
        while not stop.wait(.1):
            now = time.monotonic()
            should_broadcast = False
            with runtime.lock:
                active_sio = hub.active_sessions()
                for sid_tok in active_sio:
                    runtime.authorize(sid_tok)
                if now - runtime.last_seen < 2.5 or active_sio:
                    runtime.advance_inputs(now)
                    tick(runtime.world, now - previous, extra_profiles=runtime.active_peer_profiles())
                    should_broadcast = bool(active_sio) and (now - last_broadcast >= .2)
                if now - saved >= 2:
                    runtime.store.save(runtime.world)
                    for peer_tok, peer_prof in runtime.peers.items():
                        runtime.store.save_peer(peer_tok, peer_prof)
                    saved = now
            if should_broadcast:
                hub.broadcast_state()
                last_broadcast = now
            previous = now
    worker = threading.Thread(target=loop, daemon=True)
    worker.start()
    print(f'BLOODFALL multiplayer — http://127.0.0.1:{args.port}/#key={key}', flush=True)
    print('Socket.IO server-authoritative multiplayer active. Ctrl+C saves and stops.', flush=True)
    if args.open_browser and not os.environ.get('RENDER') and not os.environ.get('PORT'):
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
            for peer_tok, peer_prof in runtime.peers.items():
                runtime.store.save_peer(peer_tok, peer_prof)
            runtime.store.close()


if __name__ == '__main__':
    main()

"""Zero-dependency Engine.IO v4 / Socket.IO v4 server (WebSocket + HTTP long-polling)."""
import base64
import hashlib
import json
import secrets
import struct
import threading
import time
from urllib.parse import parse_qs, urlparse

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
RECORD_SEP = '\x1e'


class SocketClient:
    def __init__(self, sid, session_id='', key=''):
        self.sid = sid
        self.session_id = session_id
        self.key = key
        self.authenticated = False
        self.transport = 'polling'
        self.ws_lock = threading.Lock()
        self.ws_writer = None
        self.queue = []
        self.cond = threading.Condition()
        self.closed = False
        self.last_seen = time.monotonic()

    def enqueue(self, eio_packet):
        with self.cond:
            if self.closed:
                return
            if self.transport == 'websocket' and self.ws_writer:
                try:
                    self.ws_writer(eio_packet)
                    return
                except OSError:
                    self.closed = True
                    return
            self.queue.append(eio_packet)
            self.cond.notify_all()

    def send_sio(self, sio_type, payload_str=''):
        self.enqueue(f'4{sio_type}{payload_str}')

    def emit(self, event, data):
        body = json.dumps([event, data], ensure_ascii=False)
        self.send_sio('2', body)

    def ack(self, ack_id, data):
        body = json.dumps([data], ensure_ascii=False)
        self.send_sio('3', f'{ack_id}{body}')


class SocketIOHub:
    def __init__(self, runtime, access_key):
        self.runtime = runtime
        self.access_key = access_key
        self.clients = {}
        self.lock = threading.Lock()
        self.last_broadcast_at = 0.0

    def valid_key(self, key):
        if not key:
            return True
        return secrets.compare_digest(str(key), self.access_key)

    def create_client(self, session_id='', key=''):
        sid = secrets.token_urlsafe(16)
        client = SocketClient(sid, session_id=session_id, key=key)
        if self.valid_key(key) and 16 <= len(session_id) <= 100:
            client.authenticated = True
        with self.lock:
            self.clients[sid] = client
        return client

    def get_client(self, sid):
        with self.lock:
            return self.clients.get(sid)

    def remove_client(self, sid):
        with self.lock:
            client = self.clients.pop(sid, None)
        if client:
            with client.cond:
                client.closed = True
                client.cond.notify_all()

    def active_sessions(self):
        now = time.monotonic()
        with self.lock:
            return {
                c.session_id
                for c in self.clients.values()
                if not c.closed and c.authenticated and c.session_id and now - c.last_seen < 30
            }

    def broadcast_state(self, exclude_sid=None, throttle=0.0):
        now = time.monotonic()
        with self.lock:
            if throttle > 0 and now - self.last_broadcast_at < throttle:
                return
            self.last_broadcast_at = now
            targets = [c for c in self.clients.values() if not c.closed and c.authenticated and c.sid != exclude_sid]
        for client in targets:
            with self.runtime.lock:
                snap = self.runtime.snapshot(client.session_id)
            client.emit('state', snap)

    def handle_eio_packet(self, client, packet):
        client.last_seen = time.monotonic()
        if not packet:
            return
        kind = packet[0]
        data = packet[1:]
        if kind == '2':  # ping -> pong
            client.enqueue('3' + data)
        elif kind == '3':  # pong
            pass
        elif kind == '1':  # close
            self.remove_client(client.sid)
        elif kind == '5':  # upgrade
            client.transport = 'websocket'
        elif kind == '4':  # Socket.IO message
            self.handle_sio_packet(client, data)

    def handle_sio_packet(self, client, data):
        if not data:
            return
        sio_type = data[0]
        rest = data[1:]
        if sio_type == '0':  # CONNECT
            auth = {}
            if rest.startswith('{'):
                try:
                    auth = json.loads(rest)
                except ValueError:
                    auth = {}
            key = auth.get('key') or client.key
            session_id = auth.get('session') or client.session_id
            if not self.valid_key(key):
                client.send_sio('4', json.dumps({'message': '접속 키가 필요합니다. 서버 콘솔의 링크를 사용하세요.'}, ensure_ascii=False))
                return
            if not isinstance(session_id, str) or not (16 <= len(session_id) <= 100):
                client.send_sio('4', json.dumps({'message': '세션 ID 오류'}, ensure_ascii=False))
                return
            client.key = key
            client.session_id = session_id
            client.authenticated = True
            client.send_sio('0', json.dumps({'sid': client.sid}))
            with self.runtime.lock:
                self.runtime.authorize(session_id)
                snap = self.runtime.snapshot(session_id)
            client.emit('state', snap)
            self.broadcast_state(exclude_sid=client.sid)
        elif sio_type == '1':  # DISCONNECT
            self.remove_client(client.sid)
        elif sio_type == '2':  # EVENT
            ack_id = ''
            idx = 0
            while idx < len(rest) and rest[idx].isdigit():
                ack_id += rest[idx]
                idx += 1
            try:
                arr = json.loads(rest[idx:])
                if not isinstance(arr, list) or not arr:
                    return
            except ValueError:
                return
            event = arr[0]
            payload = arr[1] if len(arr) > 1 else {}
            self.handle_event(client, event, payload, ack_id)

    def handle_event(self, client, event, payload, ack_id=''):
        if not client.authenticated:
            if isinstance(payload, dict) and self.valid_key(payload.get('key', '')) and 16 <= len(str(payload.get('session', ''))) <= 100:
                client.key = payload['key']
                client.session_id = str(payload['session'])
                client.authenticated = True
            else:
                if ack_id:
                    client.ack(ack_id, {'ok': False, 'error': '인증되지 않은 세션입니다.', 'status': 401})
                return
        if event == 'state':
            with self.runtime.lock:
                self.runtime.authorize(client.session_id)
                snap = self.runtime.snapshot(client.session_id)
            if ack_id:
                client.ack(ack_id, {'ok': True, 'state': snap})
            else:
                client.emit('state', snap)
            return
        if event == 'action':
            if not isinstance(payload, dict) or not isinstance(payload.get('command'), dict):
                if ack_id:
                    client.ack(ack_id, {'ok': False, 'error': '잘못된 요청', 'status': 400})
                return
            status, result = self.runtime.execute_action(
                client.session_id,
                payload['command'],
                expected_revision=None,
            )
            if status == 200:
                if ack_id:
                    client.ack(ack_id, {'ok': True, 'state': result})
                else:
                    client.emit('state', result)
                is_move = payload['command'].get('action') == 'move'
                self.broadcast_state(exclude_sid=client.sid, throttle=0.075 if is_move else 0.0)
            else:
                if ack_id:
                    client.ack(ack_id, {'ok': False, 'error': result.get('error', '오류'), 'status': status})
                else:
                    client.emit('action_error', {'error': result.get('error', '오류'), 'status': status})

    def handle_http_polling(self, handler, method):
        parsed = urlparse(handler.path)
        qs = parse_qs(parsed.query)
        sid = qs.get('sid', [''])[0]
        key = qs.get('key', [''])[0] or handler.headers.get('X-Access-Key', '')
        session_id = qs.get('session', [''])[0] or handler.headers.get('X-Session-ID', '')
        if method == 'GET' and not sid:
            client = self.create_client(session_id=session_id, key=key)
            open_payload = json.dumps({
                'sid': client.sid,
                'upgrades': ['websocket'],
                'pingInterval': 25000,
                'pingTimeout': 20000,
                'maxPayload': 1000000,
            })
            packets = ['0' + open_payload]
            if client.authenticated:
                with self.runtime.lock:
                    self.runtime.authorize(client.session_id)
                    snap = self.runtime.snapshot(client.session_id)
                packets.append('40' + json.dumps({'sid': client.sid}))
                packets.append('42' + json.dumps(['state', snap], ensure_ascii=False))
                self.broadcast_state(exclude_sid=client.sid)
            handler.send(200, RECORD_SEP.join(packets).encode('utf-8'), 'text/plain; charset=utf-8')
            return

        client = self.get_client(sid)
        if not client or client.closed:
            handler.send(400, {'error': 'Invalid session'})
            return
        client.last_seen = time.monotonic()

        if method == 'POST':
            try:
                length = int(handler.headers.get('Content-Length', '0'))
                if not (0 < length <= 65536):
                    raise ValueError('Size error')
                raw = handler.rfile.read(length).decode('utf-8')
            except (ValueError, UnicodeError):
                handler.send(400, {'error': 'Bad packet'})
                return
            for packet in raw.split(RECORD_SEP):
                self.handle_eio_packet(client, packet)
            handler.send(200, b'ok', 'text/plain; charset=utf-8')
            return

        if method == 'GET':
            with client.cond:
                if not client.queue and not client.closed:
                    client.cond.wait(timeout=0.8)
                packets = list(client.queue)
                client.queue.clear()
            if not packets:
                packets = ['6']  # noop
            handler.send(200, RECORD_SEP.join(packets).encode('utf-8'), 'text/plain; charset=utf-8')

    def handle_websocket(self, handler):
        parsed = urlparse(handler.path)
        qs = parse_qs(parsed.query)
        sid = qs.get('sid', [''])[0]
        key = qs.get('key', [''])[0] or handler.headers.get('X-Access-Key', '')
        session_id = qs.get('session', [''])[0] or handler.headers.get('X-Session-ID', '')
        ws_key = handler.headers.get('Sec-WebSocket-Key', '').strip()
        if not ws_key:
            handler.send(400, {'error': 'Missing Sec-WebSocket-Key'})
            return

        accept_token = base64.b64encode(hashlib.sha1((ws_key + WS_GUID).encode('ascii')).digest()).decode('ascii')
        handler.send_response(101, 'Switching Protocols')
        handler.send_header('Upgrade', 'websocket')
        handler.send_header('Connection', 'Upgrade')
        handler.send_header('Sec-WebSocket-Accept', accept_token)
        handler.end_headers()

        conn = handler.connection
        conn.settimeout(45.0)
        try:
            import socket as _sock
            conn.setsockopt(_sock.IPPROTO_TCP, _sock.TCP_NODELAY, 1)
        except OSError:
            pass

        is_new = False
        client = self.get_client(sid) if sid else None
        if not client:
            client = self.create_client(session_id=session_id, key=key)
            client.transport = 'websocket'
            is_new = True

        def write_ws_text(text):
            payload = text.encode('utf-8')
            header = bytearray([0x81])
            n = len(payload)
            if n < 126:
                header.append(n)
            elif n < 65536:
                header.append(126)
                header.extend(struct.pack('!H', n))
            else:
                header.append(127)
                header.extend(struct.pack('!Q', n))
            with client.ws_lock:
                conn.sendall(header + payload)

        client.ws_writer = write_ws_text
        stop_ping = threading.Event()

        def ping_loop():
            while not stop_ping.wait(15.0):
                if client.closed:
                    break
                try:
                    write_ws_text('2')
                except OSError:
                    client.closed = True
                    break

        ping_thread = threading.Thread(target=ping_loop, daemon=True)
        ping_thread.start()

        try:
            if is_new:
                open_payload = json.dumps({
                    'sid': client.sid,
                    'upgrades': [],
                    'pingInterval': 15000,
                    'pingTimeout': 30000,
                    'maxPayload': 1000000,
                })
                write_ws_text('0' + open_payload)
                if client.authenticated:
                    with self.runtime.lock:
                        self.runtime.authorize(client.session_id)
                        snap = self.runtime.snapshot(client.session_id)
                    write_ws_text('40' + json.dumps({'sid': client.sid}))
                    write_ws_text('42' + json.dumps(['state', snap], ensure_ascii=False))
                    self.broadcast_state(exclude_sid=client.sid)

            while not client.closed:
                try:
                    frame = _read_ws_frame(conn)
                except TimeoutError:
                    try:
                        write_ws_text('2')
                        continue
                    except OSError:
                        break
                if frame is None:
                    break
                opcode, payload = frame
                if opcode == 0x8:  # close
                    break
                if opcode == 0x9:  # ping
                    with client.ws_lock:
                        conn.sendall(bytes([0x8A, len(payload)]) + payload)
                    continue
                if opcode == 0xA:  # pong
                    client.last_seen = time.monotonic()
                    continue
                if opcode == 0x1:  # text
                    text = payload.decode('utf-8', errors='replace')
                    if text == '2probe':
                        write_ws_text('3probe')
                        continue
                    self.handle_eio_packet(client, text)
        except OSError:
            pass
        finally:
            stop_ping.set()
            self.remove_client(client.sid)
            self.broadcast_state()


def _read_exact(conn, count):
    buf = bytearray()
    while len(buf) < count:
        chunk = conn.recv(count - len(buf))
        if not chunk:
            return None
        buf.extend(chunk)
    return bytes(buf)


def _read_ws_frame(conn):
    head = _read_exact(conn, 2)
    if not head:
        return None
    b1, b2 = head[0], head[1]
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F
    if length == 126:
        ext = _read_exact(conn, 2)
        if not ext:
            return None
        length = struct.unpack('!H', ext)[0]
    elif length == 127:
        ext = _read_exact(conn, 8)
        if not ext:
            return None
        length = struct.unpack('!Q', ext)[0]
    if length > 1000000:
        return None
    mask_key = _read_exact(conn, 4) if masked else b''
    if masked and not mask_key:
        return None
    payload = _read_exact(conn, length) if length else b''
    if payload is None:
        return None
    if masked:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return opcode, payload

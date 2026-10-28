"""Ephemeral direction inputs: speed comes from server time, never packet count."""
from .game import RuleError, move_actor
from .worldmap import MOVEMENT

INPUT_LEASE = .4


class MovementInputs:
    def __init__(self):
        self.inputs = {}

    def advance(self, world, profile, token, now):
        entry = self.inputs.get(token)
        if not entry:
            return
        seconds = max(0, min(now, entry['until']) - max(entry['at'], entry.get('blocked_until', 0)))
        entry['at'] = now
        if not world['paused'] and profile['player'].get('chosen') and (entry['dx'] or entry['dy']):
            move_actor(profile, entry['dx'], entry['dy'], min(seconds, INPUT_LEASE), entry.get('sprint', False))
            if seconds > 0:
                entry['last_motion'] = min(now, entry['until'])

    def receive(self, world, profile, token, payload, now):
        if not isinstance(payload, dict):
            raise RuleError('이동 입력 형식 오류')
        seq, dx, dy = (payload.get(k) for k in ('seq', 'dx', 'dy'))
        sprint = payload.get('sprint', False)
        if type(sprint) is not bool or type(seq) is not int or not 0 < seq < 2**53 or any(type(v) is not int or v not in (-1, 0, 1) for v in (dx, dy)):
            raise RuleError('이동 입력 오류')
        old = self.inputs.get(token)
        if old and seq <= old['seq']:
            return self.snapshot(token, now)
        if (dx or dy) and (world['paused'] or not profile['player'].get('chosen')):
            raise RuleError('플레이 중에만 이동할 수 있습니다.')
        self.advance(world, profile, token, now)
        self.inputs[token] = {'seq': seq, 'dx': dx, 'dy': dy, 'sprint': sprint, 'at': now, 'until': now+INPUT_LEASE,
                              'blocked_until': (old or {}).get('blocked_until', 0),
                              'last_motion': (old or {}).get('last_motion', float('-inf'))}
        return self.snapshot(token, now)

    def stop(self, token, seq=None):
        old = self.inputs.get(token)
        if old and (seq is None or seq >= old['seq']):
            old.update(dx=0, dy=0, until=0)
            if seq is not None:
                old['seq'] = seq
        elif not old and seq:
            self.inputs[token] = {'seq': seq, 'dx': 0, 'dy': 0, 'at': 0, 'until': 0}

    def check_step(self, token, now):
        if now - self.inputs.get(token, {}).get('last_motion', float('-inf')) < MOVEMENT['interval']:
            raise RuleError('잠시 후 다시 이동하세요.')

    def block_after_step(self, token, now):
        entry = self.inputs.setdefault(token, {'seq': 0, 'dx': 0, 'dy': 0, 'at': now, 'until': 0})
        entry['blocked_until'] = now + MOVEMENT['interval']

    def snapshot(self, token, now):
        entry = self.inputs.get(token, {})
        active = now < entry.get('until', 0)
        return {'enabled': True, 'seq': entry.get('seq', 0), 'dx': entry.get('dx', 0) if active else 0,
                'dy': entry.get('dy', 0) if active else 0, 'age': min(INPUT_LEASE, max(0, now-entry.get('at', now))),
                'sprint': entry.get('sprint', False) if active else False, 'lease': INPUT_LEASE}

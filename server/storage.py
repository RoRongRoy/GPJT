"""SQLite snapshot store; each completed action and its resources commit together."""
import hashlib
import hmac
import json
import secrets
import sqlite3
from pathlib import Path
from .game import new_world
from .worldmap import ENEMY_SPAWNS, new_enemy, LAYOUT_VERSION, new_npcs, migrate_profile_layout


def _hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 100_000).hex()


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=NORMAL')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.execute('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS peers (session TEXT PRIMARY KEY, value TEXT NOT NULL)')
        self.db.execute(
            'CREATE TABLE IF NOT EXISTS accounts ('
            'username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, value TEXT NOT NULL)'
        )
        self.db.commit()

    def load(self):
        row = self.db.execute('SELECT value FROM world WHERE id=1').fetchone()
        w = json.loads(row[0]) if row else new_world()
        if w.get('version') != 1:
            raise RuntimeError('Unsupported save version; restore a compatible backup. Do not delete the save.')
        layout = w.get('layout_version', 1)
        if layout not in (1, 2, LAYOUT_VERSION):
            raise RuntimeError('Unsupported map layout; restore a compatible backup.')
        if layout < LAYOUT_VERSION:
            migrate_profile_layout(w, layout)
            for enemy in w['enemies']:
                if layout == 1:
                    enemy['x'], enemy['y'] = ENEMY_SPAWNS[enemy['id']]
                else:
                    enemy['x'] *= 2
                    enemy['y'] *= 2
            for actor in [*w.get('npcs', []), *w.get('drops', [])]:
                for key in ('x', 'y', 'home_x', 'home_y'):
                    if key in actor:
                        actor[key] *= 2
            w['layout_version'] = LAYOUT_VERSION
        # Add expansion encounters without resetting existing enemies or player assets.
        existing = {enemy['id'] for enemy in w['enemies']}
        w['enemies'].extend(new_enemy(i) for i in range(len(ENEMY_SPAWNS)) if i not in existing)
        if w.get('encounter_version', 0) not in (0, 1):
            raise RuntimeError('Unsupported encounter version; restore a compatible backup.')
        if not w.get('encounter_version'):
            # Preserve HP and timers; new maximums apply when wounded enemies respawn.
            for enemy in w['enemies']:
                for key, value in new_enemy(enemy['id']).items():
                    enemy.setdefault(key, value)
            w['player'].setdefault('combat_level', 1)
            w['player'].setdefault('xp', 0)
            w['player'].setdefault('mp', 100.0)
            w.setdefault('gear', [])
            w.setdefault('equipment', {'weapon': None, 'armor': None})
            w.setdefault('next_gear_id', 1)
            w.setdefault('npcs', new_npcs())
            w['encounter_version'] = 1
        w['player'].setdefault('mp', 100.0)
        return w

    def save(self, world):
        with self.db:
            self.db.execute('INSERT INTO world VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
                            (json.dumps(world, ensure_ascii=False),))

    def load_peers(self):
        rows = self.db.execute('SELECT session, value FROM peers').fetchall()
        return {session: migrate_profile_layout(json.loads(val)) for session, val in rows}

    def save_peer(self, session, profile):
        with self.db:
            self.db.execute('INSERT INTO peers VALUES(?,?) ON CONFLICT(session) DO UPDATE SET value=excluded.value',
                            (session, json.dumps(profile, ensure_ascii=False)))

    def save_account(self, username, password, profile, current_account=None):
        row = self.db.execute('SELECT salt, password_hash FROM accounts WHERE username=?', (username,)).fetchone()
        payload = json.dumps(profile, ensure_ascii=False)
        if row:
            salt, stored_hash = row
            if not (current_account == username and not password):
                if not password or not hmac.compare_digest(_hash_password(password, salt), stored_hash):
                    return False
            with self.db:
                self.db.execute('UPDATE accounts SET value=? WHERE username=?', (payload, username))
            return True
        salt = secrets.token_hex(16)
        pw_hash = _hash_password(password, salt)
        with self.db:
            self.db.execute(
                'INSERT INTO accounts(username, salt, password_hash, value) VALUES(?,?,?,?)',
                (username, salt, pw_hash, payload),
            )
        return True

    def sync_account(self, username, profile):
        if not username:
            return
        with self.db:
            self.db.execute(
                'UPDATE accounts SET value=? WHERE username=?',
                (json.dumps(profile, ensure_ascii=False), username),
            )

    def load_account(self, username, password):
        row = self.db.execute(
            'SELECT salt, password_hash, value FROM accounts WHERE username=?', (username,)
        ).fetchone()
        if not row:
            return None
        salt, stored_hash, val = row
        if not password or not hmac.compare_digest(_hash_password(password, salt), stored_hash):
            return None
        return migrate_profile_layout(json.loads(val))

    def close(self):
        self.db.close()

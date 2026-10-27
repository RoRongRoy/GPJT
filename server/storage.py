"""SQLite snapshot store; each completed action and its resources commit together."""
import json
import sqlite3
from pathlib import Path
from .game import new_world
from .worldmap import ENEMY_SPAWNS, new_enemy, LAYOUT_VERSION, expand_coordinate


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
        self.db.commit()

    def load(self):
        row = self.db.execute('SELECT value FROM world WHERE id=1').fetchone()
        w = json.loads(row[0]) if row else new_world()
        if w.get('version') != 1:
            raise RuntimeError('Unsupported save version; restore a compatible backup. Do not delete the save.')
        layout = w.get('layout_version', 1)
        if layout not in (1, LAYOUT_VERSION):
            raise RuntimeError('Unsupported map layout; restore a compatible backup.')
        if layout == 1:
            for actor in (w['player'], w['base']):
                actor['x'], actor['y'] = expand_coordinate(actor['x']), expand_coordinate(actor['y'])
            # Move encounters to spaced homes once; keep HP, respawn and attack timers.
            for enemy in w['enemies']:
                enemy['x'], enemy['y'] = ENEMY_SPAWNS[enemy['id']]
            w['layout_version'] = LAYOUT_VERSION
        # Add expansion encounters without resetting existing enemies or player assets.
        existing = {enemy['id'] for enemy in w['enemies']}
        w['enemies'].extend(new_enemy(i) for i in range(len(ENEMY_SPAWNS)) if i not in existing)
        return w

    def save(self, world):
        with self.db:
            self.db.execute('INSERT INTO world VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
                            (json.dumps(world, ensure_ascii=False),))

    def close(self):
        self.db.close()

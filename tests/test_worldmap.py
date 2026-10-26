"""Expansion boundaries and legacy-save preservation, including distant encounters."""
import copy
import math
from pathlib import Path
import tempfile
import unittest
from server.game import act, new_world, tick, RuleError
from server.storage import Store
from server.worldmap import SIZE, POIS, ENEMY_SPAWNS, WORLD_MAP


class WorldMapTests(unittest.TestCase):
    def test_expanded_boundary_and_diagonal_speed_are_server_owned(self):
        world = new_world()
        act(world, {'action': 'choose', 'species': 'human'})
        world['player'].update(x=30, y=30)
        act(world, {'action': 'move', 'dx': 1, 'dy': 1})
        self.assertAlmostEqual(math.hypot(world['player']['x']-30, world['player']['y']-30), .48)
        with self.assertRaises(RuleError):
            act(world, {'action': 'move', 'dx': 1, 'dy': 1})
        tick(world, .15)
        world['player'].update(x=SIZE-2, y=SIZE-2)
        act(world, {'action': 'move', 'dx': 1, 'dy': 1})
        self.assertEqual((world['player']['x'], world['player']['y']), (62, 62))
        tick(world, .15)
        world['player'].update(x=1, y=1)
        act(world, {'action': 'move', 'dx': -1, 'dy': -1})
        self.assertEqual((world['player']['x'], world['player']['y']), (1, 1))

    def test_expansion_has_usable_landmarks_in_each_region(self):
        self.assertEqual(len({node['id'] for node in POIS}), len(POIS))
        for region in WORLD_MAP['regions']:
            nodes = [node for node in POIS if region['x'] <= node['x'] < region['x']+region['width']
                     and region['y'] <= node['y'] < region['y']+region['height']]
            self.assertTrue(any(node['kind'] == 'npc' for node in nodes))
            for node in nodes:
                self.assertTrue(1 <= node['x'] <= SIZE-2 and 1 <= node['y'] <= SIZE-2)
                if node['kind'] == 'npc':
                    continue
                world = new_world()
                act(world, {'action': 'choose', 'species': 'human'})
                world['player'].update(x=node['x'], y=node['y'])
                before = world['inventory'][node['kind']]
                act(world, {'action': 'gather', 'id': node['id']})
                self.assertEqual(world['inventory'][node['kind']], before+3)

    def test_old_save_keeps_assets_and_encounter_state_on_repeated_load(self):
        world = new_world()
        world['enemies'] = world['enemies'][:3]
        world['enemies'][0].update(hp=0, respawn=123, x=19, y=23)
        world['player'].update(species='vampire', chosen=True, x=18, y=19)
        world['base'].update(x=19, y=19)
        world['base']['facilities']['medical'] = 3
        world['inventory']['wood'] = 231
        before = copy.deepcopy(world)
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'world.sqlite3')
            store.save(world)
            restored = store.load()
            for key in before:
                if key != 'enemies':
                    self.assertEqual(restored[key], before[key])
            self.assertEqual(restored['enemies'][:3], before['enemies'])
            self.assertEqual(len(restored['enemies']), len(ENEMY_SPAWNS))
            store.save(restored)
            self.assertEqual(store.load(), restored)
            store.close()

    def test_distant_enemy_respawns_at_its_own_home(self):
        world = new_world()
        act(world, {'action': 'choose', 'species': 'human'})
        enemy = world['enemies'][-1]
        enemy.update(hp=0, respawn=0, x=44, y=44)
        tick(world, .2)
        self.assertEqual(enemy['hp'], 60)
        self.assertEqual((enemy['x'], enemy['y']), ENEMY_SPAWNS[-1])

    def test_distant_relocation_survives_save_and_species_roundtrip(self):
        world = new_world()
        act(world, {'action': 'choose', 'species': 'human'})
        act(world, {'action': 'build', 'facility': 'medical'})
        world['player'].update(x=60, y=10)
        facilities = copy.deepcopy(world['base']['facilities'])
        inventory = copy.deepcopy(world['inventory'])
        act(world, {'action': 'relocate'})
        self.assertEqual(world['inventory'], inventory)
        self.assertEqual(world['base']['facilities'], facilities)
        act(world, {'action': 'convert'})
        act(world, {'action': 'convert'})
        self.assertEqual((world['base']['x'], world['base']['y']), (60, 10))
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'world.sqlite3')
            store.save(world)
            self.assertEqual(store.load(), world)
            store.close()

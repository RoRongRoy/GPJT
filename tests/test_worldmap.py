"""Expansion boundaries and legacy-save preservation, including distant encounters."""
import copy
import math
from pathlib import Path
import tempfile
import unittest
from server.game import act, new_world, tick, RuleError
from server.storage import Store
from server.worldmap import SIZE, POIS, ENEMY_SPAWNS, WORLD_MAP, region_at, BASE_USE_RADIUS, expand_coordinate


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
        self.assertEqual((world['player']['x'], world['player']['y']), (SIZE-2, SIZE-2))
        tick(world, .15)
        world['player'].update(x=1, y=1)
        act(world, {'action': 'move', 'dx': -1, 'dy': -1})
        self.assertEqual((world['player']['x'], world['player']['y']), (1, 1))
        tick(world, .15)
        world['player'].update(x=30, y=30)
        act(world, {'action': 'move', 'dx': 1, 'dy': 0, 'sprint': True})
        self.assertAlmostEqual(world['player']['x'] - 30, .48 * 1.65)

    def test_expansion_has_usable_landmarks_in_each_region(self):
        self.assertEqual(len({node['id'] for node in POIS}), len(POIS))
        for region in WORLD_MAP['regions']:
            nodes = [node for node in POIS if region_at(node['x'],node['y'])['id']==region['id']]
            if not region.get('terrain'):
                self.assertTrue(any(node['kind'] == 'npc' for node in nodes))
            else:
                self.assertEqual(len(nodes),20 if region['id'] in ('quarry','catacombs','laboratory','wasteland','abyss') else 12)
            for node in nodes:
                self.assertTrue(1 <= node['x'] <= SIZE-2 and 1 <= node['y'] <= SIZE-2)
                if node['kind'] == 'npc':
                    continue
                world = new_world()
                act(world, {'action': 'choose', 'species': 'human'})
                world['player'].update(x=node['x'], y=node['y'])
                before = world['inventory'][node['kind']]
                act(world, {'action': 'gather', 'id': node['id']})
                self.assertEqual(world['inventory'][node['kind']], before+node.get('loot',{}).get(node['kind'],0) if node.get('loot') else before+3)

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
        self.assertEqual(enemy['hp'], enemy['max_hp'])
        self.assertEqual((enemy['x'], enemy['y']), ENEMY_SPAWNS[-1])

    def test_distant_relocation_survives_save_and_species_roundtrip(self):
        world = new_world()
        act(world, {'action': 'choose', 'species': 'human'})
        world['player'].update(x=world['base']['x'], y=world['base']['y'])
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

    def test_layout_upgrade_runs_once_without_losing_progress(self):
        w=new_world();w.pop('layout_version');w['player'].update(x=6,y=7,species='vampire',level=7)
        w['base'].update(x=6,y=6);w['base']['facilities']['storage']=3
        w['inventory']['wood']=231;w['cooldowns']['skill:sweep']=73;w['elapsed']=69
        w['enemies'][0].update(x=12,y=11,hp=0,respawn=123,attack=77)
        before=copy.deepcopy(w)
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'world.sqlite3');store.save(w);restored=store.load()
            self.assertEqual(restored['layout_version'],3)
            self.assertEqual(restored['player']['x'],expand_coordinate(6)*2)
            self.assertEqual(restored['base']['y'],expand_coordinate(6)*2)
            for key in ('inventory','cooldowns','elapsed','milestones'):
                self.assertEqual(restored[key],before[key])
            self.assertEqual(restored['base']['facilities'],before['base']['facilities'])
            self.assertEqual(restored['player']['level'],7)
            self.assertEqual(restored['enemies'][0]['hp'],0)
            self.assertEqual(restored['enemies'][0]['respawn'],123)
            self.assertEqual((restored['enemies'][0]['x'],restored['enemies'][0]['y']),ENEMY_SPAWNS[0])
            store.save(restored);self.assertEqual(store.load(),restored);store.close()

    def test_spacing_and_non_grid_layout(self):
        self.assertEqual(SIZE,544);self.assertEqual(len(POIS),249);self.assertEqual(len(ENEMY_SPAWNS),143)
        for i,a in enumerate(POIS):
            for b in POIS[i+1:]:self.assertGreaterEqual(math.hypot(a['x']-b['x'],a['y']-b['y']),8)
        for i,a in enumerate(ENEMY_SPAWNS):
            for b in ENEMY_SPAWNS[i+1:]:self.assertGreater(math.dist(a,b),17)
        base=new_world()['base']
        for node in POIS:self.assertGreater(math.hypot(node['x']-base['x'],node['y']-base['y']),10)
        self.assertTrue(all('width' not in r for r in WORLD_MAP['regions']))
        for road in WORLD_MAP['roads']:
            self.assertGreater(len({p[0] for p in road}),2);self.assertGreater(len({p[1] for p in road}),2)

    def test_expanded_camp_crafting_and_protection_use_same_boundary(self):
        w=new_world();w['player'].update(chosen=True,x=83.9,y=24);w['base'].update(x=77,y=24)
        for e in w['enemies']:e.update(x=100,y=100)
        w['enemies'][0].update(x=84,y=24)
        act(w,{'action':'build','facility':'kitchen'})
        hp=w['player']['hp'];tick(w,.2);self.assertEqual(w['player']['hp'],hp)
        w['player']['x']=84.1
        with self.assertRaises(RuleError):act(copy.deepcopy(w),{'action':'build','facility':'storage'})
        tick(w,.2);self.assertLess(w['player']['hp'],hp)

    def test_lost_enemy_returns_to_home_without_healing(self):
        w=new_world();w['player'].update(chosen=True,x=110,y=20)
        e=w['enemies'][0];e.update(x=e['x']+8,hp=19)
        before=math.dist((e['x'],e['y']),ENEMY_SPAWNS[0]);tick(w,1)
        self.assertLess(math.dist((e['x'],e['y']),ENEMY_SPAWNS[0]),before);self.assertEqual(e['hp'],19)

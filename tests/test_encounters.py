import copy
import math
from pathlib import Path
import tempfile
import unittest
from server.game import new_world, tick, act, damage_enemy, RuleError
from server.worldmap import ENEMY_SPAWNS, REGIONS, live_pois
from server.equipment import RARITIES, roll_equipment
from server.storage import Store


class EncounterTests(unittest.TestCase):
    def world(self):
        w = new_world()
        w['player']['chosen'] = True
        return w

    def test_idle_patrol_is_bounded_for_monsters_and_both_npc_species(self):
        w = self.world()
        start = copy.deepcopy(w)
        for _ in range(600):
            tick(w, .1)
            for e in w['enemies']:
                self.assertLessEqual(math.dist((e['x'], e['y']), ENEMY_SPAWNS[e['id']]), 3.001)
            for n in w['npcs']:
                self.assertLessEqual(math.hypot(n['x']-n['home_x'], n['y']-n['home_y']), 1.801)
        for key in ('enemies', 'npcs'):
            for a, b in zip(start[key], w[key]):
                self.assertGreater(math.hypot(a['x']-b['x'], a['y']-b['y']), .2)
        w['paused'] = True
        before = copy.deepcopy(w)
        tick(w, 1)
        self.assertEqual(w, before)

    def test_chase_leash_return_and_respawn(self):
        w = self.world(); e = w['enemies'][0]
        w['player'].update(x=e['x']+3, y=e['y'])
        old = e['x']; tick(w, 1); self.assertGreater(e['x'], old)
        e.update(x=ENEMY_SPAWNS[0][0]+10.1, hp=19)
        w['player'].update(x=e['x']+1, y=e['y'])
        hp = w['player']['hp']; tick(w, 1)
        self.assertTrue(e['returning']); self.assertEqual(w['player']['hp'], hp)
        self.assertEqual(e['hp'], 19)
        e.update(hp=0, respawn=w['elapsed']+2)
        tick(w, 1); self.assertEqual(e['hp'], 0)
        tick(w, 1); self.assertEqual(e['hp'], e['max_hp'])
        self.assertEqual((e['x'], e['y']), ENEMY_SPAWNS[0])

    def test_regions_have_increasing_strength_and_correct_levels(self):
        w = self.world(); previous = 0
        for region in REGIONS:
            enemies = [e for e in w['enemies'] if e['region'] == region['id']]
            self.assertTrue(enemies)
            average = sum(e['max_hp'] for e in enemies)/len(enemies)
            self.assertGreater(average, previous)
            previous = average
            for e in enemies:
                self.assertTrue(region['levels'][0] <= e['level'] <= region['levels'][1])
                self.assertGreaterEqual(e['damage'], 8)

    def test_exact_drop_intervals_all_five_rarities_and_no_drop(self):
        w = self.world(); threshold = 0
        for rarity, spec in RARITIES.items():
            for roll in (threshold+spec['chance']/2, threshold+spec['chance']-1e-10):
                values = iter([roll, .1])
                item = roll_equipment(w, w['enemies'][0], lambda: next(values))
                self.assertEqual(item['rarity'], rarity)
            threshold += spec['chance']
        self.assertAlmostEqual(threshold, .06111)
        self.assertIsNone(roll_equipment(w, w['enemies'][0], lambda: threshold))
        self.assertIsNone(roll_equipment(w, w['enemies'][0], lambda: .999))
        self.assertEqual(len({g['id'] for g in w['gear']}), 10)

    def test_kill_rewards_once_and_character_level_preserves_enhancement(self):
        w = self.world(); e = w['enemies'][0]; w['player'].update(level=7, xp=35)
        values = iter([.1, .01, .9])
        damage_enemy(w, e, 1000, lambda: next(values))
        self.assertEqual(len(w.get('drops', [])), 1)
        w['player'].update(x=e['x'], y=e['y'])
        act(w, {'action': 'loot', 'id': w['drops'][0]['id']})
        self.assertEqual(w['inventory']['medicine'], 2)
        self.assertEqual(w['gear'][0]['slot'], 'armor')
        self.assertEqual(w['player']['combat_level'], 2)
        self.assertEqual(w['player']['level'], 7)
        before = copy.deepcopy(w)
        damage_enemy(w, e, 1000, lambda: self.fail('Dead enemy rolled loot twice'))
        self.assertEqual(w, before)

    def test_equip_changes_damage_and_armor_then_unequip_restores(self):
        w = self.world(); e = w['enemies'][0]
        w['player'].update(x=e['x'], y=e['y']+1)
        for slot_roll in (.1, .9):
            values = iter([.0605, slot_roll])
            g = roll_equipment(w, e, lambda: next(values))
            act(w, {'action': 'equip', 'item': g['id']})
        old = e['hp']; act(w, {'action': 'attack'})
        self.assertEqual(old-e['hp'], 35)  # Rare T1 weapon: 4+7.
        tick(w, .1)
        self.assertEqual(w['player']['hp'], 99)  # Damage cannot fall below 1.
        act(w, {'action': 'unequip', 'slot': 'weapon'})
        w['elapsed'] += 1; e['hp'] = 60
        act(w, {'action': 'attack'}); self.assertEqual(e['hp'], 36)
        before = copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w, {'action': 'equip', 'item': 'gear:999'})
        self.assertEqual(w, before)

    def test_npc_quest_uses_live_position_and_map_is_immutable(self):
        w = self.world(); npc = w['npcs'][0]; npc['x'] += 1.8
        w['player'].update(x=npc['x']+2, y=npc['y']); w['quest']['collected'] = 5
        act(w, {'action': 'quest'})
        self.assertEqual(w['quest']['round'], 1)
        self.assertEqual(next(n for n in live_pois(w) if n['id']==npc['id'])['x'], npc['x'])
        self.assertEqual(new_world()['npcs'][0]['x'], npc['home_x'])

    def test_legacy_migration_and_gear_restart_preserve_assets(self):
        w = self.world()
        for key in ('encounter_version', 'gear', 'equipment', 'next_gear_id', 'npcs'):w.pop(key)
        w['player'].pop('combat_level'); w['player'].pop('xp')
        w['enemies'][0] = dict(id=0,x=42,y=12,hp=19,respawn=123,attack=12)
        before = copy.deepcopy(w)
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d)/'save.sqlite3'); store.save(w); restored = store.load()
            for key in ('inventory', 'base', 'cooldowns', 'quest'):self.assertEqual(restored[key], before[key])
            for key, value in before['enemies'][0].items():self.assertEqual(restored['enemies'][0][key],value)
            item=roll_equipment(restored, restored['enemies'][0], lambda: .001)
            act(restored, {'action':'equip','item':item['id']}); tick(restored, .5)
            store.save(restored); self.assertEqual(store.load(), restored); store.close()

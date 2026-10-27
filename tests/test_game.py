import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, act, tick, RuleError, POIS
from server.storage import Store


class GameTests(unittest.TestCase):
    def setUp(self):
        self.w = new_world()
        act(self.w, {'action': 'choose', 'species': 'human'})

    def action(self, name, **fields):
        candidate = copy.deepcopy(self.w)
        act(candidate, {'action': name, **fields})
        self.w = candidate

    def test_craft_requires_facility_and_materials(self):
        before = copy.deepcopy(self.w)
        with self.assertRaises(RuleError):
            self.action('craft', recipe='soup')
        self.assertEqual(before, self.w)
        self.action('build', facility='kitchen')
        self.action('craft', recipe='soup')
        self.assertEqual(self.w['inventory']['soup'], 3)
        self.assertEqual(self.w['inventory']['crop'], 6)

    def test_conversion_roundtrip_keeps_base_and_research(self):
        self.action('build', facility='medical')
        self.w['inventory']['metal'] += 5  # previously gathered parts
        self.action('research')
        base = copy.deepcopy(self.w['base'])
        self.action('convert')
        self.assertEqual(self.w['player']['species'], 'vampire')
        self.action('convert')
        self.assertEqual(self.w['player']['species'], 'human')
        self.assertEqual(base, self.w['base'])
        self.assertEqual(self.w['player']['unlocks']['human'], 1)

    def test_relocation_preserves_all_assets(self):
        self.w['player'].update(x=8, y=8)
        before = copy.deepcopy(self.w)
        self.action('relocate')
        self.assertEqual(self.w['base']['x'], 8)
        self.assertEqual(self.w['inventory'], before['inventory'])
        self.assertEqual(self.w['base']['facilities'], before['base']['facilities'])

    def test_remote_crafting_rejected(self):
        self.w['player'].update(x=90, y=90)
        with self.assertRaises(RuleError):
            self.action('build', facility='kitchen')

    def test_pity_and_no_downgrade(self):
        self.w['player'].update(level=9, pity=0)
        self.w['inventory']['scroll'] = 25
        for _ in range(4):
            act(self.w, {'action': 'enhance'}, rng=lambda: 1)
        self.assertEqual(self.w['player']['level'], 9)
        act(self.w, {'action': 'enhance'}, rng=lambda: 1)
        self.assertEqual(self.w['player']['level'], 10)
        self.assertEqual(self.w['inventory']['scroll'], 0)
        self.assertEqual(self.w['player']['pity'], 0)

    def test_negative_or_teleport_input_rejected(self):
        for dx in [999, 0.5, '1', True]:
            with self.assertRaises(RuleError):
                self.action('move', dx=dx, dy=0)

    def test_gather_distance_and_cooldown(self):
        with self.assertRaises(RuleError):
            self.action('gather', id='blood')
        node=next(n for n in POIS if n['id']=='grove')
        self.w['player'].update(x=node['x'], y=node['y'])
        self.action('gather', id='grove')
        with self.assertRaises(RuleError):
            self.action('gather', id='grove')
        tick(self.w, 1); tick(self.w, 1); tick(self.w, 1)
        self.action('gather', id='grove')

    def test_species_food_rules(self):
        with self.assertRaises(RuleError):
            self.action('consume', item='elixir')
        self.w['player'].update(species='vampire', blood=20, stability=20)
        self.action('consume', item='elixir')
        self.assertEqual(self.w['player']['blood'], 60)
        self.assertEqual(self.w['player']['stability'], 65)

    def test_pause_freezes_all_time(self):
        self.action('dispatch')
        self.action('pause')
        before = copy.deepcopy(self.w)
        tick(self.w, 1)
        self.assertEqual(before, self.w)

    def test_dispatch_rewards_once(self):
        self.action('dispatch')
        before = self.w['inventory']['scroll']
        for _ in range(61):
            tick(self.w, 1)
        self.assertIsNone(self.w['dispatch'])
        self.assertEqual(self.w['inventory']['scroll'], before+5)
        tick(self.w, 1)
        self.assertEqual(self.w['inventory']['scroll'], before+5)

    def test_infection_rescue_preserves_assets(self):
        self.w['player']['infection'] = 100
        before = copy.deepcopy(self.w['base'])
        tick(self.w, .1)
        self.assertEqual(self.w['player']['infection'], 0)
        self.assertEqual(self.w['base'], before)

    def test_save_round_trip_and_version_guard(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'test.sqlite3'
            s = Store(path)
            self.action('build', facility='alchemy')
            s.save(self.w)
            s.close()
            s = Store(path)
            self.assertEqual(s.load(), self.w)
            self.w['version'] = 99
            s.save(self.w)
            with self.assertRaises(RuntimeError):
                s.load()
            s.close()


if __name__ == '__main__':
    unittest.main()

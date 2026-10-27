import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, act, RuleError, COMBAT
from server.storage import Store


class CombatTests(unittest.TestCase):
    def setUp(self):
        self.w = new_world()
        self.w['player'].update(chosen=True, x=20, y=20, hp=60)
        for e in self.w['enemies']:
            e.update(x=50, y=50, hp=60)
        self.w['enemies'][0].update(x=21, y=20)
        self.w['enemies'][1].update(x=20, y=22.5)

    def action(self, **command):
        candidate = copy.deepcopy(self.w)
        act(candidate, command, rng=lambda: .99)
        self.w = candidate

    def test_sweep_range_cost_cooldown_and_attack_lock(self):
        self.action(action='skill', skill='sweep')
        self.assertEqual([e['hp'] for e in self.w['enemies'][:3]], [28, 28, 60])
        self.assertEqual(self.w['player']['food'], 84)
        before = copy.deepcopy(self.w)
        for command in ({'action': 'skill', 'skill': 'sweep'}, {'action': 'attack'}):
            with self.assertRaises(RuleError):
                self.action(**command)
            self.assertEqual(self.w, before)
        self.w['elapsed'] += COMBAT['sweep']['cooldown']
        self.action(action='skill', skill='sweep')
        self.assertEqual([e['hp'] for e in self.w['enemies'][:2]], [0, 0])
        self.assertEqual(self.w['inventory']['scroll'], before['inventory']['scroll']+6)
        loot = self.w['inventory'].copy()
        self.w['elapsed'] += 6
        self.action(action='attack')  # Empty swing is allowed; no duplicate loot.
        self.assertEqual(self.w['inventory'], loot)

    def test_basic_attack_only_hits_nearest_target(self):
        self.w['enemies'][1].update(x=20, y=21.5)
        self.action(action='attack')
        self.assertEqual(self.w['enemies'][0]['hp'], 36)
        self.assertEqual(self.w['enemies'][1]['hp'], 60)

    def test_recovery_species_cost_clamp_and_persistence(self):
        self.w['player'].update(species='vampire', hp=95, blood=30)
        self.action(action='skill', skill='recover')
        self.assertEqual(self.w['player']['hp'], 100)
        self.assertEqual(self.w['player']['blood'], 22)
        self.assertEqual(self.w['player']['food'], 90)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'save.sqlite3'
            store=Store(path);store.save(self.w);store.close()
            store=Store(path);self.assertEqual(store.load(), self.w);store.close()
        self.w['player']['hp'] = 70
        with self.assertRaises(RuleError):
            self.action(action='skill', skill='recover')
        self.w['elapsed'] += 10
        self.action(action='skill', skill='recover')
        self.assertEqual(self.w['player']['hp'], 88)

    def test_invalid_skills_and_resources_leave_candidate_uncommitted(self):
        for skill in (None, [], {}, 'attack', 'unknown'):
            before=copy.deepcopy(self.w)
            with self.assertRaises(RuleError):
                self.action(action='skill', skill=skill)
            self.assertEqual(self.w,before)
        for changes in ({'food':0}, {'mounted':True}, {'hp':100}):
            self.w['player'].update(food=90, mounted=False, hp=60)
            self.w['player'].update(changes);before=copy.deepcopy(self.w)
            with self.assertRaises(RuleError):
                self.action(action='skill', skill='recover')
            self.assertEqual(self.w,before)
        self.w['paused']=True
        with self.assertRaises(RuleError):
            self.action(action='skill', skill='sweep')

    def test_no_sweep_target_does_not_spend_or_start_cooldowns(self):
        for e in self.w['enemies']:e.update(x=50,y=50)
        before=copy.deepcopy(self.w)
        with self.assertRaises(RuleError):
            self.action(action='skill', skill='sweep')
        self.assertEqual(self.w,before)

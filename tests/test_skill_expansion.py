import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, act, tick, RuleError, JOB_SKILLS
from server.skills import EXCLUSIVE_SKILLS
from server.storage import Store


class SkillExpansionTests(unittest.TestCase):
    def world(self, species='human', job='warrior', level=30):
        w = new_world()
        w['player'].update(chosen=True, species=species, job=job, combat_level=level,
                           x=100, y=100, hp=50, food=100, blood=100, mp=100)
        w['inventory']['skillbook'] = 30
        for e in w['enemies']:
            e.update(x=200, y=200, hp=1000, max_hp=1000, faction='infected')
        w['enemies'][0].update(x=101, y=100)
        return w

    def test_all_32_exclusive_skills_can_be_selected_and_cast(self):
        for (species, job), skills in EXCLUSIVE_SKILLS.items():
            self.assertEqual(len(JOB_SKILLS[(species, job)]), 14)
            for key, spec in skills.items():
                with self.subTest(skill=key):
                    w = self.world(species, job, spec['unlock_level'])
                    with self.assertRaises(RuleError):
                        act(copy.deepcopy(w), {'action': 'skill', 'skill': key})
                    act(w, {'action': 'learn_skill', 'skill': key})
                    self.assertEqual(w['inventory']['skillbook'], 30-spec['book_cost'])
                    before = copy.deepcopy(w)
                    act(w, {'action': 'skill', 'skill': key})
                    if spec.get('heal'):
                        self.assertGreater(w['player']['hp'], before['player']['hp'])
                    else:
                        self.assertLess(w['enemies'][0]['hp'], before['enemies'][0]['hp'])
                    self.assertGreater(w['cooldowns']['skill:'+key], w['elapsed'])
                    with self.assertRaises(RuleError):
                        act(copy.deepcopy(w), {'action': 'skill', 'skill': key})
                    with self.assertRaises(RuleError):
                        act(copy.deepcopy(w), {'action': 'learn_skill', 'skill': key})

    def test_level_books_and_wrong_job_reject_without_spending(self):
        for changes, key in [({'combat_level': 1}, 'hw_slash'), ({'job': 'ranged'}, 'hw_slash'),
                             ({'species': 'vampire'}, 'hw_slash'), ({}, 'hr_rail')]:
            w = self.world();w['player'].update(changes)
            for action in ('learn_skill', 'skill'):
                before = copy.deepcopy(w)
                with self.assertRaises(RuleError):
                    act(w, {'action': action, 'skill': key})
                self.assertEqual(w, before)
        w = self.world();w['inventory']['skillbook'] = 0
        with self.assertRaises(RuleError):
            act(w, {'action': 'learn_skill', 'skill': 'hw_execution'})
        # A higher level skill has no mandatory prerequisite chain.
        w['inventory']['skillbook'] = 3
        act(w, {'action': 'learn_skill', 'skill': 'hw_execution'})
        self.assertNotIn('hw_slash', w['player']['learned_skills'])
        self.assertEqual(w['inventory']['skillbook'], 0)

    def test_free_skill_is_explicit_and_persists_across_job_changes_and_save(self):
        w = self.world(level=2);w['inventory']['skillbook'] = 0
        act(w, {'action': 'learn_skill', 'skill': 'hw_slash'})
        w['player']['job'] = 'ranged'
        with self.assertRaises(RuleError):
            act(w, {'action': 'skill', 'skill': 'hw_slash'})
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d)/'save.sqlite3');store.save(w);loaded=store.load();store.close()
        self.assertIn('hw_slash', loaded['player']['learned_skills'])
        loaded['player']['job'] = 'warrior'
        act(loaded, {'action': 'skill', 'skill': 'hw_slash'})
        self.assertEqual(loaded['inventory']['skillbook'], 0)

    def test_target_explosion_hits_near_target_not_near_caster_or_allies(self):
        w = self.world(job='ranged')
        for e, x, faction in zip(w['enemies'], [105, 106.5, 101, 105.2], ['infected','infected','human','human']):
            e.update(x=x, y=100, faction=faction)
        act(w, {'action': 'learn_skill', 'skill': 'hr_grenade'})
        act(w, {'action': 'skill', 'skill': 'hr_grenade'})
        self.assertLess(w['enemies'][0]['hp'], 1000)
        self.assertLess(w['enemies'][1]['hp'], 1000)  # beyond cast range, inside target blast
        self.assertEqual(w['enemies'][2]['hp'], 1000)
        self.assertEqual(w['enemies'][3]['hp'], 1000)

    def test_every_ranged_attack_reaches_distant_targets(self):
        for species in ('human', 'vampire'):
            for key, spec in JOB_SKILLS[(species, 'ranged')].items():
                if not spec.get('damage'):
                    continue
                with self.subTest(species=species, skill=key):
                    w = self.world(species, 'ranged')
                    w['enemies'][0].update(x=105.5, y=100)
                    if key not in w['player']['learned_skills']:
                        act(w, {'action': 'learn_skill', 'skill': key})
                    act(w, {'action': 'skill', 'skill': key})
                    self.assertLess(w['enemies'][0]['hp'], 1000)
                    self.assertEqual(spec['visual'], 'ranged')
                    self.assertFalse(spec.get('aoe'))

    def test_legacy_ranged_blasts_use_target_center_and_respect_range(self):
        for species in ('human', 'vampire'):
            for key in ('sweep', 'ultimate'):
                with self.subTest(species=species, skill=key):
                    w = self.world(species, 'ranged')
                    radius = JOB_SKILLS[(species, 'ranged')][key]['range']
                    w['enemies'][0].update(x=100+radius, y=100)
                    w['enemies'][1].update(x=101+radius, y=100)
                    w['enemies'][2].update(x=100+radius, y=101, faction=species)
                    if key not in w['player']['learned_skills']:
                        act(w, {'action': 'learn_skill', 'skill': key})
                    saved = copy.deepcopy(w)
                    act(w, {'action': 'skill', 'skill': key})
                    self.assertLess(w['enemies'][0]['hp'], 1000)
                    self.assertLess(w['enemies'][1]['hp'], 1000)
                    self.assertEqual(w['enemies'][2]['hp'], 1000)
                    saved['enemies'][0]['x'] += .1
                    before = copy.deepcopy(saved)
                    with self.assertRaises(RuleError):
                        act(saved, {'action': 'skill', 'skill': key})
                    self.assertEqual(saved, before)
        self.assertTrue(JOB_SKILLS[('human', 'warrior')]['sweep']['aoe'])

    def test_stun_stops_enemy_then_expires(self):
        w = self.world();act(w, {'action':'learn_skill','skill':'hw_bash'})
        act(w, {'action':'skill','skill':'hw_bash'})
        e = w['enemies'][0];position=(e['x'],e['y'])
        tick(w, 1)
        self.assertEqual((e['x'],e['y']), position)
        tick(w, 1)
        self.assertNotEqual((e['x'],e['y']), position)

    def test_cleanse_works_at_full_hp_and_missing_target_spends_nothing(self):
        w = self.world();act(w, {'action':'learn_skill','skill':'hw_sanctuary'})
        w['player'].update(hp=100, infection=50)
        act(w, {'action':'skill','skill':'hw_sanctuary'})
        self.assertEqual(w['player']['infection'], 0)
        act(w, {'action':'learn_skill','skill':'hw_slash'})
        w['enemies'][0].update(x=200, y=200)
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):
            act(w, {'action':'skill','skill':'hw_slash'})
        self.assertEqual(w, before)

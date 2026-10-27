"""Verify onboarding reflects committed actions and survives old saves/restarts."""
import copy
import tempfile
import unittest
from pathlib import Path
from server.game import act, new_world, RuleError, POIS
from server.storage import Store


class OnboardingTests(unittest.TestCase):
    def test_both_species_complete_living_loop_and_keep_progress(self):
        for species, facility, recipe in [('human', 'kitchen', 'soup'), ('vampire', 'alchemy', 'elixir')]:
            with self.subTest(species=species), tempfile.TemporaryDirectory() as directory:
                world = new_world()
                act(world, {'action': 'choose', 'species': species})
                node=next(n for n in POIS if n['id']=='grove')
                world['player'].update(x=node['x'], y=node['y'])
                act(world, {'action': 'gather', 'id': 'grove'})
                world['player'].update(x=world['base']['x'], y=world['base']['y']+1)
                act(world, {'action': 'build', 'facility': facility})
                act(world, {'action': 'craft', 'recipe': recipe})
                act(world, {'action': 'consume', 'item': recipe})
                expected = ['gather', 'build:'+facility, 'craft:'+recipe, 'consume:'+recipe]
                self.assertEqual(world['milestones'], expected)
                act(world, {'action': 'consume', 'item': recipe})
                self.assertEqual(world['milestones'], expected)
                path = Path(directory)/'world.sqlite3'
                store = Store(path)
                store.save(world)
                store.close()
                store = Store(path)
                self.assertEqual(store.load()['milestones'], expected)
                store.close()

    def test_legacy_world_gains_progress_without_reset(self):
        world = new_world()
        del world['milestones']
        act(world, {'action': 'choose', 'species': 'human'})
        before = copy.deepcopy(world['inventory'])
        act(world, {'action': 'build', 'facility': 'kitchen'})
        self.assertEqual(world['milestones'], ['build:kitchen'])
        self.assertEqual(world['inventory']['wood'], before['wood']-3)
        self.assertEqual(world['base']['x'], new_world()['base']['x'])

    def test_failed_action_does_not_award_progress(self):
        world = new_world()
        act(world, {'action': 'choose', 'species': 'human'})
        with self.assertRaises(RuleError):
            act(world, {'action': 'craft', 'recipe': 'soup'})
        self.assertEqual(world['milestones'], [])

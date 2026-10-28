import copy
import tempfile
import unittest
from pathlib import Path
from server.game import act, ensure_starter_gear, new_world
from server.equipment import RARITIES
from server.main import Runtime, PROFILE_KEYS
from server.storage import Store


class StarterGearTests(unittest.TestCase):
    def legacy_world(self):
        w = new_world()
        act(w, {'action': 'choose', 'species': 'human'})
        for item in w['gear']:
            item['rarity'] = 'common'
        w['inventory']['wood'] = 77
        w['player']['combat_level'] = 9
        return w

    def test_new_adventurers_only_receive_catalog_rarities(self):
        for species in ('human', 'vampire'):
            with self.subTest(species=species):
                w = new_world()
                act(w, {'action': 'choose', 'species': species})
                self.assertEqual(len(w['gear']), 2)
                self.assertEqual(set(w['equipment'].values()), {g['id'] for g in w['gear']})
                for item in w['gear']:
                    self.assertIn(item['rarity'], RARITIES)
                    self.assertEqual(RARITIES[item['rarity']]['name'], '일반')

    def test_legacy_alias_changes_only_rarity_and_runs_once(self):
        w = self.legacy_world()
        expected = copy.deepcopy(w)
        for item in expected['gear']:
            item['rarity'] = 'normal'
        self.assertTrue(ensure_starter_gear(w))
        self.assertEqual(w, expected)
        self.assertFalse(ensure_starter_gear(w))
        self.assertEqual(w, expected)

    def test_restart_and_account_load_preserve_legacy_assets(self):
        w = self.legacy_world()
        profile = {k: copy.deepcopy(w[k]) for k in (*PROFILE_KEYS, 'base', 'next_gear_id') if k in w}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'world.sqlite3'
            store = Store(path)
            store.save(w)
            store.save_peer('legacy-peer-session', profile)
            store.save_account('legacy-player', 'test-password', profile)
            store.close()
            runtime = Runtime(path)
            try:
                self.assertEqual([g['rarity'] for g in runtime.store.load()['gear']], ['normal', 'normal'])
                peer = runtime.store.load_peers()['legacy-peer-session']
                self.assertEqual([g['rarity'] for g in peer['gear']], ['normal', 'normal'])
                self.assertEqual(peer['inventory'], profile['inventory'])
                candidate = new_world()
                self.assertTrue(runtime._handle_account_action(candidate, {
                    'action': 'account_load', 'username': 'legacy-player', 'password': 'test-password'
                }, is_peer=False))
                self.assertEqual(candidate['inventory'], w['inventory'])
                self.assertEqual(candidate['equipment'], w['equipment'])
                self.assertEqual(candidate['player']['combat_level'], 9)
                self.assertEqual([g['rarity'] for g in candidate['gear']], ['normal', 'normal'])
                self.assertEqual([g['power'] for g in candidate['gear']], [g['power'] for g in w['gear']])
            finally:
                runtime.store.close()

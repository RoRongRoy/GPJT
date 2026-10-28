"""Tests for individual base generation, territory progression persistence, and unsaved base expiration."""
import copy
import tempfile
import unittest
from pathlib import Path

from server.main import Runtime, PROFILE_KEYS
from server.worldmap import BASE_SPAWN_SITES, START_BASE


class MultiplayerBaseTests(unittest.TestCase):
    def test_each_adventurer_gets_unique_base_location_and_fresh_territory(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('player2-session')
                rt.authorize('player3-session')

                host_prof = rt._profile_for('host-session')
                p2_prof = rt._profile_for('player2-session')
                p3_prof = rt._profile_for('player3-session')

                # Ensure host and peers have their own bases at distinct sites
                self.assertEqual((host_prof['base']['x'], host_prof['base']['y']), BASE_SPAWN_SITES[0])
                self.assertEqual((p2_prof['base']['x'], p2_prof['base']['y']), BASE_SPAWN_SITES[1])
                self.assertEqual((p3_prof['base']['x'], p3_prof['base']['y']), BASE_SPAWN_SITES[2])

                # Ensure players spawn at their own bases
                self.assertAlmostEqual(p2_prof['player']['x'], BASE_SPAWN_SITES[1][0])
                self.assertAlmostEqual(p2_prof['player']['y'], BASE_SPAWN_SITES[1][1] + 1)
            finally:
                rt.store.close()

    def test_territory_development_is_isolated_and_saved_with_account(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('player2-session')

                # Player 2 chooses species and builds a kitchen in their own territory
                status, snap = rt.execute_action('player2-session', {'action': 'choose', 'species': 'human'})
                self.assertEqual(status, 200)

                # Reset rate limit timer for test
                rt.sessions['player2-session']['last_command'] = 0

                # Give materials to Player 2
                rt.peers['player2-session']['inventory']['wood'] = 20
                rt.peers['player2-session']['inventory']['metal'] = 20

                status, snap = rt.execute_action('player2-session', {'action': 'build', 'facility': 'kitchen'})
                self.assertEqual(status, 200)

                p2_prof = rt._profile_for('player2-session')
                host_prof = rt._profile_for('host-session')

                # Player 2 has kitchen Lv.1, host still has Lv.0 (territory isolation)
                self.assertEqual(p2_prof['base']['facilities']['kitchen'], 1)
                self.assertEqual(host_prof['base']['facilities']['kitchen'], 0)

                # Reset rate limit timer
                rt.sessions['player2-session']['last_command'] = 0

                # Player 2 saves their account
                status, snap = rt.execute_action('player2-session', {
                    'action': 'account_save',
                    'username': 'player2_hero',
                    'password': 'pw12345678'
                })
                self.assertEqual(status, 200)

                # Check that territory 발전내용 (facilities and location) is saved in database
                saved_acc = rt.store.load_account('player2_hero', 'pw12345678')
                self.assertIsNotNone(saved_acc)
                self.assertEqual(saved_acc['base']['facilities']['kitchen'], 1)
                self.assertEqual((saved_acc['base']['x'], saved_acc['base']['y']), BASE_SPAWN_SITES[1])

                # Simulate new session logging into player2_hero
                rt.authorize('player2-new-device')
                rt.sessions['player2-new-device']['last_command'] = 0
                status, snap = rt.execute_action('player2-new-device', {
                    'action': 'account_load',
                    'username': 'player2_hero',
                    'password': 'pw12345678'
                })
                self.assertEqual(status, 200)
                restored_base = snap['world']['base']
                self.assertEqual(restored_base['facilities']['kitchen'], 1)
                self.assertEqual((restored_base['x'], restored_base['y']), BASE_SPAWN_SITES[1])
            finally:
                rt.store.close()

    def test_unsaved_adventurer_territory_disappears_on_new_session(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('temp-session')
                rt.execute_action('temp-session', {'action': 'choose', 'species': 'human'})
                rt.sessions['temp-session']['last_command'] = 0
                rt.peers['temp-session']['inventory']['wood'] = 20
                rt.peers['temp-session']['inventory']['metal'] = 20
                rt.execute_action('temp-session', {'action': 'build', 'facility': 'kitchen'})

                # Player did not save account!
                # When checking stored accounts, temp-session does not exist
                self.assertIsNone(rt.store.load_account('temp-session', 'any'))

                # A fresh adventurer starting later gets a fresh Lv.0 base
                rt.authorize('temp-session-2')
                p2 = rt._profile_for('temp-session-2')
                self.assertEqual(p2['base']['facilities']['kitchen'], 0)
            finally:
                rt.store.close()


if __name__ == '__main__':
    unittest.main()

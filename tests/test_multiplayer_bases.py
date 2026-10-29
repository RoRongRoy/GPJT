"""Tests for individual base proclamation (claim_base), territory progression persistence, and unsaved base expiration."""
import copy
import tempfile
import unittest
from pathlib import Path

from server.main import Runtime, PROFILE_KEYS
from server.worldmap import BASE_SPAWN_SITES, START_BASE, ENEMY_SPAWNS


class MultiplayerBaseTests(unittest.TestCase):
    def test_adventurers_start_without_base_and_claim_in_field(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('player2-session')
                rt.authorize('player3-session')

                p2_prof = rt._profile_for('player2-session')
                p3_prof = rt._profile_for('player3-session')

                # Peer adventurers start as wanderers without pre-existing bases
                self.assertFalse(p2_prof['base']['established'])
                self.assertIsNone(p2_prof['base']['x'])
                self.assertIsNone(p2_prof['base']['y'])
                self.assertFalse(p3_prof['base']['established'])

                # Adventurers spawn in distinct areas
                self.assertAlmostEqual(p2_prof['player']['x'], BASE_SPAWN_SITES[1][0])
                self.assertAlmostEqual(p2_prof['player']['y'], BASE_SPAWN_SITES[1][1] + 1)

                # Choose species first
                rt.execute_action('player2-session', {'action': 'choose', 'species': 'human'})
                rt.sessions['player2-session']['last_command'] = 0

                # Attempting to build before proclaiming a base fails
                rt.peers['player2-session']['inventory']['wood'] = 20
                rt.peers['player2-session']['inventory']['metal'] = 20
                status, snap = rt.execute_action('player2-session', {'action': 'build', 'facility': 'kitchen'})
                self.assertEqual(status, 400)
                self.assertIn('아직 아지트가 선포되지 않았습니다', snap['error'])

                # Proclaim base at current location
                rt.sessions['player2-session']['last_command'] = 0
                rt.peers['player2-session']['player'].update(x=58., y=14.)
                status, snap = rt.execute_action('player2-session', {'action': 'claim_base'})
                self.assertEqual(status, 200)

                # Base is now established
                p2_updated = rt._profile_for('player2-session')
                self.assertTrue(p2_updated['base']['established'])
                self.assertAlmostEqual(p2_updated['base']['x'], p2_updated['player']['x'], delta=0.5)
                self.assertAlmostEqual(p2_updated['base']['y'], p2_updated['player']['y'], delta=0.5)

                # Now facility construction succeeds
                rt.sessions['player2-session']['last_command'] = 0
                status, snap = rt.execute_action('player2-session', {'action': 'build', 'facility': 'kitchen'})
                self.assertEqual(status, 200)
                p2_updated = rt._profile_for('player2-session')
                self.assertEqual(p2_updated['base']['facilities']['kitchen'], 1)
            finally:
                rt.store.close()

    def test_territory_development_is_isolated_and_saved_with_account(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('player2-session')

                # Player 2 chooses species and proclaims base
                status, snap = rt.execute_action('player2-session', {'action': 'choose', 'species': 'human'})
                self.assertEqual(status, 200)

                rt.sessions['player2-session']['last_command'] = 0
                rt.peers['player2-session']['player'].update(x=58., y=14.)
                status, snap = rt.execute_action('player2-session', {'action': 'claim_base'})
                self.assertEqual(status, 200)

                # Reset rate limit timer for test
                rt.sessions['player2-session']['last_command'] = 0

                # Give materials to Player 2 and build kitchen
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
                self.assertTrue(saved_acc['base']['established'])
                self.assertIsNotNone(saved_acc['base']['x'])
                self.assertIsNotNone(saved_acc['base']['y'])

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
                self.assertTrue(restored_base['established'])
                self.assertEqual(restored_base['x'], saved_acc['base']['x'])
                self.assertEqual(restored_base['y'], saved_acc['base']['y'])
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
                rt.execute_action('temp-session', {'action': 'claim_base'})
                rt.sessions['temp-session']['last_command'] = 0
                rt.peers['temp-session']['inventory']['wood'] = 20
                rt.peers['temp-session']['inventory']['metal'] = 20
                rt.execute_action('temp-session', {'action': 'build', 'facility': 'kitchen'})

                # Player did not save account!
                self.assertIsNone(rt.store.load_account('temp-session', 'any'))

                # A fresh adventurer starting later gets a fresh Lv.0 unproclaimed base
                rt.authorize('temp-session-2')
                p2 = rt._profile_for('temp-session-2')
                self.assertEqual(p2['base']['facilities']['kitchen'], 0)
                self.assertFalse(p2['base']['established'])
            finally:
                rt.store.close()

    def test_claim_base_restrictions(self):
        with tempfile.TemporaryDirectory() as td:
            rt = Runtime(Path(td)/'world.sqlite3')
            try:
                rt.authorize('host-session')
                rt.authorize('wanderer-session')
                rt.execute_action('wanderer-session', {'action': 'choose', 'species': 'human'})

                # Cannot claim base at boundary (< 4.0)
                rt.sessions['wanderer-session']['last_command'] = 0
                rt.peers['wanderer-session']['player']['x'] = 2.0
                rt.peers['wanderer-session']['player']['y'] = 2.0
                status, snap = rt.execute_action('wanderer-session', {'action': 'claim_base'})
                self.assertEqual(status, 400)
                self.assertIn('경계', snap['error'])

                # Cannot claim base too close to enemy spawn (ENEMY_SPAWNS[0] is (42, 12))
                ex, ey = ENEMY_SPAWNS[0]
                rt.sessions['wanderer-session']['last_command'] = 0
                rt.peers['wanderer-session']['player']['x'] = float(ex)
                rt.peers['wanderer-session']['player']['y'] = float(ey)
                status, snap = rt.execute_action('wanderer-session', {'action': 'claim_base'})
                self.assertEqual(status, 400)
                self.assertTrue('감염체 서식지' in snap['error'] or '주변에 적이 있어' in snap['error'])
            finally:
                rt.store.close()


if __name__ == '__main__':
    unittest.main()

import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, tick
from server.main import Runtime, PROFILE_KEYS
from server.storage import Store


class ActivityLogTests(unittest.TestCase):
    def test_actions_and_restart_keep_each_players_history_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'save.sqlite3'
            runtime = Runtime(path)
            def action(token, command):
                runtime.last_command = 0
                if token in runtime.sessions:
                    runtime.sessions[token]['last_command'] = 0
                status, state = runtime.execute_action(token, command)
                self.assertEqual(status, 200)
                return state['world']['log'][:]
            try:
                host_log = action('host-session', {'action': 'choose', 'species': 'human'})
                peer_log = action('peer-session', {'action': 'choose', 'species': 'vampire'})
                self.assertEqual(runtime.snapshot('host-session')['world']['log'], host_log)
                self.assertNotEqual(host_log, peer_log)
                peer_log = action('peer-session', {'action': 'consume', 'item': 'blood'})
                self.assertEqual(peer_log[0], '원혈 사용')
                self.assertEqual(runtime.snapshot('host-session')['world']['log'], host_log)
            finally:
                runtime.store.close()
            runtime = Runtime(path)
            try:
                self.assertEqual(runtime.world['log'], host_log)
                self.assertEqual(runtime.peers['peer-session']['log'], peer_log)
            finally:
                runtime.store.close()

    def test_background_rewards_damage_and_rescue_belong_to_target(self):
        w = new_world(); w['player']['chosen'] = True
        peer = {key: copy.deepcopy(w[key]) for key in PROFILE_KEYS}
        peer['log'] = []; peer['dispatch'] = {'ends': 0, 'species': 'human'}
        enemy = w['enemies'][0]
        peer['player'].update(x=enemy['x']+.5, y=enemy['y'])
        before = w['log'][:]
        tick(w, .1, extra_profiles=[peer])
        self.assertEqual(w['log'], before)
        self.assertTrue(any('파견 복귀' in m for m in peer['log']))
        self.assertTrue(any('공격' in m for m in peer['log']))
        peer['player']['hp'] = 0
        tick(w, .1, extra_profiles=[peer])
        self.assertIn('전투 불능', peer['log'][0])
        self.assertEqual(w['log'], before)

    def test_old_peer_and_account_without_logs_do_not_inherit_host_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'save.sqlite3'
            w = new_world(); w['log'] = ['host-only-message']
            profile = {key: copy.deepcopy(w[key]) for key in PROFILE_KEYS if key != 'log'}
            store = Store(path); store.save(w); store.save_peer('old-peer', profile)
            store.save_account('old-player', 'test-password', profile); store.close()
            runtime = Runtime(path)
            try:
                self.assertEqual(runtime.peers['old-peer']['log'], [])
                self.assertEqual(runtime.store.load_peers()['old-peer']['log'], [])
                candidate = copy.deepcopy(w)
                runtime._handle_account_action(candidate, {'action': 'account_load', 'username': 'old-player', 'password': 'test-password'}, False)
                self.assertFalse(any('host-only' in m for m in candidate['log']))
                self.assertEqual(candidate['inventory'], profile['inventory'])
            finally:
                runtime.store.close()

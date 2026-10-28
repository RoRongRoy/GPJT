import copy
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from server.game import new_world, RuleError
from server.movement import MovementInputs, INPUT_LEASE
from server.main import Runtime
from server.worldmap import MOVEMENT, SIZE


class MovementInputTests(unittest.TestCase):
    def setUp(self):
        self.world = new_world(); self.world['player']['chosen'] = True
        self.inputs = MovementInputs()

    def send(self, seq, dx, dy, now=10):
        return self.inputs.receive(self.world, self.world, 'player', {'seq':seq,'dx':dx,'dy':dy}, now)

    def test_packet_frequency_does_not_change_speed_and_diagonals_are_normalized(self):
        speed = MOVEMENT['step']/MOVEMENT['interval']
        for packet_count in (1, 10, 100):
            self.setUp(); start = copy.deepcopy(self.world['player'])
            for i in range(packet_count):self.send(i+1, 1, -1, 10+i*.3/packet_count)
            self.inputs.advance(self.world, self.world, 'player', 10.3)
            self.assertAlmostEqual(math.hypot(self.world['player']['x']-start['x'], self.world['player']['y']-start['y']), speed*.3)

    def test_newest_stop_wins_over_reordered_and_duplicate_packets(self):
        self.send(1, 1, 0)
        self.send(3, 0, 0, 10.1)
        stopped = copy.deepcopy(self.world['player'])
        self.send(2, -1, 0, 10.2); self.send(3, 1, 0, 10.3)
        self.inputs.advance(self.world, self.world, 'player', 11)
        self.assertEqual(stopped, self.world['player'])
        self.send(4, -1, 0, 11)
        self.inputs.advance(self.world, self.world, 'player', 11.1)
        self.assertLess(self.world['player']['x'], stopped['x'])

    def test_lost_release_expires_and_cannot_catch_up_after_stall(self):
        x = self.world['player']['x']; self.send(1, 1, 0)
        self.inputs.advance(self.world, self.world, 'player', 15)
        self.assertAlmostEqual(self.world['player']['x']-x, MOVEMENT['step']/MOVEMENT['interval']*INPUT_LEASE)
        x = self.world['player']['x']
        self.inputs.advance(self.world, self.world, 'player', 30)
        self.assertEqual(self.world['player']['x'], x)
        self.assertEqual(self.inputs.snapshot('player', 30)['dx'], 0)

    def test_invalid_inputs_pause_and_bounds(self):
        for data in ({}, {'seq':True,'dx':1,'dy':0}, {'seq':1,'dx':True,'dy':0}, {'seq':1,'dx':2,'dy':0}, {'seq':float('inf'),'dx':1,'dy':0}, {'seq':1,'dx':1,'dy':0,'sprint':2}):
            with self.assertRaises(RuleError):self.inputs.receive(self.world,self.world,'p',data,10)
        self.world['paused'] = True
        with self.assertRaises(RuleError):self.send(1,1,0)
        self.send(2,0,0)
        self.world['paused'] = False
        self.world['player'].update(x=SIZE-2,y=SIZE-2)
        self.send(3,1,1)
        self.inputs.advance(self.world,self.world,'player',10.2)
        self.assertEqual(self.world['player']['x'],SIZE-2)
        self.assertEqual(self.world['player']['y'],SIZE-2)

    def test_mount_speed_blood_cost_and_auto_dismount(self):
        p = self.world['player']; p.update(species='vampire',mounted=True,blood=6)
        x = p['x']; self.send(1,1,0)
        self.inputs.advance(self.world,self.world,'player',10.2)
        self.assertAlmostEqual(p['x']-x, MOVEMENT['step']/MOVEMENT['interval']*.2*MOVEMENT['mount_base'])
        self.assertAlmostEqual(p['blood'],6-.18*.2/MOVEMENT['interval'])
        p['blood']=5; self.send(2,1,0,10.2)
        self.inputs.advance(self.world,self.world,'player',10.3)
        self.assertFalse(p['mounted'])

    def test_discrete_and_continuous_movement_cannot_stack_speed(self):
        x=self.world['player']['x']
        self.world['player']['x'] += MOVEMENT['step']
        self.inputs.block_after_step('player',10)
        self.send(1,1,0,10.01)
        self.inputs.advance(self.world,self.world,'player',10.1)
        self.assertAlmostEqual(self.world['player']['x']-x, MOVEMENT['step']/MOVEMENT['interval']*.1)
        with self.assertRaises(RuleError):self.inputs.check_step('player',10.1)
        self.send(2,0,0,10.1)
        self.inputs.check_step('player',10.19)

    def test_sprint_changes_speed_without_packet_frequency_bonus(self):
        speed=MOVEMENT['step']/MOVEMENT['interval']
        for mounted in (False,True):
            self.setUp();p=self.world['player'];p['mounted']=mounted;x=p['x']
            for i in range(20):
                self.inputs.receive(self.world,self.world,'player',{'seq':i+1,'dx':1,'dy':0,'sprint':True},10+i*.01)
            self.inputs.advance(self.world,self.world,'player',10.2)
            mult=MOVEMENT['mount_base']*1.25 if mounted else MOVEMENT['sprint_mult']
            self.assertAlmostEqual(p['x']-x,speed*.2*mult)
            self.assertTrue(self.inputs.snapshot('player',10.2)['sprint'])
            self.send(21,1,0,10.2);x=p['x']
            self.inputs.advance(self.world,self.world,'player',10.3)
            self.assertAlmostEqual(p['x']-x,speed*.1*(MOVEMENT['mount_base'] if mounted else 1))

    def test_runtime_pause_stops_all_players_without_resuming_held_input(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Runtime(Path(directory)/'save.sqlite3')
            try:
                runtime.authorize('first-player-session');runtime.world['player']['chosen']=True
                runtime.authorize('second-player-session');runtime.peers['second-player-session']['player']['chosen']=True
                with patch('server.main.time.monotonic',return_value=10):
                    runtime.receive_input('second-player-session',{'seq':1,'dx':1,'dy':0})
                    self.assertEqual(runtime.execute_action('first-player-session',{'action':'pause'})[0],200)
                with patch('server.main.time.monotonic',return_value=10.1):
                    self.assertEqual(runtime.execute_action('first-player-session',{'action':'pause'})[0],200)
                x=runtime.peers['second-player-session']['player']['x']
                runtime.advance_inputs(10.3)
                self.assertEqual(runtime.peers['second-player-session']['player']['x'],x)
            finally:runtime.store.close()

    def test_runtime_sessions_action_barrier_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'save.sqlite3'; runtime=Runtime(path)
            try:
                runtime.authorize('first-player-session');runtime.world['player']['chosen']=True
                runtime.authorize('second-player-session');peer=runtime.peers['second-player-session'];peer['player']['chosen']=True
                with patch('server.main.time.monotonic',return_value=10):
                    self.assertEqual(runtime.receive_input('second-player-session',{'seq':1,'dx':1,'dy':0})[0],200)
                host_x=runtime.world['player']['x'];peer_x=peer['player']['x']
                runtime.advance_inputs(10.1)
                self.assertEqual(runtime.world['player']['x'],host_x);self.assertGreater(peer['player']['x'],peer_x)
                with patch('server.main.time.monotonic',return_value=10.2):
                    status,_=runtime.execute_action('second-player-session',{'action':'attack','input_seq':3})
                    self.assertEqual(status,200)
                peer_x=runtime.peers['second-player-session']['player']['x']
                with patch('server.main.time.monotonic',return_value=10.3):
                    runtime.receive_input('second-player-session',{'seq':2,'dx':1,'dy':0})
                runtime.advance_inputs(11)
                self.assertEqual(runtime.peers['second-player-session']['player']['x'],peer_x)
            finally:runtime.store.close()
            runtime=Runtime(path)
            try:self.assertEqual(runtime.movement.inputs,{})
            finally:runtime.store.close()

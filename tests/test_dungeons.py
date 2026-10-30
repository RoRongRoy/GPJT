import copy
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch
from server.main import Runtime
from server.game import tick, move_actor
from server import dungeons


class DungeonTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'world.sqlite3'
        self.r=Runtime(self.path)
        self.r.world['player'].update(chosen=True,combat_level=100,x=340,y=330)
        self.r.authorize('owner')

    def tearDown(self):
        self.r.store.close();self.tmp.cleanup()

    def run_action(self,action,token='owner',**fields):
        self.r.last_command=0
        if token in self.r.sessions:self.r.sessions[token]['last_command']=0
        return self.r.execute_action(token,dict(action=action,**fields))

    def test_previous_field_layout_is_preserved(self):
        from server.worldmap import POIS, ENEMY_SPAWNS
        data=[[(p['id'],94 if p['id']=='vampire' else p['x'],86 if p['id']=='vampire' else p['y']) for p in POIS[:177]],ENEMY_SPAWNS[:95]]
        self.assertEqual(hashlib.sha256(json.dumps(data).encode()).hexdigest(),'50961ffa413b36327cb7832dcaf1bca8e25c7d3750e8bdadbf9d7da776bce3b7')

    def test_entry_record_rolls_back_with_failed_world_save(self):
        self.r.store.save(self.r.world)
        self.r.store.db.execute("CREATE TRIGGER fail_world BEFORE UPDATE ON world BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):self.run_action('dungeon_enter',dungeon='bunker')
        self.assertNotIn('dungeon',self.r.world['player'])
        self.assertEqual(self.r.snapshot()['dungeons']['bunker']['used'],0)

    def test_entry_private_combat_loot_bounds_and_return(self):
        enemies=copy.deepcopy(self.r.world['enemies']);drops=copy.deepcopy(self.r.world.get('drops',[]))
        status,snap=self.run_action('dungeon_enter',dungeon='bunker')
        self.assertEqual(status,200);self.assertEqual(snap['map']['size'],64)
        self.assertEqual(snap['pois'],[]);self.assertFalse(snap['world']['base']['established'])
        self.assertEqual(snap['dungeons']['bunker']['used'],1)
        self.r.world['player'].update(x=15,y=13)
        self.assertEqual(self.run_action('attack')[0],200)
        self.assertLess(self.r.world['player']['dungeon']['enemies'][0]['hp'],snap['world']['enemies'][0]['hp'])
        self.assertEqual(self.r.world['enemies'],enemies);self.assertEqual(self.r.world.get('drops',[]),drops)
        move_actor(self.r.world,1,1,1000)
        self.assertLessEqual(self.r.world['player']['x'],62)
        self.assertEqual(self.run_action('claim_base')[0],400)
        self.assertEqual(self.run_action('dungeon_leave')[0],200)
        self.assertEqual((self.r.world['player']['x'],self.r.world['player']['y']),(340,330))
        self.assertEqual(self.r.snapshot()['map']['size'],544)

    def test_daily_limit_restart_and_server_calendar(self):
        with patch('server.dungeons.calendar_day',return_value='2026-10-30'):
            for _ in range(3):
                self.assertEqual(self.run_action('dungeon_enter',dungeon='bunker')[0],200)
                self.assertEqual(self.run_action('dungeon_leave')[0],200)
            before=copy.deepcopy(self.r.world)
            self.assertEqual(self.run_action('dungeon_enter',dungeon='bunker')[0],400)
            self.assertEqual(self.r.world,before)
            self.r.store.close();self.r=Runtime(self.path);self.r.authorize('owner')
            self.assertEqual(self.run_action('dungeon_enter',dungeon='bunker')[0],400)
        with patch('server.dungeons.calendar_day',return_value='2026-10-31'):
            self.assertEqual(self.run_action('dungeon_enter',dungeon='bunker')[0],200)
        self.assertEqual(dungeons.calendar_day(datetime(2026,10,30,14,59,tzinfo=timezone.utc)),'2026-10-30')
        self.assertEqual(dungeons.calendar_day(datetime(2026,10,30,15,0,tzinfo=timezone.utc)),'2026-10-31')

    def test_failed_entry_does_not_charge_and_sessions_are_isolated(self):
        self.r.world['player']['combat_level']=1
        self.assertEqual(self.run_action('dungeon_enter',dungeon='crypt')[0],400)
        self.assertEqual(self.r.snapshot()['dungeons']['crypt']['used'],0)
        self.r.world['player']['combat_level']=100
        self.assertEqual(self.run_action('dungeon_enter',dungeon='crypt')[0],200)
        self.r.authorize('peer');self.r.peers['peer']['player'].update(chosen=True,combat_level=100)
        self.assertEqual(self.run_action('dungeon_enter',token='peer',dungeon='crypt')[0],200)
        self.assertIsNot(self.r.world['player']['dungeon'],self.r.peers['peer']['player']['dungeon'])
        self.r.world['player']['dungeon']['enemies'][0]['hp']=0
        self.assertGreater(self.r.snapshot('peer')['world']['enemies'][0]['hp'],0)
        self.assertEqual(self.r.snapshot('peer')['others'],[])
        self.run_action('dungeon_leave',token='peer')
        self.assertFalse(any(o['id']=='owner' for o in self.r.snapshot('peer')['others']))

    def test_completion_reward_once_and_death_timeout(self):
        self.run_action('dungeon_enter',dungeon='abyss')
        self.assertEqual(self.run_action('dungeon_claim')[0],400)
        for e in self.r.world['player']['dungeon']['enemies']:e['hp']=0
        before=self.r.world['inventory']['gold']
        self.assertEqual(self.run_action('dungeon_claim')[0],200)
        self.assertEqual(self.r.world['inventory']['gold'],before+500)
        self.assertEqual(self.run_action('dungeon_claim')[0],400)
        self.r.world['player']['dungeon']['remaining']=.1
        tick(self.r.world,1)
        self.assertNotIn('dungeon',self.r.world['player'])
        self.run_action('dungeon_enter',dungeon='bunker')
        self.r.world['player']['hp']=0
        tick(self.r.world,1)
        self.assertNotIn('dungeon',self.r.world['player'])
        self.assertGreater(self.r.world['player']['hp'],0)

    def test_field_enemies_cannot_attack_instance_player_and_save_preserves_instance(self):
        self.run_action('dungeon_enter',dungeon='bunker')
        for e in self.r.world['player']['dungeon']['enemies']:e['stunned_until']=99999
        self.r.world['enemies'][0].update(x=7,y=7,damage=999)
        hp=self.r.world['player']['hp'];tick(self.r.world,1)
        self.assertEqual(self.r.world['player']['hp'],hp)
        self.r.store.save(self.r.world);loaded=self.r.store.load()
        self.assertEqual(loaded['player']['dungeon'],self.r.world['player']['dungeon'])

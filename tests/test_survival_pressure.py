import copy
import unittest
from server.game import new_world, _tick_actor, act, move_actor, damage_enemy, tick, RuleError, RECIPES
from server.worldmap import POIS, TOWNS
from server.survival import DRAIN


class SurvivalPressureTests(unittest.TestCase):
    def world(self,species='human'):
        w=new_world();w['player'].update(chosen=True,species=species,x=120,y=120)
        return w

    def test_ten_minute_expedition_and_safe_town(self):
        for species,keys in [('human',('food','water')),('vampire',('blood','stability'))]:
            w=self.world(species);p=w['player']
            for _ in range(600):_tick_actor(w,w,1)
            for key in keys:self.assertAlmostEqual(p[key],90-600*DRAIN[key])
            town=TOWNS[species];p.update(x=town['x'],y=town['y'])
            before={k:p[k] for k in keys}
            for _ in range(60):_tick_actor(w,w,1)
            self.assertEqual(before,{k:p[k] for k in keys})

    def test_low_supplies_limit_regeneration_and_zero_damages(self):
        w=self.world();p=w['player'];p.update(food=20,water=20,mp=0)
        _tick_actor(w,w,1);self.assertAlmostEqual(p['mp'],.35)
        p.update(water=0,hp=50,mp=0);_tick_actor(w,w,1)
        self.assertEqual(p['mp'],0);self.assertAlmostEqual(p['hp'],49.2)
        w=self.world('vampire');p=w['player'];p.update(blood=20,hp=50)
        _tick_actor(w,w,1);self.assertEqual(p['hp'],50)
        p.update(blood=90,hp=50);_tick_actor(w,w,1)
        self.assertAlmostEqual(p['hp'],50.6);self.assertAlmostEqual(p['blood'],90-.12-.15)

    def test_sprint_cost_scales_with_time_and_pause_stops_decay(self):
        w=self.world();normal=copy.deepcopy(w)
        move_actor(w,1,0,1,sprint=True);move_actor(normal,1,0,1)
        self.assertAlmostEqual(normal['player']['water']-w['player']['water'],.18)
        w['paused']=True;before=copy.deepcopy(w);tick(w,1);self.assertEqual(w,before)

    def test_resource_restock_and_no_free_blood_on_attack(self):
        for kind in ('water','crop','blood'):
            node=next(p for p in POIS if p['kind']==kind and not p.get('site_type'))
            self.assertEqual(node['loot'][kind],1);self.assertGreaterEqual(node['seconds'],180)
            w=self.world();w['player'].update(x=node['x'],y=node['y'])
            act(w,{'action':'gather','id':node['id']});w['elapsed']+=4
            before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']})
            self.assertEqual(w,before)
        w=self.world('vampire');p=w['player'];p.update(hp=50,blood=60)
        for e in w['enemies']:e.update(x=300,y=300)
        w['enemies'][0].update(x=121,y=120,hp=1000,max_hp=1000,faction='infected')
        act(w,{'action':'attack'})
        self.assertGreater(p['hp'],50);self.assertLessEqual(p['blood'],60)

    def test_high_level_monsters_do_not_guarantee_blood_packs(self):
        for roll,expected in [(.5,0),(.01,1)]:
            w=self.world('vampire');e=w['enemies'][0];e.update(hp=1,level=100)
            damage_enemy(w,e,10,rng=lambda:roll)
            self.assertEqual(sum(d['items'].get('elixir',0) for d in w['drops']),expected)
        self.assertEqual(RECIPES['culture_blood']['amount'],2)
        self.assertEqual(RECIPES['culture_blood']['seconds'],180)

import copy
import math
import unittest
from server.game import new_world,act,move_actor,RuleError
from server.mobility import MOBILITY
from server.worldmap import MOVEMENT
from server.settlement import FACILITY_SPECS


class MobilityTests(unittest.TestCase):
    def world(self,species):
        w=new_world();w['player'].update(chosen=True,species=species)
        w['player'].update(x=w['base']['x'],y=w['base']['y'])
        for key in w['inventory']:w['inventory'][key]=100
        return w

    def test_upgrade_requires_own_facility_and_materials_atomically(self):
        for species in MOBILITY:
            w=self.world(species);saved=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'research'})
            self.assertEqual(w,saved)
            act(w,{'action':'build','facility':'mobility'})
            w['player']['x']+=30;saved=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'research'})
            self.assertEqual(w,saved);w['player']['x']-=30
            item=next(iter(MOBILITY[species]['cost']));w['inventory'][item]=0;saved=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'research'})
            self.assertEqual(w,saved);w['inventory'][item]=100
            before=copy.deepcopy(w['inventory']);act(w,{'action':'research'})
            self.assertEqual(w['player']['unlocks'][species],1)
            for key,amount in MOBILITY[species]['cost'].items():self.assertEqual(w['inventory'][key],before[key]-amount)
            saved=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'research'})
            with self.assertRaises(RuleError):act(w,{'action':'build','facility':'mobility'})
            self.assertEqual(w,saved)

    def test_real_speed_ratios_and_legacy_research_cap(self):
        for species in MOBILITY:
            for tier,ratio in [(0,2.8),(1,4.2),(2,4.2)]:
                for sprint in [False,True]:
                    w=self.world(species);p=w['player'];p.update(x=150,y=150,mounted=True,blood=100)
                    p['unlocks'][species]=tier
                    move_actor(w,1,1,.5,sprint)
                    distance=math.hypot(p['x']-150,p['y']-150)
                    self.assertAlmostEqual(distance,MOVEMENT['step']/MOVEMENT['interval']*.5*ratio*(1.25 if sprint else 1))
                    self.assertGreater(ratio,MOVEMENT['sprint_mult']*1.5)
                    self.assertEqual(p['unlocks'][species],tier)
        self.assertEqual(FACILITY_SPECS['mobility']['max_level'],1)

    def test_precision_approach_cannot_exceed_server_speed(self):
        for pace in [0,-1,1.01,float('nan'),True,'1']:
            w=self.world('human');before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'move','dx':1,'dy':0,'pace':pace})
            self.assertEqual(w,before)
        w=self.world('human');w['player']['mounted']=True
        start=w['player']['x']
        act(w,{'action':'move','dx':1,'dy':0,'pace':.25})
        self.assertAlmostEqual(w['player']['x']-start,MOVEMENT['step']*2.8*.25)

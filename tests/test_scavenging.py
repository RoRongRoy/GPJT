import copy
import math
import unittest
from server.game import new_world, act, RuleError
from server.worldmap import POIS, WORLD_MAP, live_pois
from server.settlement import SEARCH_SITES
from server.scavenging import NEW_SITES, SITE_ART
from server.resources import FARM_MATERIALS


class ScavengingTests(unittest.TestCase):
    def test_twice_as_many_types_have_real_landmarks_and_unique_art(self):
        self.assertEqual(len(SEARCH_SITES), 40)
        self.assertEqual(len(NEW_SITES), 20)
        self.assertEqual(len({s['frame'] for s in SITE_ART.values()}), 20)
        self.assertTrue(set(NEW_SITES) <= {p.get('site_type') for p in POIS})
        self.assertEqual(WORLD_MAP['scavenging_types'], 40)
        for key, (_, _, loot, _) in SEARCH_SITES.items():
            self.assertTrue(loot, key)
            self.assertTrue(set(loot) <= FARM_MATERIALS.keys(), key)

    def test_every_new_site_supports_selective_farming_and_atomic_cooldowns(self):
        for key in NEW_SITES:
            with self.subTest(site=key):
                node=next(p for p in POIS if p.get('site_type')==key)
                w=new_world();w['player'].update(chosen=True,x=node['x'],y=node['y'])
                w['inventory']={}
                item=next(iter(node['loot']))
                act(w,{'action':'gather','id':node['id'],'items':[item]})
                self.assertEqual(w['inventory'],{item:node['loot'][item]})
                before=copy.deepcopy(w)
                with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']})
                self.assertEqual(w,before)
                w['elapsed']=w['cooldowns'][node['id']]
                act(w,{'action':'gather','id':node['id'],'items':[item]})
                self.assertEqual(w['inventory'][item],node['loot'][item]*2)
                w['player']['x']+=10
                before=copy.deepcopy(w)
                with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']})
                self.assertEqual(w,before)

    def test_town_cave_and_personal_estate_exclusion(self):
        cave=next(p for p in POIS if p['id']=='salvage:vampire:bat_cave')
        w=new_world();w['player'].update(chosen=True,species='vampire',x=cave['x'],y=cave['y'])
        act(w,{'action':'gather','id':cave['id']})
        self.assertGreater(w['inventory']['limestone'],0)
        w['base'].update(x=cave['x'],y=cave['y'],established=True)
        self.assertNotIn(cave['id'],{p['id'] for p in live_pois(w)})
        for a in [n for n in POIS if n['id'].startswith('salvage:') and n is not cave]:
            self.assertTrue(all(math.hypot(a['x']-b['x'],a['y']-b['y'])>=10 for b in POIS if b['id']!=a['id']))

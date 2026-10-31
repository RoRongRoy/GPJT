import copy
import tempfile
import unittest
from pathlib import Path
from server.game import act, new_world, FACILITIES, RECIPES, ITEMS, RuleError
from server.settlement import MATERIALS, FACILITY_SPECS, SEARCH_SITES
from server.worldmap import POIS, region_at, live_pois
from server.storage import Store

class SettlementExpansionTests(unittest.TestCase):
    def world(self):
        w=new_world();w['player'].update(chosen=True,combat_level=100)
        w['player'].update(x=w['base']['x'],y=w['base']['y'])
        w['inventory']={k:10 for k in ITEMS if not k.startswith('skillbook_')};w['inventory']['gold']=1000
        return w

    def test_every_facility_and_recipe_has_real_output(self):
        self.assertEqual(len(FACILITIES),13);self.assertEqual(len(RECIPES),74)
        for key,spec in RECIPES.items():
            with self.subTest(recipe=key):
                w=self.world();facility=spec['facility']
                for _ in range(spec.get('level',1)):
                    for k in ITEMS:w['inventory'][k]=20
                    w['inventory'].update(wood=40,metal=40)
                    w['inventory']['gold']=1000
                    act(w,{'action':'build','facility':facility})
                w['inventory']={k:0 for k in ITEMS}
                w['inventory'].update(spec['cost'])
                before=copy.deepcopy(w)
                act(w,{'action':'craft','recipe':key})
                for k,v in spec['cost'].items():
                    if k!=spec.get('output',key):self.assertEqual(w['inventory'][k],before['inventory'][k]-v)
                if spec.get('gear_slot'):
                    self.assertEqual(w['gear'][-1]['slot'],spec['gear_slot'])
                    act(w,{'action':'equip','item':w['gear'][-1]['id']})
                else:
                    out=spec.get('output',key);self.assertEqual(w['inventory'][out],before['inventory'][out]+spec.get('amount',1)+spec.get('level',1)-1-spec['cost'].get(out,0))
                if spec.get('seconds'):
                    saved=copy.deepcopy(w)
                    with self.assertRaises(RuleError):act(w,{'action':'craft','recipe':key})
                    self.assertEqual(w,saved)

    def test_remote_level_capacity_and_upgrade_rules(self):
        w=self.world();w['base']['facilities']['archive']=2
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'craft','recipe':'restore_skillbook'})
        self.assertEqual(w,before)
        w['base']['facilities']['forge']=2
        act(w,{'action':'craft','recipe':'make_weapon'})
        self.assertEqual(w['gear'][-1]['power'],5)
        w['player']['x']+=20;before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'build','facility':'greenhouse'})
        with self.assertRaises(RuleError):act(w,{'action':'craft','recipe':'make_weapon'})
        self.assertEqual(w,before)

    def test_search_tables_replenishment_and_injection_rejection(self):
        sites=[n for n in POIS if n.get('site_type')]
        self.assertEqual(len(sites),281)
        for region in ('outskirts','forest','marsh','works'):
            self.assertEqual({n['site_type'] for n in sites if n['id'].startswith('search:') and region_at(n['x'],n['y'])['id']==region},set(list(SEARCH_SITES)[:12]))
        for node in sites:
            w=self.world();w['inventory']={k:0 for k in ITEMS};w['player'].update(x=node['x'],y=node['y'])
            before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id'],'items':['skillbook']})
            self.assertEqual(w,before)
            act(w,{'action':'gather','id':node['id']})
            for k,v in node['loot'].items():self.assertEqual(w['inventory'][k],v)
            before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']})
            self.assertEqual(w,before)
            w['elapsed']+=node['seconds'];act(w,{'action':'gather','id':node['id']})
            for k,v in node['loot'].items():self.assertEqual(w['inventory'][k],2*v)

    def test_old_save_missing_new_keys_and_partial_bag(self):
        w=self.world()
        for k in MATERIALS:w['inventory'].pop(k)
        w['base']['facilities']={k:0 for k in ('kitchen','alchemy','medical','storage')}
        node=next(n for n in POIS if n.get('site_type')=='mine')
        w['player'].update(x=node['x'],y=node['y']);act(w,{'action':'gather','id':node['id']})
        w['inventory']['ore']=10;w['player'].update(x=w['base']['x'],y=w['base']['y'])
        act(w,{'action':'build','facility':'forge'})
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'world.sqlite3');store.save(w);self.assertEqual(store.load(),w);store.close()
        w['inventory']={k:0 for k in ITEMS};w['player']['combat_level']=1;w['inventory']['wood']=159
        w['player'].update(x=node['x'],y=node['y']);w['elapsed']+=100
        act(w,{'action':'gather','id':node['id']})
        self.assertEqual(sum(v for k,v in w['inventory'].items() if k!='gold'),160)

    def test_new_sites_do_not_overlap_own_base(self):
        w=self.world();node=next(n for n in POIS if n.get('site_type')=='warehouse')
        w['base'].update(x=node['x'],y=node['y'],established=True)
        w['player'].update(x=node['x'],y=node['y'])
        self.assertNotIn(node,live_pois(w))
        with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']})
        w['base']['x']+=30
        self.assertIn(node,live_pois(w))

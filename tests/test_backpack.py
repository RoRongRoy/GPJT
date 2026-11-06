import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world,act,RuleError,ITEMS,RECIPES
from server.backpack import layout,item_spec,fit_amount
from server.storage import Store

class BackpackTests(unittest.TestCase):
    def world(self):
        w=new_world();act(w,{'action':'choose','species':'human'})
        w['player'].update(x=w['base']['x'],y=w['base']['y'],combat_level=100)
        return w

    def test_shapes_stack_limits_and_worn_items_share_one_layout(self):
        w=self.world()
        w['inventory']={'gold':999999,'wood':20,'engine_block':7,'water':21,'metal':11}
        pack=layout(w)
        self.assertEqual(pack['capacity'],120)
        self.assertFalse(pack['overflow'])
        occupied=set()
        for e in pack['entries']:
            for y in range(e['y'],e['y']+e['h']):
                for x in range(e['x'],e['x']+e['w']):
                    self.assertTrue(0<=x<pack['w'] and 0<=y<pack['h'])
                    self.assertNotIn((x,y),occupied);occupied.add((x,y))
        self.assertEqual(pack['used'],len(occupied))
        self.assertFalse(set(w['equipment'].values())&{e['id'] for e in pack['entries']})
        self.assertEqual([e['count'] for e in pack['entries'] if e['item']=='engine_block'],[5,2])
        self.assertEqual((item_spec('engine_block')['w'],item_spec('engine_block')['h']),(3,3))
        self.assertEqual((item_spec('wood')['w'],item_spec('wood')['h']),(3,2))
        self.assertEqual((item_spec('water')['w'],item_spec('water')['h']),(1,2))
        before=pack['total']
        act(w,{'action':'unequip','slot':'armor'})
        self.assertEqual(layout(w)['total'],before+9)

    def test_full_bag_partial_stack_and_failed_unequip_are_atomic(self):
        w=self.world();w['inventory']={'scroll':120*20-1}
        self.assertEqual(fit_amount(w,'scroll',10),1)
        self.assertEqual(fit_amount(w,'engine_block',1),0)
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'unequip','slot':'armor'})
        self.assertEqual(w,before)
        with self.assertRaises(RuleError):act(w,{'action':'unequip','slot':'backpack'})
        self.assertEqual(w,before)

    def test_rotation_overflow_and_save_preserve_old_assets(self):
        w=self.world();w['inventory']={'wood':10}
        e=next(e for e in layout(w)['entries'] if e['item']=='wood')
        act(w,{'action':'rotate_item','item':e['id']})
        rotated=next(e for e in layout(w)['entries'] if e['item']=='wood')
        self.assertEqual((rotated['w'],rotated['h']),(e['h'],e['w']))
        w['inventory']['wood']=300
        self.assertTrue(layout(w)['overflow'])
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'world.db');store.save(w);loaded=store.load();store.close()
        self.assertEqual(loaded['inventory'],w['inventory'])
        self.assertEqual(layout(loaded),layout(w))
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'rotate_item','item':'somebody-elses-item'})
        self.assertEqual(w,before)

    def test_crafting_research_then_learning_consumes_exact_book(self):
        w=self.world();w['base']['facilities']['archive']=3
        key='skillbook_human_warrior_hw_dawn';recipe=RECIPES['research_'+key]
        w['inventory']=dict(recipe['cost'])
        act(w,{'action':'craft','recipe':'research_'+key})
        self.assertEqual(w['inventory'][key],1)
        self.assertNotIn('human:warrior:hw_dawn',w['player']['learned_skills'])
        act(w,{'action':'consume','item':key})
        self.assertIn('human:warrior:hw_dawn',w['player']['learned_skills'])
        self.assertEqual(w['inventory'][key],0)

    def test_failed_crafting_keeps_costs_and_cooldowns(self):
        w=self.world();w['base']['facilities']['forge']=2
        # Ingredient stacks remain after spending, leaving no room for the output.
        recipe=RECIPES['make_weapon'];w['inventory']={k:v+1 for k,v in recipe['cost'].items()}
        used=layout(w)['used'];w['inventory']['scroll']=(120-used)*20
        self.assertFalse(layout(w)['overflow'])
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'craft','recipe':'make_weapon'})
        self.assertEqual(w,before)

    def test_special_find_has_real_site_and_cannot_repeat_during_cooldown(self):
        from server.worldmap import POIS
        from server.settlement import SEARCH_BONUSES,SEARCH_SITES
        self.assertLessEqual(set(SEARCH_BONUSES),set(SEARCH_SITES))
        node=next(n for n in POIS if n.get('site_type')=='car')
        w=self.world();w['inventory']={};w['player'].update(x=node['x'],y=node['y'])
        act(w,{'action':'gather','id':node['id']},lambda:0)
        self.assertGreater(w['inventory'].get('engine_block',0),0)
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'gather','id':node['id']},lambda:0)
        self.assertEqual(w,before)

    def test_high_level_backpack_drop_has_valid_tier(self):
        from server.equipment import roll_equipment
        w=self.world();values=iter([0,.8])
        gear=roll_equipment(w,{'level':100},lambda:next(values),collect=False)
        self.assertEqual(gear['slot'],'backpack');self.assertEqual(gear['tier'],3)
        w['gear'].append(gear);w['equipment']['backpack']=gear['id']
        self.assertEqual((layout(w)['w'],layout(w)['h']),(18,16))

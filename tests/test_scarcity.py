import copy
import unittest
from server.game import new_world,act,damage_enemy,RuleError,RECIPES,SHOP_BUY_CATALOG
from server.worldmap import POIS
from server.resources import extra_drop

class ScarcityTests(unittest.TestCase):
    def test_scroll_rates_single_stack_and_no_guaranteed_materials(self):
        for level,expected in [(1,3),(35,4),(60,5),(100,5)]:
            w=new_world();count=0
            for i in range(100):
                e=copy.deepcopy(w['enemies'][0]);e.update(level=level,hp=1,materials={'silver':3})
                rolls=iter([i/100,1,1])
                damage_enemy(w,e,1,lambda:next(rolls))
                items=w['drops'].pop()['items'];count+=items.get('scroll',0)
                self.assertLessEqual(items.get('scroll',0),1)
                self.assertEqual(items.get('silver',0), (1 if i < 35 else 0) + extra_drop(e,i/100).get('silver',0))
                if i>=45:self.assertNotIn('iron_fragment',items)
            self.assertEqual(count,expected)
        self.assertEqual(sum(bool(extra_drop({'level':100},i/100)) for i in range(100)),12)

    def test_quest_cannot_repeat_and_dispatch_has_no_scrolls(self):
        w=new_world();act(w,{'action':'choose','species':'human'})
        npc=next(n for n in w['npcs'] if n['kind']=='npc')
        w['player'].update(x=npc['x'],y=npc['y'])
        w['quest']['collected']=10
        start=w['inventory']['scroll']
        act(w,{'action':'quest'})
        self.assertEqual(w['inventory']['scroll'],start+1)
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,{'action':'quest'})
        self.assertEqual(w,before)
        w['elapsed']+=600
        act(w,{'action':'quest'})
        self.assertEqual(w['inventory']['scroll'],start+2)
        w['player'].update(x=w['base']['x'],y=w['base']['y'])
        act(w,{'action':'dispatch'})
        self.assertEqual(w['dispatch']['ends']-w['elapsed'],300)

    def test_scroll_production_and_search_limits_are_visible_in_catalog(self):
        for recipe in RECIPES.values():
            if recipe.get('output')=='scroll':
                self.assertTrue(recipe['fixed_yield'])
                self.assertGreaterEqual(recipe['seconds'],120)
        for offers in SHOP_BUY_CATALOG.values():
            self.assertEqual(next(o for o in offers if o['item']=='scroll')['price'],800)
        for node in POIS:
            if node['kind']=='npc':continue
            self.assertGreaterEqual(node['seconds'],300 if node.get('site_type') else 180)
        w=new_world()
        self.assertEqual(w['inventory']['scroll'],3)

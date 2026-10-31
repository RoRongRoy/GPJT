import copy
import math
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, act, damage_enemy, POI_CONTENTS, RECIPES, RuleError
from server.resources import FARM_MATERIALS, DROP_ITEMS, ENHANCEMENT, extra_drop, facility_cost
from server.settlement import FACILITY_SPECS
from server.worldmap import POIS, TOWNS, MERCHANTS, migrate_profile_layout
from server.storage import Store


class ResourceEconomyTests(unittest.TestCase):
    def test_every_object_only_gives_farming_and_all_42_have_building_uses(self):
        found=set()
        for node in POIS:
            if node['kind']=='npc':continue
            w=new_world();w['player'].update(chosen=True,x=node['x'],y=node['y'])
            w['base']['established']=False;w['inventory']={}
            act(w,dict(action='gather',id=node['id']))
            found.update(w['inventory'])
            self.assertLessEqual(set(w['inventory']),set(FARM_MATERIALS))
        self.assertEqual(found,set(FARM_MATERIALS));self.assertEqual(len(found),42)
        uses={key for spec in FACILITY_SPECS.values() for level in range(3) for key in facility_cost(spec,level)}
        self.assertEqual(uses,set(FARM_MATERIALS))
        # A stale client cannot request a former scroll in an object.
        w=new_world();node=POIS[0];w['player'].update(chosen=True,x=node['x'],y=node['y'])
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,dict(action='gather',id=node['id'],items=['scroll']))
        self.assertEqual(w,before)

    def test_monster_loot_has_79_reachable_types_without_building_materials(self):
        found=set();w=new_world()
        for level in (1,15,35,60,100):
            for step in range(100):
                enemy=copy.deepcopy(w['enemies'][0]);enemy.update(level=level,hp=1,materials={})
                damage_enemy(w,enemy,1,lambda:step/400)
                drop=w['drops'].pop()['items'];found.update(drop)
                self.assertLessEqual(set(drop),set(DROP_ITEMS))
        from server.game import SKILL_BOOKS
        from server.skillbooks import roll_book
        for faction in ('human','vampire'):
            found.update(roll_book(SKILL_BOOKS,faction,100,i/100) for i in range(101))
        self.assertEqual(found,set(DROP_ITEMS));self.assertEqual(len(found),79)
        self.assertFalse(set(FARM_MATERIALS)&set(DROP_ITEMS))
        for r in RECIPES.values():
            if r.get('gear_slot'):self.assertLessEqual(set(r['cost']),set(DROP_ITEMS))
        self.assertNotIn('ancient_core',{key for i in range(100) for key in extra_drop({'level':1},i/400)})

    def test_catalysts_raise_chance_and_spend_atomically(self):
        for key in ENHANCEMENT:
            w=new_world();w['player'].update(chosen=True,x=w['base']['x'],y=w['base']['y'],level=6,pity=0)
            from server.game import ensure_starter_gear
            ensure_starter_gear(w)
            w['player'].update(x=w['base']['x'],y=w['base']['y'])
            w['gear'][0].update(enhancement=6,enhancement_pity=0)
            w['inventory'].update(scroll=3,**{key:1})
            act(w,dict(action='enhance',catalyst=key),lambda:.61)
            self.assertEqual(w['gear'][0]['enhancement'],7)
            self.assertEqual(w['inventory'][key],0);self.assertEqual(w['inventory']['scroll'],0)
            before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,dict(action='enhance',catalyst=key))
            self.assertEqual(w,before)
        for invalid in ([],{},'wood'):
            w=new_world();w['player'].update(chosen=True,x=w['base']['x'],y=w['base']['y'])
            before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,dict(action='enhance',catalyst=invalid))
            self.assertEqual(w,before)

    def test_rightmost_town_starter_safety_and_save_migration(self):
        town=TOWNS['vampire'];self.assertEqual(town['x'],518)
        self.assertTrue(all(m['x']>500 for m in MERCHANTS if m['faction']=='vampire'))
        w=new_world();act(w,dict(action='choose',species='vampire'))
        self.assertEqual((w['player']['x'],w['player']['y']),town['spawn'])
        starters=[e for e in w['enemies'] if math.hypot(e['x']-518,e['y']-44)<48]
        self.assertGreaterEqual(len(starters),2)
        for e in starters:
            self.assertLessEqual(e['level'],5);self.assertLessEqual(e['max_hp'],132)
            self.assertGreater(math.hypot(e['x']-518,e['y']-44),20)
        w.pop('town_revision');w['player'].pop('town_revision');w['player'].update(x=176,y=46)
        w['base'].update(x=210,y=90);w['inventory']['wood']=987
        npc=next(n for n in w['npcs'] if n['id']=='vampire');npc.update(x=94,y=86,home_x=94,home_y=86)
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'world.db');store.save(w);store.save_peer('legacy',copy.deepcopy(w))
            store.save_account('legacy','test-password',copy.deepcopy(w))
            loaded=store.load()
            self.assertEqual(loaded['player']['x'],518)
            self.assertEqual(loaded['base'],w['base']);self.assertEqual(loaded['inventory'],w['inventory'])
            self.assertEqual(next(n for n in loaded['npcs'] if n['id']=='vampire')['home_x'],518)
            for profile in (store.load_peers()['legacy'],store.load_account('legacy','test-password')):
                self.assertEqual(profile['player']['x'],518)
                before=copy.deepcopy(profile);migrate_profile_layout(profile);self.assertEqual(profile,before)
            store.save(loaded);self.assertEqual(store.load(),loaded);store.close()
        outside=copy.deepcopy(w);outside['player'].update(x=320,y=320)
        migrate_profile_layout(outside);self.assertEqual(outside['player']['x'],320)

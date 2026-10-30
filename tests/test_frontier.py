import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, gain_xp, act, damage_enemy, RuleError, ITEMS, RECIPES
from server.worldmap import POIS, ENEMY_SPAWNS, REGIONS, SIZE, new_enemy, region_at
from server.frontier import GEAR_MODELS, MATERIALS, CONSUMABLES, SITE_LEVELS
from server.equipment import roll_equipment
from server.storage import Store


class FrontierTests(unittest.TestCase):
    def world(self):
        w=new_world();w['player'].update(chosen=True,combat_level=100,hp=30,mp=20,infection=100)
        w['player'].update(x=w['base']['x'],y=w['base']['y'])
        w['base']['facilities']={key:3 for key in w['base']['facilities']}
        w['inventory']={key:20 for key in ITEMS}
        return w

    def test_old_positions_are_identical_and_expansion_has_room(self):
        # Fingerprint from the previous shipped layout, before adding frontier content.
        legacy=[[(p['id'],p['x'],p['y']) for p in POIS[:77]],ENEMY_SPAWNS[:35]]
        self.assertEqual(hashlib.sha256(json.dumps(legacy).encode()).hexdigest(),
                         '470ab71cf678c23ffcc61f06c87f595979a788d4e6d47f39a9671554fc13627d')
        self.assertEqual(SIZE,384)
        self.assertEqual(len(REGIONS),9)
        self.assertEqual(len(POIS),177)
        for p in POIS[77:]:
            self.assertTrue(p['x']>=256 or p['y']>=256)
            self.assertLess(max(p['x'],p['y']),SIZE)
            region=region_at(p['x'],p['y'])
            self.assertGreaterEqual(region['levels'][0],SITE_LEVELS.get(p['site_type'],1))
        self.assertEqual(len({n['id'] for n in POIS}),len(POIS))

    def test_level_50_save_continues_and_100_is_capped(self):
        w=self.world();w['player'].update(combat_level=50,xp=0)
        gain_xp(w,2000)
        self.assertEqual(w['player']['combat_level'],51)
        w['player'].update(combat_level=99,xp=0)
        gain_xp(w,100000)
        self.assertEqual((w['player']['combat_level'],w['player']['xp']),(100,0))

    def test_old_world_adds_encounters_once_and_keeps_assets(self):
        w=self.world();w['enemies']=w['enemies'][:35];w['enemies'][0].update(hp=17,respawn=123)
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'save.sqlite3');store.save(w);loaded=store.load()
            self.assertEqual(len(loaded['enemies']),95)
            for key in ('player','base','inventory','gear','equipment'):
                self.assertEqual(loaded[key],w[key])
            self.assertEqual(loaded['enemies'][:35],w['enemies'])
            store.save(loaded);self.assertEqual(store.load(),loaded);store.close()

    def test_new_encounters_supply_all_raw_materials(self):
        materials=set()
        for i in range(35,95):
            w=self.world();e=w['enemies'][i]
            self.assertTrue(31<=e['level']<=100)
            self.assertTrue(e['materials'])
            damage_enemy(w,e,e['hp'],lambda:.99)
            for item,amount in e['materials'].items():
                self.assertEqual(w['drops'][-1]['items'][item],amount)
                materials.add(item)
        self.assertEqual(materials,set(MATERIALS)-{'alloy','thread','essence','blessed_ink'})

    def test_all_40_models_have_recipes_and_level_checks(self):
        self.assertEqual(len(GEAR_MODELS),40)
        for key,model in GEAR_MODELS.items():
            with self.subTest(model=key):
                w=self.world();recipe='make_'+key
                act(w,{'action':'craft','recipe':recipe})
                item=w['gear'][-1]
                self.assertEqual(item['model'],key)
                self.assertEqual(item['rarity'],model['rarity'])
                self.assertEqual(item['power'],model['power']+2)
                w['player']['combat_level']=model['min_level']-1
                before=copy.deepcopy(w)
                with self.assertRaises(RuleError):act(w,{'action':'equip','item':item['id']})
                with self.assertRaises(RuleError):act(w,{'action':'craft','recipe':recipe})
                self.assertEqual(w,before)
                w['player']['combat_level']=model['min_level']
                act(w,{'action':'equip','item':item['id']})
                self.assertIn(item['id'],w['equipment'].values())

    def test_drop_models_match_level_and_weapon_family(self):
        for species,job,suffix in [('human','warrior','sword'),('human','ranged','rifle'),('vampire','warrior','claw'),('vampire','ranged','staff')]:
            w=self.world();w['player'].update(species=species,job=job)
            item=roll_equipment(w,{'level':100},lambda:0,collect=False)
            self.assertEqual(item['model'],'abyssal_weapon_'+suffix)
            self.assertEqual(item['rarity'],'normal')  # Selection does not bypass rare drop odds.
            self.assertEqual(item['min_level'],80)

    def test_new_consumables_effects_and_species_validation(self):
        for invalid in (None, [], {}, 'unknown'):
            w=self.world();before=copy.deepcopy(w)
            with self.assertRaises(RuleError):act(w,{'action':'consume','item':invalid})
            self.assertEqual(w,before)
        for key,spec in CONSUMABLES.items():
            w=self.world();w['player']['species']=spec.get('species','human')
            w['inventory'][key]=1
            old=copy.deepcopy(w['player'])
            act(w,{'action':'consume','item':key})
            self.assertEqual(w['inventory'][key],0)
            for stat,value in spec['effects'].items():
                self.assertEqual(w['player'][stat],min(100,old[stat]+value))
            if spec.get('cleanse'):
                self.assertEqual(w['player']['infection'],100-spec['cleanse'])
            if spec.get('species'):
                w['inventory'][key]=1
                w['player']['species']='vampire' if spec['species']=='human' else 'human'
                before=copy.deepcopy(w)
                with self.assertRaises(RuleError):act(w,{'action':'consume','item':key})
                self.assertEqual(w,before)

    def test_materials_can_reach_crafting_outputs(self):
        reachable=set(ITEMS)-set(MATERIALS)-set(CONSUMABLES)
        reachable.update(k for node in POIS for k in node.get('loot',{}))
        for _ in range(len(RECIPES)):
            for key,r in RECIPES.items():
                if set(r['cost'])<=reachable and not r.get('gear_slot'):
                    reachable.add(r.get('output',key))
        self.assertTrue(set(MATERIALS)<=reachable)
        self.assertTrue(set(CONSUMABLES)<=reachable)
        for r in RECIPES.values():self.assertTrue(set(r['cost'])<=reachable)

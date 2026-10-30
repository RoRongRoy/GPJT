import copy
import math
import tempfile
import unittest
from pathlib import Path
from server.game import act, new_world, RuleError
from server.storage import Store
from server.worldmap import SIZE, TOWNS, MERCHANTS, ENEMY_SPAWNS, migrate_profile_layout


class ExpansionV3Tests(unittest.TestCase):
    def test_area_density_starter_safety_and_level_coverage(self):
        self.assertEqual(SIZE*SIZE, 544*544)
        enemies = new_world()['enemies']
        self.assertEqual(len(enemies), 143)
        self.assertLess(len(enemies)/(SIZE*SIZE), 11/(128*128))
        self.assertGreaterEqual(len({e['name'] for e in enemies}), 17)
        self.assertEqual(max(e['level'] for e in enemies), 100)
        for town in TOWNS.values():
            self.assertEqual(town['radius'], 17)
            for e in enemies:
                self.assertGreater(math.hypot(e['x']-town['x'], e['y']-town['y']), town['radius']+3)
            self.assertTrue(any(e['level']<=5 and e['faction']!=town['faction'] and math.hypot(e['x']-town['x'], e['y']-town['y'])<48 for e in enemies))
        for i, a in enumerate(MERCHANTS):
            for b in MERCHANTS[i+1:]:
                self.assertGreater(math.hypot(a['x']-b['x'], a['y']-b['y']), 10)

    def test_legacy_world_peers_and_accounts_migrate_once(self):
        w = new_world()
        w['layout_version'] = 2
        w['player'].pop('map_layout')
        w['player'].update(x=58, y=14, chosen=True)
        w['base'].update(x=58, y=14, established=True)
        w['base']['facilities']['storage'] = 3
        w['inventory']['wood'] = 777
        w['enemies'] = w['enemies'][:11]
        for e in w['enemies']:
            e['x'] /= 2
            e['y'] /= 2
        w['enemies'][0].update(hp=0, respawn=500)
        w['drops'] = [{'id':'drop:test','x':50,'y':30,'items':{'wood':2}}]
        profile = {k:copy.deepcopy(w[k]) for k in ('player','base','gear','equipment','inventory')}
        with tempfile.TemporaryDirectory() as d:
            store = Store(Path(d)/'world.sqlite3')
            try:
                store.save(w);store.save_peer('old-session', profile);store.save_account('legacy','test-password',profile)
                restored = store.load()
                self.assertEqual((restored['player']['x'], restored['base']['y']), (116,28))
                self.assertEqual(restored['drops'][0]['x'],100)
                self.assertEqual(restored['inventory'],w['inventory'])
                self.assertEqual(restored['base']['facilities'],w['base']['facilities'])
                self.assertEqual((restored['enemies'][0]['hp'],restored['enemies'][0]['respawn']), (0,500))
                self.assertEqual(len(restored['enemies']),143)
                store.save(restored);self.assertEqual(store.load(), restored)
                for migrated in (store.load_peers()['old-session'], store.load_account('legacy','test-password')):
                    self.assertEqual(migrated['player']['x'],116)
                    self.assertEqual(migrated['base']['y'],28)
                    before=copy.deepcopy(migrated);migrate_profile_layout(migrated);self.assertEqual(migrated,before)
                    self.assertEqual(migrated['inventory'],profile['inventory'])
            finally:store.close()
        unbuilt={'player':{'x':18,'y':19},'base':{'x':None,'y':None,'established':False}}
        migrate_profile_layout(unbuilt)
        self.assertIsNone(unbuilt['base']['x'])

    def test_merchant_identity_role_distance_and_faction_are_enforced(self):
        for faction in ('human','vampire'):
            w=new_world();act(w,{'action':'choose','species':faction})
            w['inventory']={k:0 for k in w['inventory']};w['inventory']['gold']=10000
            offers={'supplies':'medicine','equipment':'shop_boots','scroll':'scroll','skill':'skillbook'}
            for role,item in offers.items():
                m=next(m for m in MERCHANTS if m['faction']==faction and m['role']==role)
                w['player'].update(x=m['x'],y=m['y'])
                before=copy.deepcopy(w)
                wrong='shop_ring' if role!='equipment' else 'skillbook'
                with self.assertRaises(RuleError):act(w,{'action':'shop_buy','merchant_id':m['id'],'item':wrong})
                self.assertEqual(w,before)
                act(w,{'action':'shop_buy','merchant_id':m['id'],'item':item})
                self.assertLess(w['inventory']['gold'],before['inventory']['gold'])
                before=copy.deepcopy(w)
                other=next(n for n in MERCHANTS if n['id']!=m['id'])
                with self.assertRaises(RuleError):act(w,{'action':'shop_buy','merchant_id':other['id'],'item':item})
                self.assertEqual(w,before)
                w['player']['x']+=6
                with self.assertRaises(RuleError):act(w,{'action':'shop_buy','merchant_id':m['id'],'item':item})

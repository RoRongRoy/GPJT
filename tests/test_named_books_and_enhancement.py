import copy
import tempfile
import unittest
from pathlib import Path
from server.game import new_world, act, RuleError, SKILL_BOOKS, damage_enemy
from server.skillbooks import has_skill
from server.storage import Store
from server.worldmap import MERCHANTS


class NamedBooksAndEnhancementTests(unittest.TestCase):
    def world(self):
        w=new_world()
        act(w,dict(action='choose',species='human'))
        w['player'].update(combat_level=100,x=w['base']['x'],y=w['base']['y'])
        return w

    def reject(self,w,cmd):
        before=copy.deepcopy(w)
        with self.assertRaises(RuleError):act(w,cmd)
        self.assertEqual(w,before)

    def test_every_book_unlocks_exact_skill_and_is_scoped(self):
        self.assertEqual(len(SKILL_BOOKS),48)
        for key,book in SKILL_BOOKS.items():
            w=self.world()
            w['player'].update(species=book['species'],job=book['job'])
            w['inventory'].update({key:2,'skillbook':999})
            act(w,dict(action='consume',item=key))
            self.assertTrue(has_skill(w['player'],book['skill']))
            self.assertEqual(len(w['player']['learned_skills']),3)
            self.assertEqual(w['inventory'][key],1)
            self.assertEqual(w['inventory']['skillbook'],999)
            self.reject(w,dict(action='consume',item=key))
            w['player']['job']='ranged' if book['job']=='warrior' else 'warrior'
            self.assertFalse(has_skill(w['player'],book['skill']))

    def test_wrong_faction_job_level_missing_and_legacy(self):
        key='skillbook_human_warrior_strike'
        for patch in ({'species':'vampire'},{'job':'ranged'},{'combat_level':1}):
            w=self.world();w['inventory'][key]=1;w['player'].update(patch)
            self.reject(w,dict(action='consume',item=key))
        w=self.world();w['inventory']['skillbook']=999
        self.reject(w,dict(action='learn_skill',skill='strike'))
        w['player']['learned_skills'].append('strike')
        self.assertTrue(has_skill(w['player'],'strike'))
        w['inventory'][key]=1
        self.reject(w,dict(action='consume',item=key))

    def test_real_monster_drops_reach_every_named_book_then_sell(self):
        found=set()
        for species in ('human','vampire'):
            for i in range(24):
                w=self.world();w['player']['species']=species
                enemy=w['enemies'][0];enemy.update(hp=1,level=100,materials={})
                rolls=iter([0,1,(i+.5)/24])
                damage_enemy(w,enemy,1,lambda:next(rolls))
                books=set(w['drops'][-1]['items'])&set(SKILL_BOOKS)
                self.assertEqual(len(books),1)
                found.update(books)
                self.assertEqual(w['player']['learned_skills'],['sweep','recover'])
        self.assertEqual(found,set(SKILL_BOOKS))
        w=self.world();key='skillbook_human_warrior_strike';w['inventory'][key]=1
        m=next(m for m in MERCHANTS if m['faction']=='human' and m['role']=='skill')
        w['player'].update(x=m['x'],y=m['y'])
        gold=w['inventory'].get('gold',0)
        act(w,dict(action='shop_sell',merchant_id=m['id'],item=key))
        self.assertEqual(w['inventory']['gold'],gold+30)

    def test_all_equipment_selectable_independent_and_persisted(self):
        w=self.world();w['inventory']['scroll']=99
        w['player']['level']=7 # Historical account bonus survives.
        originals=copy.deepcopy(w['gear'])
        for original in originals:
            act(w,dict(action='enhance',gear_id=original['id']),lambda:0)
            item=next(g for g in w['gear'] if g['id']==original['id'])
            self.assertEqual(item['enhancement'],1)
            self.assertEqual(item['power'],original['power']+(2 if item['slot']=='weapon' else 1))
        self.assertEqual(w['player']['level'],7)
        self.reject(w,dict(action='enhance',gear_id='someone-elses-item'))
        self.reject(w,dict(action='enhance',gear_id=[]))
        w['gear'][0]['enhancement']=10
        self.reject(w,dict(action='enhance',gear_id=w['gear'][0]['id']))
        book='skillbook_human_warrior_strike';w['inventory'][book]=2
        act(w,dict(action='consume',item=book))
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'save.db');store.save(w);loaded=store.load();store.close()
        self.assertEqual(loaded['gear'],w['gear'])
        self.assertEqual(loaded['inventory'][book],1)
        self.assertTrue(has_skill(loaded['player'],'strike'))

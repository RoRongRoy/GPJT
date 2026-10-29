import unittest
import tempfile
from pathlib import Path
from server.main import Runtime
from server.worldmap import MERCHANTS

class SpecialistTests(unittest.TestCase):
    def test_role_distance_and_atomic_purchase(self):
        with tempfile.TemporaryDirectory() as d:
            r=Runtime(Path(d)/'world.sqlite3')
            try:
                token='specialist-test-session';r.authorize(token)
                r.execute_action(token,{'action':'choose','species':'human'})
                p=r._profile_for(token)
                m=next(m for m in MERCHANTS if m['id']=='human_equipment')
                p['player'].update(x=m['x'],y=m['y']);p['inventory']['gold']=500
                r.sessions[token]['last_command']=0;r.last_command=0
                status,_=r.execute_action(token,{'action':'shop_buy','item':'shop_weapon'})
                self.assertEqual(status,200)
                p=r._profile_for(token)
                self.assertEqual(p['inventory']['gold'],380)
                self.assertEqual(p['gear'][-1]['slot'],'weapon')
                p['player'].update(x=110,y=110)
                r.sessions[token]['last_command']=0;r.last_command=0
                status,_=r.execute_action(token,{'action':'shop_buy','item':'shop_weapon'})
                self.assertEqual(status,400)
                self.assertEqual(r._profile_for(token)['inventory']['gold'],380)
            finally:r.store.close()

    def test_claims_reject_town_and_other_online_owner(self):
        with tempfile.TemporaryDirectory() as d:
            r=Runtime(Path(d)/'world.sqlite3')
            try:
                for token in ('first-owner-session','second-owner-session'):
                    r.authorize(token)
                    r.sessions[token]['last_command']=0;r.last_command=0
                    r.execute_action(token,{'action':'choose','species':'human'})
                r.sessions['second-owner-session']['last_command']=0;r.last_command=0
                status,_=r.execute_action('second-owner-session',{'action':'claim_base'})
                self.assertEqual(status,400)
                for token,expected in [('first-owner-session',200),('second-owner-session',400)]:
                    r._profile_for(token)['player'].update(x=58.,y=14.)
                    r.sessions[token]['last_command']=0;r.last_command=0
                    status,_=r.execute_action(token,{'action':'claim_base'})
                    self.assertEqual(status,expected)
                self.assertFalse(r._profile_for('second-owner-session')['base']['established'])
            finally:r.store.close()

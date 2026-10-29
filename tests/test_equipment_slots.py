import copy
import tempfile
import unittest
from pathlib import Path
from server.equipment import EQUIPMENT_SLOTS, GEAR_TYPES, RARITIES, armor_power, roll_equipment
from server.game import act, new_world, RuleError, _profile_armor
from server.storage import Store
from server.worldmap import MERCHANTS


class EquipmentSlotTests(unittest.TestCase):
    def world(self):
        w = new_world()
        act(w, {'action': 'choose', 'species': 'human'})
        w['inventory'] = {k: 0 for k in w['inventory']}
        w['inventory']['gold'] = 10000
        m = next(m for m in MERCHANTS if m['id'] == 'human_equipment')
        w['player'].update(x=m['x'], y=m['y'])
        return w

    def buy(self, w, kind):
        act(w, {'action': 'shop_buy', 'item': 'shop_'+kind})
        return w['gear'][-1]

    def test_all_slots_purchase_equip_defense_and_save(self):
        w = self.world()
        old_chest = copy.deepcopy(w['gear'][1])
        for slot in EQUIPMENT_SLOTS[2:]:
            g = self.buy(w, 'ring' if slot.startswith('ring') else slot)
            act(w, {'action': 'equip', 'item': g['id'], 'slot': slot})
            self.assertEqual(w['equipment'][slot], g['id'])
        self.assertEqual(len(set(w['equipment'].values())), 8)
        self.assertEqual(w['gear'][1], old_chest)
        self.assertEqual(armor_power(w), 13)
        self.assertEqual(_profile_armor(w), 13)
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'world.sqlite3')
            store.save(w)
            restored = store.load()
            store.close()
        self.assertEqual(restored['equipment'], w['equipment'])
        self.assertEqual(restored['gear'], w['gear'])
        self.assertEqual(armor_power(restored), 13)

    def test_ring_auto_slots_replacement_and_no_duplicate_bonus(self):
        w = self.world()
        a, b, c = [self.buy(w, 'ring') for _ in range(3)]
        for g in (a, b):
            act(w, {'action': 'equip', 'item': g['id']})
        self.assertEqual(w['equipment']['ring1'], a['id'])
        self.assertEqual(w['equipment']['ring2'], b['id'])
        act(w, {'action': 'equip', 'item': c['id'], 'slot': 'ring2'})
        self.assertIn(b, w['gear'])
        self.assertEqual(w['equipment']['ring2'], c['id'])
        act(w, {'action': 'equip', 'item': a['id'], 'slot': 'ring2'})
        self.assertIsNone(w['equipment']['ring1'])
        self.assertEqual(armor_power(w), 3)
        before = copy.deepcopy(w)
        with self.assertRaises(RuleError):
            act(w, {'action': 'equip', 'item': a['id'], 'slot': 'boots'})
        self.assertEqual(w, before)
        with self.assertRaises(RuleError):
            act(w, {'action': 'shop_sell', 'gear_id': a['id']})
        self.assertEqual(w, before)
        act(w, {'action': 'unequip', 'slot': 'ring2'})
        act(w, {'action': 'shop_sell', 'gear_id': a['id']})
        self.assertNotIn(a, w['gear'])
        self.assertEqual(armor_power(w), 1)

    def test_every_type_drops_at_every_rarity_without_increasing_drop_rate(self):
        w = self.world()
        threshold = 0
        for rarity, spec in RARITIES.items():
            for i, kind in enumerate(GEAR_TYPES):
                values = iter([threshold+spec['chance']/2, (i+.5)/len(GEAR_TYPES)])
                g = roll_equipment(w, w['enemies'][0], lambda: next(values), collect=False)
                self.assertEqual((g['rarity'], g['slot']), (rarity, kind))
            threshold += spec['chance']
        self.assertIsNone(roll_equipment(w, w['enemies'][0], lambda: threshold))

    def test_legacy_two_slot_save_remains_usable(self):
        w = self.world()
        self.assertEqual(set(w['equipment']), {'weapon', 'armor'})
        self.assertEqual(armor_power(w), 1)
        g = self.buy(w, 'boots')
        act(w, {'action': 'equip', 'item': g['id']})
        self.assertEqual(armor_power(w), 3)
        act(w, {'action': 'unequip', 'slot': 'boots'})
        self.assertEqual(armor_power(w), 1)

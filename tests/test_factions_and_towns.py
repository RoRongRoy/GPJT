import copy
import math
import unittest
from unittest.mock import patch
from server.game import new_world, act, tick, RuleError
from server.worldmap import TOWNS, MERCHANTS, ENEMY_SPAWNS


class FactionsAndTownsTests(unittest.TestCase):
    def setUp(self):
        self.w = new_world()

    def action(self, **command):
        candidate = copy.deepcopy(self.w)
        act(candidate, command, rng=lambda: 0.99)
        self.w = candidate

    def test_faction_starting_points(self):
        # Unchosen wanderer chooses Human
        w_human = new_world()
        act(w_human, {'action': 'choose', 'species': 'human', 'gender': 'female', 'job': 'warrior'})
        self.assertEqual(w_human['player']['species'], 'human')
        self.assertEqual(w_human['player']['x'], TOWNS['human']['spawn'][0])
        self.assertEqual(w_human['player']['y'], TOWNS['human']['spawn'][1])

        # Unchosen wanderer chooses Vampire
        w_vampire = new_world()
        act(w_vampire, {'action': 'choose', 'species': 'vampire', 'gender': 'male', 'job': 'ranged'})
        self.assertEqual(w_vampire['player']['species'], 'vampire')
        self.assertEqual(w_vampire['player']['x'], TOWNS['vampire']['spawn'][0])
        self.assertEqual(w_vampire['player']['y'], TOWNS['vampire']['spawn'][1])

    def test_friendly_faction_protection_in_combat(self):
        # Set up a Human player
        self.w['player'].update(chosen=True, species='human', x=50.0, y=50.0, hp=100.0)
        # Enemy 4: Human combatant, Enemy 5: Vampire combatant
        self.w['enemies'][4].update(x=51.0, y=50.0, hp=80.0)
        self.w['enemies'][5].update(x=51.5, y=50.0, hp=80.0)

        # Human player attacks: ally (human) must not take damage, hostile vampire takes damage
        self.action(action='attack')
        self.assertEqual(self.w['enemies'][4]['hp'], 80.0, "Human ally must not take damage from human player")
        self.assertLess(self.w['enemies'][5]['hp'], 80.0, "Vampire foe must take damage from human player")

        # Now test Vampire player
        w_vamp = new_world()
        w_vamp['player'].update(chosen=True, species='vampire', x=50.0, y=50.0, hp=100.0)
        w_vamp['enemies'][4].update(x=51.5, y=50.0, hp=80.0)
        w_vamp['enemies'][5].update(x=51.0, y=50.0, hp=80.0)

        act(w_vamp, {'action': 'attack'}, rng=lambda: 0.99)
        self.assertLess(w_vamp['enemies'][4]['hp'], 80.0, "Human foe must take damage from vampire player")
        self.assertEqual(w_vamp['enemies'][5]['hp'], 80.0, "Vampire ally must not take damage from vampire player")

    def test_enemies_fight_opposing_factions(self):
        # Player far away in safe town
        self.w['player'].update(chosen=True, species='human', x=36.0, y=36.0, hp=100.0)
        # Enemy 4: Human soldier (home 72, 36), Enemy 5: Vampire knight
        home4 = ENEMY_SPAWNS[4]
        self.w['enemies'][4].update(x=home4[0], y=home4[1], hp=80.0)
        self.w['enemies'][5].update(x=home4[0] + 1.2, y=home4[1], hp=80.0)

        mock_spawns = list(ENEMY_SPAWNS)
        mock_spawns[5] = (home4[0] + 1.2, home4[1])  # within leash

        with patch('server.game.ENEMY_SPAWNS', mock_spawns):
            hp4_start = self.w['enemies'][4]['hp']
            hp5_start = self.w['enemies'][5]['hp']

            # Advance game time with tick()
            for _ in range(5):
                tick(self.w, dt=1.0)

            self.assertTrue(
                self.w['enemies'][4]['hp'] < hp4_start or self.w['enemies'][5]['hp'] < hp5_start,
                "Opposing faction combatants should fight each other and deal damage"
            )

    def test_safe_town_pauses_hunger_thirst(self):
        # Player in Lumina Citadel safe zone
        self.w['player'].update(chosen=True, species='human', x=36.0, y=36.0, food=90.0, water=90.0)
        food_before = self.w['player']['food']
        water_before = self.w['player']['water']

        # Tick 10 seconds inside town
        for _ in range(10):
            tick(self.w, dt=1.0)

        self.assertEqual(self.w['player']['food'], food_before, "Hunger should be paused in safe town")
        self.assertEqual(self.w['player']['water'], water_before, "Thirst should be paused in safe town")

    def test_merchant_shop_buy_and_sell(self):
        # Player near Human merchant
        merchant = next(m for m in MERCHANTS if m['id'] == 'merchant_human')
        self.w['player'].update(chosen=True, species='human', x=merchant['x'], y=merchant['y'])
        self.w['inventory']['gold'] = 50
        self.w['inventory']['soup'] = 0

        # Buy 1 soup (price 28)
        self.action(action='shop_buy', item='soup', count=1)
        self.assertEqual(self.w['inventory']['gold'], 22)
        self.assertEqual(self.w['inventory']['soup'], 1)

        # Sell 1 soup (sell price 5)
        self.action(action='shop_sell', item='soup', count=1)
        self.assertEqual(self.w['inventory']['gold'], 27)
        self.assertEqual(self.w['inventory']['soup'], 0)

        # Test gear sell
        test_gear = {'id': 'sword_iron_1', 'name': '철 검', 'slot': 'weapon', 'power': 5, 'tier': 1, 'rarity': 'uncommon'}
        self.w.setdefault('gear', []).append(test_gear)
        self.w.setdefault('equipment', {})['weapon'] = None  # not equipped

        gold_before = self.w['inventory']['gold']
        expected_gain = 15 + test_gear['power'] * 5
        armorer = next(m for m in MERCHANTS if m['id']=='human_equipment')
        self.w['player'].update(x=armorer['x'], y=armorer['y'])
        self.action(action='shop_sell', gear_id=test_gear['id'])
        self.assertEqual(self.w['inventory']['gold'], gold_before + expected_gain)
        self.assertNotIn(test_gear, self.w['gear'])

        # Try to buy without enough gold
        self.w['inventory']['gold'] = 5
        with self.assertRaises(RuleError):
            self.action(action='shop_buy', item='skillbook', count=1)


if __name__ == '__main__':
    unittest.main()

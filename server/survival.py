"""Expedition pressure in active simulation seconds, never offline wall time."""
DRAIN = {'food': .09, 'water': .14, 'blood': .12, 'stability': .065}
SPRINT_DRAIN = {'food': .08, 'water': .18, 'blood': .12}
RESOURCE_COOLDOWNS = {'water':180, 'crop':180, 'blood':240, 'herb':90}
SUPPLY_PRICES = {'water':18, 'crop':12, 'blood':20, 'soup':28, 'elixir':36}
RESOURCE_LOOT = {'water':{'water':1,'metal':1}, 'crop':{'crop':1,'metal':1},
                 'blood':{'blood':1,'metal':1,'herb':1}, 'herb':{'herb':2,'metal':1}}


def limit_supply_sites(sites):
    for key,(label,prop,loot,seconds) in list(sites.items()):
        supplies=set(loot)&{'water','crop','blood'}
        if supplies:
            loot={item:min(1,amount) if item in supplies else amount for item,amount in loot.items()}
            seconds=max(seconds,240 if 'blood' in supplies else 180)
            sites[key]=(label,prop,loot,seconds)

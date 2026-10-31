"""One named book unlocks exactly one faction/job skill; old learned IDs stay valid."""
def learned_key(species,job,skill):
    return f'{species}:{job}:{skill}'


def has_skill(player,skill):
    learned=player.get('learned_skills',['sweep','recover'])
    return skill in learned or learned_key(player['species'],player.get('job','warrior'),skill) in learned


def register_books(jobs):
    books={}
    for (species,job),skills in jobs.items():
        faction='인간' if species=='human' else '뱀파이어'
        profession='전사' if job=='warrior' else '사수' if species=='human' else '혈마법사'
        for skill,spec in skills.items():
            if skill in ('sweep','recover'):continue
            key=f'skillbook_{species}_{job}_{skill}'
            title=f'[{faction}·{profession}] {spec["name"]} 스킬북'
            books[key]=dict(name=title,species=species,job=job,skill=skill,level=spec['unlock_level'],sell_price=30)
            spec.update(book_id=key,book_name=title,book_cost=1,requires_learning=True)
    return books


def roll_book(books,species,level,roll):
    pool=[key for key,spec in books.items() if spec['species']==species and spec['level']<=max(2,level)]
    return pool[min(len(pool)-1,max(0,int(roll*len(pool))))] if pool else None

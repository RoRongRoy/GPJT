"""Validate local Markdown links and required repository artifacts."""
import re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
errors = []
for path in root.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        file = target.split('#')[0]
        if not (path.parent/file).exists():
            errors.append(f'{path.relative_to(root)}: missing {file}')
for name in ['README.md','docs/GDD.md','docs/STATUS.md','docs/REQUIREMENTS.md','server/main.py','public/index.html']:
    if not (root/name).is_file():
        errors.append('Missing '+name)
if errors:
    raise SystemExit('\n'.join(errors))
print('Local Markdown links and required files: OK')

# Repository instructions

- Product decisions: docs/REQUIREMENTS.md. Full target: docs/GDD.md. Current implementation: docs/STATUS.md.
- Preserve instant base relocation, reversible species, assets, single-player focus, no seasons, no monetization.
- Do not describe planned systems as implemented.
- Run python -m unittest discover -s tests -v and python tools/check_docs.py from this directory. Check browser JavaScript syntax when modifying UI.
- Keep game rules server-owned and transport-independent. Commit an action and resource spend atomically.
- Do not commit data/, backups/, keys, production addresses, personal saves, or generated test outputs.
- Do not publish, change firewall settings, or create remote repositories without user authorization.
- No unsolicited license grant. No third-party game art/code copied into this project.

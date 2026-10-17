#!/usr/bin/env python3
"""Create a small source installer bundle with an explicit allowlist."""
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = '0.1.0'
ALLOW_FILES = ['package.json', 'package-lock.json', 'server.mjs', 'README.md', 'VALIDATION.md',
               'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', '安装.command', '卸载.command', '首次启用PowerPoint.pptx']
ALLOW_DIRS = ['lib', 'web', 'manifests', 'scripts', 'tests', 'validation/samples', 'docs/media']
files = [ROOT / p for p in ALLOW_FILES]
for directory in ALLOW_DIRS:
    files += [p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.pyc', '.key', '.crt', '.pem']]
outdir = ROOT / 'dist'
outdir.mkdir(exist_ok=True)
archive = outdir / f'SlideTeX-Mac-{VERSION}.zip'
prefix = f'SlideTeX-Mac-{VERSION}'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(set(files)):
        if not path.exists(): raise RuntimeError(f'Missing required file: {path.name}')
        z.write(path, f'{prefix}/{path.relative_to(ROOT)}')
with zipfile.ZipFile(archive) as z:
    if z.testzip(): raise RuntimeError('Archive integrity check failed')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(outdir / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
print(f'{archive}\nSHA-256: {digest}\nFiles: {len(files)}')

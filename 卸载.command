#!/bin/zsh
set -e
cd -- "${0:A:h}"
python3 scripts/install.py --uninstall
read -r '?按回车退出'

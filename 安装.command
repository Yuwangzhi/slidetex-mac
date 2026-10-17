#!/bin/zsh
set -e
cd -- "${0:A:h}"
if ! command -v node >/dev/null; then
  print '需要 Node.js 20.9+。安装地址：https://nodejs.org/'
  read -r '?按回车退出'
  exit 1
fi
if [[ ! -d node_modules/sharp ]]; then npm ci --ignore-scripts --no-audit --no-fund; fi
python3 scripts/install.py
print 'PowerPoint 要求本机 HTTPS；WPS 无需证书信任即可使用。'
print '是否将 SlideTeX localhost 证书加入登录钥匙串（仅 localhost SSL）？'
read -r 'slidetex_trust?输入 yes 继续，其他输入跳过：'
if [[ "$slidetex_trust" == yes ]]; then python3 scripts/setup_tls.py --trust; fi
read -r '?按回车退出'

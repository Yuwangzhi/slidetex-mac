#!/usr/bin/env python3
"""Register ribbon add-ins without replacing any other add-in configuration."""
import argparse
import datetime
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import xml.etree.ElementTree as ET
from setup_tls import generate

ROOT = Path(__file__).resolve().parent.parent
USER = Path.home()
STATE = USER / 'Library/Application Support/SlideTeX'
LABEL = 'com.yuwangzhi.slidetex'
AGENT = USER / 'Library/LaunchAgents' / (LABEL + '.plist')
WPS = USER / 'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml'
OFFICE = USER / 'Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/SlideTeX.xml'
DOMAIN = f'gui/{os.getuid()}'

def backup(path):
    if path.exists():
        target = STATE / 'backups' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target / path.name)

def update_wps(remove=False):
    if not WPS.exists() and remove:
        return
    tree = ET.parse(WPS) if WPS.exists() else ET.ElementTree(ET.Element('jsplugins'))
    root = tree.getroot()
    if root.tag != 'jsplugins':
        raise RuntimeError('WPS publish.xml 格式未知，未修改。')
    backup(WPS)
    for item in list(root):
        if item.get('name') == 'SlideTeX' and item.get('type') == 'wpp':
            root.remove(item)
    if not remove:
        ET.SubElement(root, 'jspluginonline', name='SlideTeX', type='wpp', url='http://127.0.0.1:32178/wps/', debug='', enable='enable_dev', install='null')
    WPS.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(tree, space='  ')
    tree.write(WPS, encoding='utf-8', xml_declaration=True)

def install():
    node = shutil.which('node')
    if not node or not (ROOT / 'node_modules/sharp').exists():
        raise RuntimeError('请先安装 Node.js 20.9+ 并在项目内运行 npm ci。')
    STATE.mkdir(parents=True, exist_ok=True)
    generate()
    OFFICE.parent.mkdir(parents=True, exist_ok=True)
    backup(OFFICE)
    text = (ROOT / 'manifests/powerpoint.xml').read_text()
    text = text.replace('http://localhost:32178', 'https://localhost:32179')
    OFFICE.write_text(text)
    update_wps()
    log_dir = USER / 'Library/Logs/SlideTeX'
    log_dir.mkdir(parents=True, exist_ok=True)
    AGENT.parent.mkdir(parents=True, exist_ok=True)
    backup(AGENT)
    agent = {
        'Label': LABEL,
        'ProgramArguments': [node, str(ROOT / 'server.mjs')],
        'WorkingDirectory': str(ROOT),
        'EnvironmentVariables': {'SLIDETEX_CERT_DIR': str(STATE / 'tls')},
        'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 10,
        'StandardOutPath': str(log_dir / 'service.log'),
        'StandardErrorPath': str(log_dir / 'error.log'),
    }
    subprocess.run(['launchctl', 'bootout', DOMAIN, str(AGENT)], capture_output=True)
    with AGENT.open('wb') as handle:
        plistlib.dump(agent, handle)
    subprocess.run(['launchctl', 'bootstrap', DOMAIN, str(AGENT)], check=True)
    print('SlideTeX 已注册：PowerPoint 功能区 + WPS 功能区。')
    print('PowerPoint 首次使用：打开安装包内的“首次启用PowerPoint.pptx”，再使用顶部 SlideTeX 选项卡。')
    print('WPS 重新打开后，顶部应出现 SlideTeX 选项卡。')
    print(f'配置备份：{STATE / "backups"}')

def uninstall():
    subprocess.run(['launchctl', 'bootout', DOMAIN, str(AGENT)], capture_output=True)
    backup(AGENT)
    AGENT.unlink(missing_ok=True)
    backup(OFFICE)
    OFFICE.unlink(missing_ok=True)
    update_wps(remove=True)
    cert = STATE / 'tls/localhost.crt'
    if cert.exists():
        subprocess.run(['security', 'remove-trusted-cert', str(cert)], capture_output=True)
    print('SlideTeX 注册和后台服务已移除。源码、配置备份和公式 PNG 已保留。')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()
    uninstall() if args.uninstall else install()

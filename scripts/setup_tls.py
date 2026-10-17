#!/usr/bin/env python3
"""Create a machine-specific localhost leaf certificate; trust only on explicit request."""
import argparse
import os
from pathlib import Path
import subprocess

TLS = Path.home() / 'Library/Application Support/SlideTeX/tls'
CERT = TLS / 'localhost.crt'
KEY = TLS / 'localhost.key'

def generate():
    TLS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if CERT.exists() and KEY.exists():
        return
    if CERT.exists() or KEY.exists():
        raise RuntimeError('证书或私钥缺失，未覆盖现有文件。请备份 tls 目录后重新安装。')
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
        '-subj', '/CN=SlideTeX localhost',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
        '-addext', 'extendedKeyUsage=serverAuth',
        '-keyout', str(KEY), '-out', str(CERT),
    ], check=True, capture_output=True)
    KEY.chmod(0o600)

def trust():
    generate()
    print('将本机 SlideTeX 证书加入当前用户登录钥匙串，仅用于 localhost 的 SSL。', flush=True)
    subprocess.run([
        'security', 'add-trusted-cert', '-r', 'trustRoot', '-p', 'ssl', '-s', 'localhost',
        '-k', str(Path.home() / 'Library/Keychains/login.keychain-db'), str(CERT),
    ], check=True)
    subprocess.run(['security', 'verify-cert', '-c', str(CERT), '-p', 'ssl', '-s', 'localhost'], check=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--trust', action='store_true', help='Explicitly authorize adding this localhost certificate to the login keychain')
    args = parser.parse_args()
    trust() if args.trust else generate()

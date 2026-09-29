"""Controle da TV Samsung (UN55TU8000) pela rede.

Uso:
  python tv.py achar              procura a TV na rede e salva o IP
  python tv.py parear             conecta e salva o token (aceite o aviso na TV)
  python tv.py info               modelo, estado, IP
  python tv.py tecla KEY_UP [KEY_ENTER ...]   aperta teclas (atalhos: cima baixo esq dir ok voltar home)
  python tv.py texto "abc"        digita no teclado aberto na TV
  python tv.py apps               lista apps instalados
  python tv.py abrir <appId|nome> abre app (sem argumento abre o TizenBrew)
  python tv.py ligar              Wake-on-LAN
  python tv.py desligar
"""
import base64
import concurrent.futures
import json
import os
import socket
import ssl
import sys
import time
import urllib.request

import websocket  # pip install websocket-client

PASTA = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(PASTA, 'tv-config.json')
TOKEN = os.path.join(PASTA, 'tv-token.txt')
NOME = base64.b64encode(b'RecordPlus PC').decode()

ATALHOS = {
    'cima': 'KEY_UP', 'baixo': 'KEY_DOWN', 'esq': 'KEY_LEFT', 'dir': 'KEY_RIGHT',
    'ok': 'KEY_ENTER', 'voltar': 'KEY_RETURN', 'home': 'KEY_HOME', 'sair': 'KEY_EXIT',
    'play': 'KEY_PLAY', 'pause': 'KEY_PAUSE', 'vermelho': 'KEY_RED', 'verde': 'KEY_GREEN',
    'amarelo': 'KEY_YELLOW', 'azul': 'KEY_BLUE', 'volmais': 'KEY_VOLUP', 'volmenos': 'KEY_VOLDOWN',
}


def ler_config():
    try:
        with open(CONFIG, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def salvar_config(c):
    with open(CONFIG, 'w', encoding='utf-8') as f:
        json.dump(c, f, indent=2, ensure_ascii=False)


def info_tv(ip, timeout=2):
    with urllib.request.urlopen('http://%s:8001/api/v2/' % ip, timeout=timeout) as r:
        return json.load(r)


def meu_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    finally:
        s.close()


def achar():
    """Varre a sub-rede /24 do PC procurando a API da Samsung na porta 8001."""
    base = meu_ip().rsplit('.', 1)[0]
    print('Procurando TV em %s.1-254 ...' % base)

    def testa(i):
        ip = '%s.%d' % (base, i)
        try:
            d = info_tv(ip, timeout=1.5)
            return ip, d
        except Exception:
            return None

    with concurrent.futures.ThreadPoolExecutor(64) as ex:
        achadas = [r for r in ex.map(testa, range(1, 255)) if r]
    if not achadas:
        print('Nenhuma TV encontrada. Ela esta ligada e na mesma rede do PC?')
        return None
    ip, d = achadas[0]
    dev = d.get('device', {})
    c = ler_config()
    c['ip'] = ip
    if dev.get('wifiMac'):
        c['mac'] = dev['wifiMac']
    c.setdefault('mac', '64:07:F6:EE:C8:45')
    salvar_config(c)
    print('TV: %s (%s) em %s' % (dev.get('name'), dev.get('modelName'), ip))
    return ip


def ip_tv():
    ip = ler_config().get('ip')
    if ip:
        try:
            info_tv(ip)
            return ip
        except Exception:
            print('TV nao respondeu em %s, procurando de novo...' % ip)
    ip = achar()
    if not ip:
        sys.exit(1)
    return ip


def conectar():
    ip = ip_tv()
    token = ''
    if os.path.exists(TOKEN):
        token = open(TOKEN, encoding='utf-8').read().strip()
    url = 'wss://%s:8002/api/v2/channels/samsung.remote.control?name=%s' % (ip, NOME)
    if token:
        url += '&token=' + token
    ws = websocket.create_connection(url, timeout=30, sslopt={'cert_reqs': ssl.CERT_NONE})
    while True:
        msg = json.loads(ws.recv())
        ev = msg.get('event')
        if ev == 'ms.channel.connect':
            novo = (msg.get('data') or {}).get('token')
            if novo and novo != token:
                with open(TOKEN, 'w', encoding='utf-8') as f:
                    f.write(novo)
                print('Token salvo.')
            return ws
        if ev == 'ms.channel.unauthorized':
            sys.exit('TV recusou a conexao. Aceite o aviso na tela e rode de novo.')


def teclas(nomes, pausa=0.4):
    ws = conectar()
    for n in nomes:
        k = ATALHOS.get(n.lower(), n.upper() if n.upper().startswith('KEY_') else 'KEY_' + n.upper())
        ws.send(json.dumps({'method': 'ms.remote.control', 'params': {
            'Cmd': 'Click', 'DataOfCmd': k, 'Option': 'false', 'TypeOfRemote': 'SendRemoteKey'}}))
        print(k)
        time.sleep(pausa)
    ws.close()


def texto(t):
    ws = conectar()
    ws.send(json.dumps({'method': 'ms.remote.control', 'params': {
        'Cmd': base64.b64encode(t.encode()).decode(), 'DataOfCmd': 'base64',
        'TypeOfRemote': 'SendInputString'}}))
    time.sleep(0.5)
    ws.send(json.dumps({'method': 'ms.remote.control', 'params': {
        'TypeOfRemote': 'SendInputEnd'}}))
    ws.close()


def lista_apps():
    ws = conectar()
    ws.send(json.dumps({'method': 'ms.channel.emit', 'params': {
        'event': 'ed.installedApp.get', 'to': 'host'}}))
    fim = time.time() + 10
    while time.time() < fim:
        msg = json.loads(ws.recv())
        if msg.get('event') == 'ed.installedApp.get':
            ws.close()
            return msg['data']['data']
    ws.close()
    return []


def abrir(alvo=None):
    c = ler_config()
    if not alvo:
        alvo = c.get('tizenbrew')
    apps = None
    if not alvo or '.' not in alvo:
        apps = lista_apps()
        busca = (alvo or 'tizenbrew').lower()
        achado = [a for a in apps if busca in a['name'].lower() or busca in a['appId'].lower()]
        if not achado:
            sys.exit('App nao encontrado: %s (rode: python tv.py apps)' % busca)
        alvo = achado[0]['appId']
        if busca == 'tizenbrew':
            c['tizenbrew'] = alvo
            salvar_config(c)
    ws = conectar()
    ws.send(json.dumps({'method': 'ms.channel.emit', 'params': {
        'event': 'ed.apps.launch', 'to': 'host',
        'data': {'appId': alvo, 'action_type': 'DEEP_LINK'}}}))
    time.sleep(1)
    ws.close()
    print('Abrindo', alvo)


def ligar():
    mac = ler_config().get('mac', '64:07:F6:EE:C8:45').replace(':', '').replace('-', '')
    pacote = bytes.fromhex('FF' * 6 + mac * 16)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    for _ in range(3):
        s.sendto(pacote, ('255.255.255.255', 9))
        time.sleep(0.2)
    s.close()
    print('Wake-on-LAN enviado para', mac)


def main(a):
    if not a:
        print(__doc__)
        return
    cmd, resto = a[0], a[1:]
    if cmd == 'achar':
        achar()
    elif cmd == 'parear':
        conectar().close()
        print('Conectado.')
    elif cmd == 'info':
        d = info_tv(ip_tv())['device']
        print(json.dumps({k: d.get(k) for k in ('name', 'modelName', 'PowerState', 'ip', 'wifiMac',
                                                'developerMode', 'developerIP', 'OS')}, indent=2))
    elif cmd == 'tecla':
        teclas(resto)
    elif cmd == 'texto':
        texto(' '.join(resto))
    elif cmd == 'apps':
        for x in sorted(lista_apps(), key=lambda x: x['name'].lower()):
            print('%-40s %s' % (x['appId'], x['name']))
    elif cmd == 'abrir':
        abrir(' '.join(resto) or None)
    elif cmd == 'ligar':
        ligar()
    elif cmd == 'desligar':
        teclas(['KEY_POWER'])
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])

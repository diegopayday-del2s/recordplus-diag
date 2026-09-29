"""Chrome DevTools Protocol na TV: le e controla a pagina aberta no TizenBrew.

Precisa do RecordPlus aberto no TizenBrew (python tv.py abrir).

Uso:
  python cdp.py achar                 procura a porta de debug na TV e salva
  python cdp.py abas                  lista paginas abertas
  python cdp.py js "<codigo>"         roda JavaScript na pagina e mostra o resultado
  python cdp.py clicar "<texto ou seletor css>"
  python cdp.py ir <url>              navega
  python cdp.py recarregar
  python cdp.py foto [arquivo.png]    screenshot da pagina (padrao tv-foto.png)
  python cdp.py diag                  ultimas linhas da barra RP DIAG
  python cdp.py teste <normal|h264|playready|ambos>   liga os testes do modulo e recarrega
  python cdp.py log [minutos]         grava console da TV em tv-log.txt (padrao 10)
"""
import concurrent.futures
import itertools
import json
import os
import socket
import sys
import time
import urllib.request

import websocket  # pip install websocket-client

from tv import ler_config, salvar_config, ip_tv

PASTA = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(PASTA, 'tv-log.txt')
COMUNS = [9222, 9223, 7011, 7012, 7013, 7014, 7015, 9998, 9999, 8888, 8081]


def abas_em(ip, porta, timeout=2):
    with urllib.request.urlopen('http://%s:%d/json' % (ip, porta), timeout=timeout) as r:
        return json.load(r)


def porta_aberta(ip, p):
    s = socket.socket()
    s.settimeout(0.4)
    try:
        return s.connect_ex((ip, p)) == 0
    finally:
        s.close()


def achar(ip):
    print('Procurando porta de debug em %s (pode levar 1 a 2 minutos)...' % ip)
    cand = [p for p in COMUNS if porta_aberta(ip, p)]
    if not cand:
        with concurrent.futures.ThreadPoolExecutor(400) as ex:
            fora = {8001, 8002, 8080, 9197, 7676, 26101}
            portas = [p for p in range(1024, 65536) if p not in fora]
            cand = [p for p, ok in zip(portas, ex.map(lambda p: porta_aberta(ip, p), portas)) if ok]
    for p in cand:
        try:
            abas_em(ip, p)
            c = ler_config()
            c['cdp_porta'] = p
            salvar_config(c)
            print('Porta de debug:', p)
            return p
        except Exception:
            continue
    sys.exit('Porta de debug nao encontrada. O RecordPlus esta aberto no TizenBrew? '
             'Portas abertas vistas: %s' % cand)


def porta(ip):
    p = ler_config().get('cdp_porta')
    if p:
        try:
            abas_em(ip, p)
            return p
        except Exception:
            pass
    return achar(ip)


def aba_principal():
    ip = ip_tv()
    p = porta(ip)
    abas = [a for a in abas_em(ip, p) if a.get('type') == 'page']
    if not abas:
        sys.exit('Nenhuma pagina aberta.')
    rp = [a for a in abas if 'recordplus' in a.get('url', '')]
    a = (rp or abas)[0]
    url = a['webSocketDebuggerUrl']
    # algumas versoes devolvem localhost no link do websocket
    url = url.replace('localhost', ip).replace('127.0.0.1', ip)
    return a, url


class Cdp:
    def __init__(self):
        self.aba, url = aba_principal()
        self.ws = websocket.create_connection(url, timeout=30, suppress_origin=True)
        self.ids = itertools.count(1)
        self.eventos = []

    def cmd(self, metodo, **params):
        i = next(self.ids)
        self.ws.send(json.dumps({'id': i, 'method': metodo, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == i:
                if 'error' in m:
                    raise RuntimeError(m['error'])
                return m.get('result', {})
            self.eventos.append(m)

    def js(self, codigo):
        r = self.cmd('Runtime.evaluate', expression=codigo, awaitPromise=True, returnByValue=True)
        if r.get('exceptionDetails'):
            d = r['exceptionDetails']
            return 'ERRO: ' + ((d.get('exception') or {}).get('description') or d.get('text'))
        return r.get('result', {}).get('value')


CLICAR = r"""
(function (alvo) {
  var el = null;
  try { el = document.querySelector(alvo); } catch (_) {}
  if (!el) {
    /* o menor elemento visivel que contem o texto; texto exato ganha */
    var t = alvo.toLowerCase(), nota = Infinity;
    document.querySelectorAll('a,button,[role=button],[tabindex],input,span,div,p,h1,h2,h3,img').forEach(function (e) {
      var txt = (e.innerText || e.value || e.alt || e.getAttribute('aria-label') || '').trim().toLowerCase();
      var r = e.getBoundingClientRect(), area = r.width * r.height;
      if (!txt || txt.indexOf(t) < 0 || area <= 0) return;
      if (txt !== t) area += 1e9;
      if (area < nota) { nota = area; el = e; }
    });
  }
  if (!el) return 'nao achei: ' + alvo;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return 'clicado: <' + el.tagName.toLowerCase() + '> ' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60);
})(%s)
"""

DIAG = r"""
(function () {
  var linhas = [];
  document.querySelectorAll('div').forEach(function (d) {
    if (d.style && d.style.zIndex === '2147483647') linhas.push(d.innerText);
  });
  return linhas.join('\n') || 'barra RP DIAG nao encontrada';
})()
"""


def log(minutos):
    c = Cdp()
    c.cmd('Runtime.enable')
    c.cmd('Log.enable')
    c.cmd('Network.enable')
    fim = time.time() + minutos * 60
    c.ws.settimeout(5)
    print('Gravando console em %s por %s min (Ctrl+C para parar)...' % (LOG, minutos))
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write('\n==== %s %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), c.aba.get('url')))
        while time.time() < fim:
            try:
                m = json.loads(c.ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            except KeyboardInterrupt:
                break
            me, p = m.get('method'), m.get('params', {})
            linha = None
            if me == 'Runtime.consoleAPICalled':
                partes = [str(a.get('value', a.get('description', ''))) for a in p.get('args', [])]
                linha = '[%s] %s' % (p.get('type'), ' '.join(partes))
            elif me == 'Runtime.exceptionThrown':
                d = p.get('exceptionDetails', {})
                linha = '[excecao] %s' % ((d.get('exception') or {}).get('description') or d.get('text'))
            elif me == 'Log.entryAdded':
                e = p.get('entry', {})
                linha = '[%s] %s %s' % (e.get('level'), e.get('text'), e.get('url', ''))
            elif me == 'Network.responseReceived':
                r = p.get('response', {})
                if r.get('status', 200) >= 400:
                    linha = '[rede %s] %s' % (r.get('status'), r.get('url'))
            elif me == 'Network.loadingFailed':
                linha = '[rede falhou] %s %s' % (p.get('errorText'), p.get('type'))
            elif me == 'Page.frameNavigated' or me == 'Inspector.detached':
                linha = '[%s]' % me
            if linha:
                linha = time.strftime('%H:%M:%S ') + linha
                print(linha)
                f.write(linha + '\n')
                f.flush()


def main(a):
    if not a:
        print(__doc__)
        return
    cmd, resto = a[0], a[1:]
    if cmd == 'achar':
        achar(ip_tv())
    elif cmd == 'abas':
        ip = ip_tv()
        for x in abas_em(ip, porta(ip)):
            print(x.get('type'), '|', x.get('title'), '|', x.get('url'))
    elif cmd == 'js':
        print(json.dumps(Cdp().js(' '.join(resto)), indent=2, ensure_ascii=False))
    elif cmd == 'clicar':
        print(Cdp().js(CLICAR % json.dumps(' '.join(resto))))
    elif cmd == 'ir':
        Cdp().cmd('Page.navigate', url=resto[0])
    elif cmd == 'recarregar':
        Cdp().cmd('Page.reload', ignoreCache=True)
    elif cmd == 'foto':
        import base64
        arq = resto[0] if resto else os.path.join(PASTA, 'tv-foto.png')
        r = Cdp().cmd('Page.captureScreenshot', format='png')
        with open(arq, 'wb') as f:
            f.write(base64.b64decode(r['data']))
        print('Salvo em', arq)
    elif cmd == 'diag':
        print(Cdp().js(DIAG))
    elif cmd == 'teste':
        modo = (resto or ['normal'])[0]
        h, pr = modo in ('h264', 'ambos'), modo in ('playready', 'ambos')
        c = Cdp()
        print(c.js("localStorage.setItem('__rp_h264','%d');localStorage.setItem('__rp_playready','%d');'ok'"
                   % (h, pr)))
        c.cmd('Page.reload', ignoreCache=True)
        print('Modo %s aplicado, pagina recarregando.' % modo)
    elif cmd == 'log':
        log(float(resto[0]) if resto else 10)
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])

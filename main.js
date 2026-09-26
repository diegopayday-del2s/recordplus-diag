/* RecordPlus Diag: injetado pelo TizenBrew no recordplus.com
   1) testa o que o motor (Chromium 69) nao suporta
   2) aplica polyfills do que da para remendar
   3) mostra na tela erros de JS, rede, DRM e player
   Botao VERMELHO do controle: esconde/mostra o painel */
(function () {
  'use strict';
  if (window.__rpDiag) return;
  window.__rpDiag = true;

  var MAX = 80, VISIVEIS = 14;
  var logs = [];
  var stats = { sintaxe: 0, js: 0, rede: 0, bloqueio: 0, drm: 0, video: 0 };
  var box = null, head = null, list = null, visivel = true, tocou = false;
  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;

  function dois(n) { return ('0' + n).slice(-2); }
  function agora() { var d = new Date(); return dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':' + dois(d.getSeconds()); }
  function curto(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '...' : s; }
  function nomeArq(u) { try { return String(u).split('?')[0].split('/').pop() || String(u); } catch (_) { return String(u); } }

  var CORES = { sintaxe: '#ff5c5c', js: '#ff9f43', console: '#ff9f43', rede: '#ffd166', drm: '#ff5cf0', video: '#ff5cf0', ok: '#6be675', info: '#9ecbff' };

  function veredito() {
    if (stats.sintaxe > 0) return ['JS novo demais p/ Chromium 69. Sem correcao do nosso lado.', '#ff5c5c'];
    if (stats.drm > 0) return ['Licenca DRM recusada ou falhou. Sem contorno legitimo.', '#ff5cf0'];
    if (stats.bloqueio > 0) return ['Servidor recusando (401/403): login ou dispositivo bloqueado.', '#ffd166'];
    if (stats.video > 0) return ['Player falhou (ver codigo do erro).', '#ff5cf0'];
    if (tocou) return ['VIDEO TOCANDO. Funcionou.', '#6be675'];
    if (stats.js > 0) return ['Erros de JS em execucao, ver lista.', '#ff9f43'];
    return ['Sem erro ate agora. Faca login e de play.', '#9ecbff'];
  }

  function montar() {
    if (box) return;
    var raiz = document.documentElement;
    if (!raiz || !document.body) { setTimeout(montar, 150); return; }
    box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;max-height:40%;overflow:hidden;' +
      'background:rgba(0,0,0,0.85);color:#fff;font:15px/1.35 monospace;z-index:2147483647;' +
      'pointer-events:none;padding:8px 14px;box-sizing:border-box;');
    head = document.createElement('div');
    head.setAttribute('style', 'font-weight:bold;margin-bottom:6px;white-space:nowrap;overflow:hidden;');
    list = document.createElement('div');
    box.appendChild(head);
    box.appendChild(list);
    raiz.appendChild(box);
    render();
  }

  function render() {
    if (!box) return;
    box.style.display = visivel ? 'block' : 'none';
    var v = veredito();
    head.innerHTML = '';
    var s1 = document.createElement('span');
    s1.textContent = 'RP DIAG | sintaxe ' + stats.sintaxe + ' | js ' + stats.js + ' | rede ' + stats.rede +
      ' (' + stats.bloqueio + ' bloq) | drm ' + stats.drm + ' | video ' + stats.video + ' | ';
    var s2 = document.createElement('span');
    s2.style.color = v[1];
    s2.textContent = v[0];
    head.appendChild(s1); head.appendChild(s2);
    list.innerHTML = '';
    var ini = Math.max(0, logs.length - VISIVEIS);
    for (var i = ini; i < logs.length; i++) {
      var l = logs[i], d = document.createElement('div');
      d.style.color = CORES[l.tipo] || '#fff';
      d.style.whiteSpace = 'nowrap';
      d.style.overflow = 'hidden';
      d.textContent = l.t + ' [' + l.tipo + '] ' + l.msg;
      list.appendChild(d);
    }
  }

  function log(tipo, msg) {
    logs.push({ t: agora(), tipo: tipo, msg: curto(msg, 260) });
    if (logs.length > MAX) logs.shift();
    render();
  }

  /* ---------- 1) o que falta no motor ---------- */
  var faltaSintaxe = [], faltaApi = [];
  function testaSintaxe(nome, codigo) { try { new Function(codigo); } catch (_) { faltaSintaxe.push(nome); } }
  function testaApi(nome, fn) { try { if (!fn()) faltaApi.push(nome); } catch (_) { faltaApi.push(nome); } }

  testaSintaxe('?.', 'var a={};return a?.b;');
  testaSintaxe('??', 'var a=null;return a??1;');
  testaSintaxe('class fields', 'class A{x=1}');
  testaSintaxe('#privado', 'class A{#x=1;g(){return this.#x}}');
  testaSintaxe('1_000', 'return 1_000;');
  testaSintaxe('&&=', 'var a=1;a&&=2;');

  testaApi('globalThis', function () { return typeof globalThis !== 'undefined'; });
  testaApi('Object.fromEntries', function () { return Object.fromEntries; });
  testaApi('Promise.allSettled', function () { return Promise.allSettled; });
  testaApi('String.replaceAll', function () { return String.prototype.replaceAll; });
  testaApi('Array.at', function () { return Array.prototype.at; });
  testaApi('Object.hasOwn', function () { return Object.hasOwn; });
  testaApi('structuredClone', function () { return window.structuredClone; });
  testaApi('queueMicrotask', function () { return window.queueMicrotask; });
  testaApi('Array.findLast', function () { return Array.prototype.findLast; });

  /* ---------- 2) polyfills ---------- */
  function def(obj, nome, fn) { if (!obj[nome]) { try { Object.defineProperty(obj, nome, { value: fn, writable: true, configurable: true }); } catch (_) { obj[nome] = fn; } } }

  if (typeof globalThis === 'undefined') { window.globalThis = window; }
  def(Object, 'fromEntries', function (it) { var o = {}; Array.from(it).forEach(function (p) { o[p[0]] = p[1]; }); return o; });
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(Promise, 'allSettled', function (ps) {
    return Promise.all(Array.from(ps).map(function (p) {
      return Promise.resolve(p).then(function (v) { return { status: 'fulfilled', value: v }; },
        function (r) { return { status: 'rejected', reason: r }; });
    }));
  });
  def(String.prototype, 'replaceAll', function (pat, rep) {
    if (pat instanceof RegExp) {
      if (!pat.global) throw new TypeError('replaceAll precisa de regex com flag g');
      return this.replace(pat, rep);
    }
    return this.replace(new RegExp(String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), rep);
  });
  function at(i) { var n = Math.trunc(i) || 0; if (n < 0) n += this.length; return (n < 0 || n >= this.length) ? undefined : this[n]; }
  def(Array.prototype, 'at', at);
  def(String.prototype, 'at', at);
  def(Array.prototype, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) { if (f.call(t, this[i], i, this)) return this[i]; } return undefined; });
  def(Array.prototype, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) { if (f.call(t, this[i], i, this)) return i; } return -1; });
  def(window, 'queueMicrotask', function (cb) { Promise.resolve().then(cb); });
  def(window, 'structuredClone', function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); });

  /* ---------- 3) captura de erros ---------- */
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t !== window && t.tagName) {
      if (t.tagName === 'VIDEO' || t.tagName === 'AUDIO') {
        stats.video++;
        var me = t.error;
        log('video', 'Erro no player: codigo ' + (me && me.code) + ' ' + ((me && me.message) || ''));
      } else if (t.src || t.href) {
        stats.rede++;
        log('rede', 'Nao carregou ' + t.tagName + ': ' + nomeArq(t.src || t.href));
      }
      return;
    }
    var m = (e && e.message) || 'erro';
    var sint = /SyntaxError|Unexpected token|Unexpected identifier|Invalid regular expression|Invalid or unexpected/i.test(m);
    if (sint) stats.sintaxe++; else stats.js++;
    var onde = e.filename ? ' @ ' + nomeArq(e.filename) + ':' + (e.lineno || 0) : '';
    if (m === 'Script error.') m += ' (arquivo de outro dominio, detalhe oculto)';
    log(sint ? 'sintaxe' : 'js', m + onde);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    stats.js++;
    var r = e && e.reason;
    log('js', 'Promise rejeitada: ' + (r && r.message ? (r.name + ': ' + r.message) : r));
  });

  var ce = console.error;
  console.error = function () {
    try {
      var partes = Array.prototype.slice.call(arguments).map(function (x) {
        if (x && x.message) return x.name + ': ' + x.message;
        if (typeof x === 'object') { try { return JSON.stringify(x); } catch (_) { return String(x); } }
        return String(x);
      });
      log('console', partes.join(' '));
    } catch (_) {}
    return ce.apply(console, arguments);
  };

  var RX_LIC = /licen|widevine|playready|drm|\/wv|modular|keyserver|cenc/i;
  function regRede(status, url, metodo, extra) {
    url = String(url || '');
    if (RX_LIC.test(url)) {
      stats.drm++;
      log('drm', 'Licenca ' + (status || 'sem resposta') + ' ' + (metodo || '') + ' ' + curto(url, 120) + (extra ? ' ' + extra : ''));
      return;
    }
    stats.rede++;
    if (status === 401 || status === 403) stats.bloqueio++;
    log('rede', (status || 'falhou') + ' ' + (metodo || 'GET') + ' ' + curto(url, 140) + (extra ? ' ' + extra : ''));
  }

  if (fetchOriginal) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var metodo = (init && init.method) || (input && input.method) || 'GET';
      return fetchOriginal(input, init).then(function (r) {
        if (!r.ok && r.type !== 'opaque') regRede(r.status, url, metodo);
        return r;
      }, function (err) {
        regRede(0, url, metodo, err && err.message);
        throw err;
      });
    };
  }

  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__rp = { m: m, u: u }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    x.addEventListener('loadend', function () {
      if (x.status >= 400 || (x.status === 0 && x.readyState === 4)) regRede(x.status, x.__rp && x.__rp.u, x.__rp && x.__rp.m);
    });
    return XS.apply(this, arguments);
  };

  /* DRM (EME) */
  function resumoCfg(cfg) {
    try {
      var c = cfg && cfg[0] || {};
      var v = (c.videoCapabilities || []).map(function (k) { return (k.contentType || '') + (k.robustness ? ' rob=' + k.robustness : ''); });
      return curto(v.join(' | ') + (c.persistentState ? ' persist=' + c.persistentState : ''), 180);
    } catch (_) { return ''; }
  }
  if (navigator.requestMediaKeySystemAccess) {
    var rq = navigator.requestMediaKeySystemAccess.bind(navigator);
    navigator.requestMediaKeySystemAccess = function (ks, cfg) {
      log('info', 'DRM pedido: ' + ks + ' ' + resumoCfg(cfg));
      return rq(ks, cfg).then(function (a) { log('ok', 'DRM aceito: ' + ks); return a; },
        function (err) { stats.drm++; log('drm', 'DRM negado: ' + ks + ' ' + (err && err.message)); throw err; });
    };
  }
  if (window.MediaKeySession) {
    var P = MediaKeySession.prototype;
    ['generateRequest', 'update'].forEach(function (n) {
      var o = P[n];
      if (!o) return;
      P[n] = function () {
        var s = this;
        if (!s.__rpk) {
          s.__rpk = 1;
          s.addEventListener('keystatuseschange', function () {
            try {
              s.keyStatuses.forEach(function (a, b) {
                var st = typeof a === 'string' ? a : b;
                if (st === 'usable') log('ok', 'Chave DRM liberada');
                else { stats.drm++; log('drm', 'Chave DRM status: ' + st); }
              });
            } catch (_) {}
          });
        }
        return o.apply(s, arguments).catch(function (err) {
          stats.drm++;
          log('drm', n + ' falhou: ' + (err && (err.name + ' ' + err.message)));
          throw err;
        });
      };
    });
  }

  document.addEventListener('encrypted', function () { log('info', 'Conteudo criptografado detectado'); }, true);
  document.addEventListener('playing', function (e) {
    if (!tocou && e.target && e.target.tagName === 'VIDEO') { tocou = true; log('ok', 'Video tocando'); }
  }, true);

  /* ---------- 4) testa se os scripts do site compilam neste motor ---------- */
  function varrerScripts() {
    if (!fetchOriginal) return;
    var ss = document.querySelectorAll('script[src]');
    Array.prototype.forEach.call(ss, function (s) {
      if (s.__rpv) return;
      s.__rpv = 1;
      if (s.type === 'module') return;
      fetchOriginal(s.src).then(function (r) { return r.text(); }).then(function (txt) {
        try { new Function(txt); }
        catch (err) {
          if (err && err.name === 'SyntaxError') {
            stats.sintaxe++;
            log('sintaxe', 'Arquivo nao compila: ' + nomeArq(s.src) + ' -> ' + err.message);
          }
        }
      }).catch(function () {});
    });
  }

  /* ---------- controle ---------- */
  try { if (window.tizen && tizen.tvinputdevice) tizen.tvinputdevice.registerKey('ColorF0Red'); } catch (_) {}
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 403) { visivel = !visivel; render(); }
  }, true);

  /* ---------- start ---------- */
  montar();
  log('info', 'Inicio: ' + location.href);
  log('info', 'UA: ' + navigator.userAgent);
  if (faltaSintaxe.length) log('sintaxe', 'Motor NAO entende (sem polyfill possivel): ' + faltaSintaxe.join(', '));
  if (faltaApi.length) log('info', 'APIs ausentes, polyfill aplicado: ' + faltaApi.join(', '));

  var voltas = 0;
  document.addEventListener('DOMContentLoaded', varrerScripts);
  var iv = setInterval(function () { varrerScripts(); if (++voltas >= 18) clearInterval(iv); }, 5000);
})();

/* RecordPlus Diag: injetado pelo TizenBrew no recordplus.com
   1) testa o que o motor (Chromium 94 do TizenBrew) nao suporta
   2) aplica polyfills do que da para remendar
   3) mostra na tela erros de JS, rede, DRM e player
   v1.0.2: polyfills ES2023+ (toSorted etc.) que o RecordPlus exige
   v1.0.3: site exige Trusted Types, entao nada de innerHTML; o diag nunca
           pode quebrar fetch/XHR do site; cada linha vai para console.info [RPDIAG]
   v1.0.4: barra so no frame principal do recordplus.com (nao cobre iframe do Google)
   v1.0.5: AbortSignal.timeout/any/abort/throwIfAborted (login quebrava)
   v1.0.6: log de codecs/buffers do player; testes pelo controle (so H.264,
           so PlayReady, abrir app oficial ctv.recordplus.com/tizen) */
(function () {
  'use strict';
  if (window.__rpDiag) return;
  window.__rpDiag = true;

  var MAX = 80, VISIVEIS = 14;
  var logs = [];
  var stats = { sintaxe: 0, js: 0, faltaFn: 0, rede: 0, bloqueio: 0, drm: 0, video: 0 };
  var box = null, head = null, list = null, visivel = true, tocou = false;
  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;

  function dois(n) { return ('0' + n).slice(-2); }
  function agora() { var d = new Date(); return dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':' + dois(d.getSeconds()); }
  function curto(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '...' : s; }
  function nomeArq(u) { try { return String(u).split('?')[0].split('/').pop() || String(u); } catch (_) { return String(u); } }

  var CORES = { sintaxe: '#ff5c5c', js: '#ff9f43', console: '#ff9f43', rede: '#ffd166', drm: '#ff5cf0', video: '#ff5cf0', ok: '#6be675', info: '#9ecbff' };

  function veredito() {
    if (stats.sintaxe > 0) return ['JS novo demais p/ Chromium 94. Sem correcao do nosso lado.', '#ff5c5c'];
    if (stats.drm > 0) return ['Licenca DRM recusada ou falhou. Sem contorno legitimo.', '#ff5cf0'];
    if (stats.faltaFn > 0) return ['Falta funcao no motor (ver linha amarela). Da pra remendar.', '#ff9f43'];
    if (stats.bloqueio > 0) return ['Servidor recusando (401/403): login ou dispositivo bloqueado.', '#ffd166'];
    if (stats.video > 0) return ['Player falhou (ver codigo do erro).', '#ff5cf0'];
    if (tocou) return ['VIDEO TOCANDO. Funcionou.', '#6be675'];
    if (stats.js > 0) return ['Erros de JS em execucao, ver lista.', '#ff9f43'];
    return ['Sem erro ate agora. Faca login e de play.', '#9ecbff'];
  }

  /* TizenBrew injeta em todo frame (inclusive iframes do Google); barra so na pagina principal */
  var principal = false;
  try { principal = window.top === window && /(^|\.)recordplus\.com$/.test(location.hostname); } catch (_) {}

  function montar() {
    if (box || !principal) return;
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

  /* innerHTML = '' e bloqueado pelo Trusted Types do site */
  function limpa(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function render() {
    if (!box) return;
    box.style.display = visivel ? 'block' : 'none';
    var v = veredito();
    limpa(head);
    var s1 = document.createElement('span');
    s1.textContent = 'RP DIAG | sintaxe ' + stats.sintaxe + ' | js ' + stats.js + ' | rede ' + stats.rede +
      ' (' + stats.bloqueio + ' bloq) | drm ' + stats.drm + ' | video ' + stats.video + ' | ';
    var s2 = document.createElement('span');
    s2.style.color = v[1];
    s2.textContent = v[0];
    head.appendChild(s1); head.appendChild(s2);
    limpa(list);
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

  var ci = console.info;
  function log(tipo, msg) {
    logs.push({ t: agora(), tipo: tipo, msg: curto(msg, 260) });
    if (logs.length > MAX) logs.shift();
    try { ci.call(console, '[RPDIAG] [' + tipo + '] ' + msg); } catch (_) {}
    try { render(); } catch (_) {}
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
  testaApi('Array.toSorted', function () { return Array.prototype.toSorted; });
  testaApi('Array.toReversed', function () { return Array.prototype.toReversed; });
  testaApi('Array.toSpliced', function () { return Array.prototype.toSpliced; });
  testaApi('Array.with', function () { return Array.prototype['with']; });
  testaApi('Object.groupBy', function () { return Object.groupBy; });
  testaApi('Map.groupBy', function () { return Map.groupBy; });
  testaApi('Promise.withResolvers', function () { return Promise.withResolvers; });
  testaApi('Set.union', function () { return Set.prototype.union; });
  testaApi('String.isWellFormed', function () { return String.prototype.isWellFormed; });
  testaApi('Array.fromAsync', function () { return Array.fromAsync; });

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
  function clonar(v, vis) {
    if (v === null || typeof v !== 'object') return v;
    if (vis.has(v)) return vis.get(v);
    var r, i;
    if (v instanceof Date) { r = new Date(v.getTime()); }
    else if (v instanceof RegExp) { r = new RegExp(v.source, v.flags); }
    else if (v instanceof Map) { r = new Map(); vis.set(v, r); v.forEach(function (val, k) { r.set(clonar(k, vis), clonar(val, vis)); }); return r; }
    else if (v instanceof Set) { r = new Set(); vis.set(v, r); v.forEach(function (val) { r.add(clonar(val, vis)); }); return r; }
    else if (v instanceof ArrayBuffer) { r = v.slice(0); }
    else if (ArrayBuffer.isView(v)) { r = v.slice ? v.slice() : new v.constructor(v.buffer.slice(0)); }
    else if (Array.isArray(v)) { r = []; vis.set(v, r); for (i = 0; i < v.length; i++) r[i] = clonar(v[i], vis); return r; }
    else { r = {}; vis.set(v, r); Object.keys(v).forEach(function (k) { r[k] = clonar(v[k], vis); }); return r; }
    vis.set(v, r);
    return r;
  }
  def(window, 'structuredClone', function (v) { return clonar(v, new Map()); });

  /* ES2023+: o site usa, o Chromium 94 da TV nao tem */
  function copia(a) { return Array.prototype.slice.call(a); }
  function idx(i, len) { var n = Math.trunc(i) || 0; if (n < 0) n += len; if (n < 0 || n >= len) throw new RangeError('Invalid index : ' + i); return n; }
  def(Array.prototype, 'toSorted', function (cmp) {
    if (cmp !== undefined && typeof cmp !== 'function') throw new TypeError('The comparison function must be either a function or undefined');
    return copia(this).sort(cmp);
  });
  def(Array.prototype, 'toReversed', function () { return copia(this).reverse(); });
  def(Array.prototype, 'toSpliced', function () { var c = copia(this); Array.prototype.splice.apply(c, arguments); return c; });
  def(Array.prototype, 'with', function (i, v) { var n = idx(i, this.length); var c = copia(this); c[n] = v; return c; });

  try {
    var TA = Object.getPrototypeOf(Int8Array.prototype);
    def(TA, 'toSorted', function (cmp) { return this.slice().sort(cmp); });
    def(TA, 'toReversed', function () { return this.slice().reverse(); });
    def(TA, 'with', function (i, v) { var n = idx(i, this.length); var c = this.slice(); c[n] = v; return c; });
    def(TA, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) { if (f.call(t, this[i], i, this)) return this[i]; } return undefined; });
    def(TA, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) { if (f.call(t, this[i], i, this)) return i; } return -1; });
  } catch (_) {}

  def(Object, 'groupBy', function (items, fn) {
    var o = Object.create(null), i = 0;
    Array.from(items).forEach(function (x) { var k = fn(x, i++); (o[k] = o[k] || []).push(x); });
    return o;
  });
  def(Map, 'groupBy', function (items, fn) {
    var m = new Map(), i = 0;
    Array.from(items).forEach(function (x) { var k = fn(x, i++); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return m;
  });
  def(Promise, 'withResolvers', function () {
    var r = {};
    r.promise = new this(function (res, rej) { r.resolve = res; r.reject = rej; });
    return r;
  });

  function chaves(o) { return Array.from(typeof o.keys === 'function' ? o.keys() : o); }
  def(Set.prototype, 'union', function (o) { var r = new Set(this); chaves(o).forEach(function (x) { r.add(x); }); return r; });
  def(Set.prototype, 'intersection', function (o) { var r = new Set(); this.forEach(function (x) { if (o.has(x)) r.add(x); }); return r; });
  def(Set.prototype, 'difference', function (o) { var r = new Set(); this.forEach(function (x) { if (!o.has(x)) r.add(x); }); return r; });
  def(Set.prototype, 'symmetricDifference', function (o) { var s = this, r = new Set(this); chaves(o).forEach(function (x) { if (s.has(x)) r['delete'](x); else r.add(x); }); return r; });
  def(Set.prototype, 'isSubsetOf', function (o) { var ok = true; this.forEach(function (x) { if (!o.has(x)) ok = false; }); return ok; });
  def(Set.prototype, 'isSupersetOf', function (o) { var s = this; return chaves(o).every(function (x) { return s.has(x); }); });
  def(Set.prototype, 'isDisjointFrom', function (o) { var ok = true; this.forEach(function (x) { if (o.has(x)) ok = false; }); return ok; });

  def(String.prototype, 'isWellFormed', function () {
    return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(String(this));
  });
  def(String.prototype, 'toWellFormed', function () {
    return String(this).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF])[\uDC00-\uDFFF]|^[\uDC00-\uDFFF]/g,
      function (m, p) { return p ? p + '\uFFFD' : '\uFFFD'; });
  });

  def(Array, 'fromAsync', function (it, fn, t) {
    var arr = Array.from(it), out = [], i = 0;
    function passo() {
      if (i >= arr.length) return Promise.resolve(out);
      var n = i++;
      return Promise.resolve(arr[n]).then(function (x) { return fn ? fn.call(t, x, n) : x; })
        .then(function (y) { out.push(y); return passo(); });
    }
    return passo();
  });

  /* AbortSignal.timeout / any / throwIfAborted (Chrome 100+), usados no login */
  if (window.AbortSignal) {
    def(AbortSignal, 'timeout', function (ms) {
      var c = new AbortController();
      setTimeout(function () { try { c.abort(new DOMException('signal timed out', 'TimeoutError')); } catch (_) { c.abort(); } }, ms);
      return c.signal;
    });
    def(AbortSignal, 'any', function (sinais) {
      var c = new AbortController();
      Array.from(sinais).some(function (s) {
        if (s.aborted) { c.abort(s.reason); return true; }
        s.addEventListener('abort', function () { c.abort(s.reason); }, { once: true });
        return false;
      });
      return c.signal;
    });
    def(AbortSignal, 'abort', function (r) { var c = new AbortController(); c.abort(r); return c.signal; });
    def(AbortSignal.prototype, 'throwIfAborted', function () {
      if (this.aborted) throw this.reason || new DOMException('signal is aborted without reason', 'AbortError');
    });
  }

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
    var fx2 = /\.?([A-Za-z_$][\w$]*) is not a function/.exec(m);
    if (fx2) { stats.faltaFn++; log('js', 'Funcao ausente no motor: ' + fx2[1] + ' (mandar pro Claude)'); }
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
      var txt = partes.join(' ');
      var fx = /\.?([A-Za-z_$][\w$]*) is not a function/.exec(txt);
      if (fx) { stats.faltaFn++; log('js', 'Funcao ausente no motor: ' + fx[1] + ' (mandar pro Claude)'); }
      log('console', txt);
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
    if (status === 401 && /\/api\/session/.test(url)) { log('info', 'Sessao sem login ainda (401 normal): ' + curto(url, 80)); return; }
    stats.rede++;
    if (status === 401 || status === 403) stats.bloqueio++;
    log('rede', (status || 'falhou') + ' ' + (metodo || 'GET') + ' ' + curto(url, 140) + (extra ? ' ' + extra : ''));
  }

  if (fetchOriginal) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var metodo = (init && init.method) || (input && input.method) || 'GET';
      return fetchOriginal(input, init).then(function (r) {
        try { if (!r.ok && r.type !== 'opaque') regRede(r.status, url, metodo); } catch (_) {}
        return r;
      }, function (err) {
        try { regRede(0, url, metodo, err && err.message); } catch (_) {}
        throw err;
      });
    };
  }

  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__rp = { m: m, u: u }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    x.addEventListener('loadend', function () {
      try { if (x.status >= 400 || (x.status === 0 && x.readyState === 4)) regRede(x.status, x.__rp && x.__rp.u, x.__rp && x.__rp.m); } catch (_) {}
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

  /* ---------- 5) navegacao pelo controle: o site nao tem foco espacial ---------- */
  /*NAV-INICIO*/
  function navegacao() {
    if (window.__rpNav) return;
    window.__rpNav = true;
    var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),' +
      '[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox]';
    var atual = null, antes = null;

    function ok(e) {
      if (box && box.contains(e)) return false;
      if (e.disabled || e.getAttribute('aria-hidden') === 'true') return false;
      var r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      var cs = getComputedStyle(e);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    }
    function lista() { return Array.prototype.filter.call(document.querySelectorAll(SEL), ok); }
    function campo(e) { return e && (e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(e.type))); }
    function desmarca() {
      if (atual && antes) { atual.style.outline = antes[0]; atual.style.boxShadow = antes[1]; }
    }
    function marca(e) {
      if (atual !== e) { desmarca(); antes = [e.style.outline, e.style.boxShadow]; }
      atual = e;
      e.style.outline = '4px solid #ffd166';
      e.style.boxShadow = '0 0 0 8px rgba(255,209,102,0.35)';
      /* campo de texto so recebe foco no OK (foco abre o teclado da TV) */
      if (campo(e)) { if (document.activeElement && document.activeElement !== e) document.activeElement.blur(); }
      else { try { e.focus({ preventScroll: true }); } catch (_) {} }
      try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
    }
    function centro(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    function mover(dir) {
      var l = lista();
      if (!l.length) return;
      var ref = atual && document.contains(atual) && ok(atual) ? atual : null;
      if (!ref) { marca(l.filter(campo)[0] || l[0]); return; }
      var a = ref.getBoundingClientRect(), ca = centro(a), melhor = null, nota = Infinity;
      l.forEach(function (e) {
        if (e === ref || ref.contains(e) || e.contains(ref)) return;
        var b = e.getBoundingClientRect(), cb = centro(b), prim, sec;
        if (dir === 'dir') { if (cb.x <= ca.x + 1) return; prim = b.left - a.right; sec = Math.abs(cb.y - ca.y); }
        else if (dir === 'esq') { if (cb.x >= ca.x - 1) return; prim = a.left - b.right; sec = Math.abs(cb.y - ca.y); }
        else if (dir === 'baixo') { if (cb.y <= ca.y + 1) return; prim = b.top - a.bottom; sec = Math.abs(cb.x - ca.x); }
        else { if (cb.y >= ca.y - 1) return; prim = a.top - b.bottom; sec = Math.abs(cb.x - ca.x); }
        var n = Math.max(prim, 0) + sec * 2;
        if (n < nota) { nota = n; melhor = e; }
      });
      if (melhor) marca(melhor);
      else if (dir === 'baixo') window.scrollBy(0, 400);
      else if (dir === 'cima') window.scrollBy(0, -400);
    }
    var SETAS = { 37: 'esq', 38: 'cima', 39: 'dir', 40: 'baixo' };
    window.addEventListener('keydown', function (ev) {
      var k = ev.keyCode, d = SETAS[k];
      var editando = campo(atual) && document.activeElement === atual;
      if (d) {
        if (editando && (d === 'esq' || d === 'dir')) {
          try { var p = atual.selectionStart; if ((d === 'esq' && p > 0) || (d === 'dir' && p < atual.value.length)) return; } catch (_) {}
        }
        ev.preventDefault(); ev.stopPropagation();
        if (editando) atual.blur();
        mover(d);
      } else if (k === 13 && atual && document.contains(atual)) {
        if (editando) return;
        ev.preventDefault(); ev.stopPropagation();
        if (campo(atual)) { atual.focus(); try { atual.click(); } catch (_) {} }
        else atual.click();
      } else if ((k === 65376 || k === 65385) && editando) {
        /* Concluir / Cancelar do teclado da TV */
        atual.blur();
      }
    }, true);
    /* a navegacao nativa do Tizen age no keyup/keypress e brigava com a nossa */
    ['keyup', 'keypress'].forEach(function (t) {
      window.addEventListener(t, function (ev) {
        var editando = campo(atual) && document.activeElement === atual;
        if (SETAS[ev.keyCode] || (ev.keyCode === 13 && !editando)) { ev.preventDefault(); ev.stopPropagation(); }
      }, true);
    });
    document.addEventListener('focusin', function (ev) {
      var e = ev.target;
      if (e && e !== atual && e.matches && e.matches(SEL) && ok(e)) marca(e);
    }, true);
    setTimeout(function () { if (!atual) mover('baixo'); }, 1500);
  }
  /*NAV-FIM*/
  /* desligada ate resolver a briga com a navegacao nativa do Tizen */
  if (principal && window.__rpNavLigada) { try { navegacao(); } catch (e) { log('js', 'navegacao: ' + e.message); } }

  /* ---------- 6) testes de video ligados pelo controle (v1.0.6) ---------- */
  function lerOpc(k) { try { return localStorage.getItem('__rp_' + k) === '1'; } catch (_) { return false; } }
  function gravarOpc(k, v) { try { localStorage.setItem('__rp_' + k, v ? '1' : '0'); } catch (_) {} }
  var opc = { h264: lerOpc('h264'), playready: lerOpc('playready') };

  var RX_CODEC_PESADO = /hvc1|hev1|dvh1|dvhe|av01|vp09|vp9|ec-3|ac-3|mp4a\.a6|mp4a\.a5/i;
  if (window.MediaSource) {
    var its = MediaSource.isTypeSupported.bind(MediaSource);
    var vistos = {};
    MediaSource.isTypeSupported = function (t) {
      var r = its(t);
      if (r && opc.h264 && RX_CODEC_PESADO.test(t)) r = false;
      if (!vistos[t]) { vistos[t] = 1; log('info', 'Codec ' + (r ? 'SIM' : 'nao') + ': ' + curto(t, 110)); }
      return r;
    };
    var asb = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (t) {
      log('info', 'Player abriu buffer: ' + curto(t, 120));
      try { return asb.apply(this, arguments); }
      catch (err) { stats.video++; log('video', 'Buffer recusado: ' + t + ' ' + err.message); throw err; }
    };
  }
  if (navigator.requestMediaKeySystemAccess && opc.playready) {
    var rq2 = navigator.requestMediaKeySystemAccess;
    navigator.requestMediaKeySystemAccess = function (ks) {
      if (/widevine/i.test(ks)) return Promise.reject(new DOMException('Widevine desligado pelo teste', 'NotSupportedError'));
      return rq2.apply(navigator, arguments);
    };
  }

  /* o erro ja e pego no capture do window; aqui so o caminho ate ele */
  function vigiaVideo(v) {
    if (v.__rpv2) return;
    v.__rpv2 = 1;
    ['loadedmetadata', 'waiting', 'stalled'].forEach(function (t) {
      v.addEventListener(t, function () {
        if (t === 'loadedmetadata') log('ok', 'Video ' + v.videoWidth + 'x' + v.videoHeight + ' carregou metadados');
        else log('info', 'Video ' + t + ' em ' + Math.round(v.currentTime) + 's');
      });
    });
  }
  setInterval(function () { Array.prototype.forEach.call(document.getElementsByTagName('video'), vigiaVideo); }, 1000);

  var OFICIAL = 'https://ctv.recordplus.com/tizen/';
  function alterna(k, nome) {
    opc[k] = !opc[k];
    gravarOpc(k, opc[k]);
    log('info', nome + (opc[k] ? ' LIGADO' : ' desligado') + ', recarregando...');
    setTimeout(function () { location.reload(); }, 1200);
  }

  /* ---------- controle ---------- */
  try {
    if (window.tizen && tizen.tvinputdevice) {
      ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (_) {}
      });
    }
  } catch (_) {}
  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 403) { visivel = !visivel; render(); }
    else if (k === 404) alterna('h264', 'Teste so H.264/AAC');
    else if (k === 406) alterna('playready', 'Teste so PlayReady');
    else if (k === 405) {
      var naOficial = location.hostname.indexOf('ctv.') === 0;
      log('info', naOficial ? 'Voltando para o site...' : 'Abrindo app oficial de TV...');
      setTimeout(function () { location.href = naOficial ? 'https://www.recordplus.com/' : OFICIAL; }, 800);
    } else return;
    if (principal) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- start ---------- */
  montar();
  if (!principal) { log('info', 'Frame: ' + curto(location.href, 100)); return; }
  log('info', 'Inicio: ' + location.href);
  log('info', 'UA: ' + navigator.userAgent);
  if (faltaSintaxe.length) log('sintaxe', 'Motor NAO entende (sem polyfill possivel): ' + faltaSintaxe.join(', '));
  if (faltaApi.length) log('info', 'APIs ausentes, polyfill aplicado: ' + faltaApi.join(', '));
  log('info', 'Testes: H.264 ' + (opc.h264 ? 'LIGADO' : 'off') + ' | PlayReady ' + (opc.playready ? 'LIGADO' : 'off') +
    ' | player nativo (webapis.avplay): ' + (window.webapis && webapis.avplay ? 'SIM' : 'nao'));
  try { log('info', 'SUPPORTED_BROWSER = ' + curto(localStorage.getItem('SUPPORTED_BROWSER'), 80)); } catch (_) {}
  log('ok', 'Controle: VERMELHO esconde barra | VERDE so H.264 | AMARELO app oficial de TV | AZUL so PlayReady');

  var voltas = 0;
  document.addEventListener('DOMContentLoaded', varrerScripts);
  var iv = setInterval(function () { varrerScripts(); if (++voltas >= 18) clearInterval(iv); }, 5000);
})();

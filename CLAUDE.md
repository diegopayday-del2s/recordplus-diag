# RecordPlus na TV Samsung

Objetivo: fazer o RecordPlus (streaming da Record) tocar video numa Samsung UN55TU8000 (Tizen 5.5, Chromium 94) via TizenBrew.

## Pecas
- `main.js` + `package.json`: modulo TizenBrew (tipo `mods`) injetado em www.recordplus.com. Polyfills, barra de diagnostico "RP DIAG" e testes de video.
  O TizenBrew baixa pelo jsDelivr a tag mais recente. Para publicar: subir `version` no package.json, commit, `git tag X.Y.Z`, push do main e da tag, depois purge:
  `https://purge.jsdelivr.net/gh/diegopayday-del2s/recordplus-diag/main.js` e `.../package.json`.
- `tv.py`: controle da TV pela rede (teclas, texto, abrir apps, Wake-on-LAN). Token em `tv-token.txt`, IP/MAC/app em `tv-config.json` (fora do git).
- `cdp.py`: Chrome DevTools Protocol na pagina aberta no TizenBrew (js, clicar, foto, diag, teste, log). Setas do controle sao pouco confiaveis no site; preferir `cdp.py clicar`.
- Dependencia: `pip install websocket-client`.

## Estado
- Login funciona (conta ja logada na TV).
- DRM aceito (PlayReady e Widevine), mas o video falha com MediaError codigo 3 (decode).
- Site mostra aviso "Unsupported Browser" (checa `localStorage.SUPPORTED_BROWSER`).
- Existe app oficial de TV em `https://ctv.recordplus.com/tizen/` (usa player nativo `webapis.avplay`).

## v1.0.6 (commit no main; tag 1.0.6 ainda NAO criada, criar e fazer purge)
Testes guardados no localStorage, ligados por `python cdp.py teste <normal|h264|playready|ambos>` ou pelo controle:
- verde: so H.264/AAC (esconde HEVC/AV1/VP9/Dolby do player)
- azul: so PlayReady
- amarelo: abre o app oficial ctv.recordplus.com/tizen/ (de novo volta ao site)
- vermelho: esconde a barra
A barra loga codecs pedidos, buffers abertos (`Player abriu buffer`), metadados do video e se `webapis.avplay` existe.

## Proximos passos
1. `python tv.py achar`, `python tv.py parear`, `python tv.py abrir`, `python cdp.py achar`.
2. Criar tag 1.0.6 e fazer purge. Reabrir o app e conferir a versao na barra.
3. Dar play num video, ler `python cdp.py diag` e `python cdp.py foto`. Testar h264, playready, ambos e o app oficial.

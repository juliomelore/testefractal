/* ============================================================================
   inline-assets — faz a página AR funcionar com DUPLO CLIQUE (file://).

   Em file:// o navegador bloqueia fetch/XHR de arquivos locais. A câmera NÃO é
   o problema: file:// é contexto seguro no Chrome (isSecureContext === true) e
   getUserMedia funciona ali normalmente. O que quebrava era o MindAR tentando
   baixar assets/targets.mind — pedido que morre silenciosamente e deixa a tela
   preta para sempre.

   Em vez de mudar o HTML (o que exigiria montar a cena na ordem certa, algo
   frágil), interceptamos o fetch: quando alguém pede o .mind, devolvemos o
   arquivo que já está em memória, vindo de assets/targets.mind.js. O HTML
   continua escrito de forma normal e funciona igual em servidor e em file://.
============================================================================ */
(function () {
  if (!window.__MIND_DATA_URI) return;

  const alvo = /targets\.mind(\?|$)/;
  const bytes = (function (dataUri) {
    const bin = atob(dataUri.slice(dataUri.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  })(window.__MIND_DATA_URI);

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (alvo.test(url)) {
      console.log('[inline-assets] targets.mind servido da memória (' + bytes.length + ' bytes)');
      return Promise.resolve(new Response(bytes.buffer, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      }));
    }
    return fetchOriginal(input, init);
  };

  // O MindAR de algumas versões usa XHR em vez de fetch — cobrimos os dois.
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mindAlvo = alvo.test(String(url));
    return XHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (!this.__mindAlvo) return XHRSend.apply(this, arguments);
    console.log('[inline-assets] targets.mind servido da memória (via XHR)');
    const self = this;
    setTimeout(function () {
      Object.defineProperty(self, 'response',     { value: bytes.buffer, configurable: true });
      Object.defineProperty(self, 'status',       { value: 200,          configurable: true });
      Object.defineProperty(self, 'readyState',   { value: 4,            configurable: true });
      self.dispatchEvent(new Event('readystatechange'));
      self.dispatchEvent(new Event('load'));
      self.dispatchEvent(new Event('loadend'));
    }, 0);
  };
})();

/* ----------------------------------------------------------------------------
   inline-gltf — carrega o modelo do base64 em memória, via GLTFLoader.parse().
   Nada de fetch, nada de blob: os dois são barrados em file://.
---------------------------------------------------------------------------- */
AFRAME.registerComponent('inline-gltf', {
  init: function () {
    const el = this.el;
    const b64 = window.__RAFA_GLB_B64;
    if (!b64) { el.emit('inline-error', { why: 'assets/rafa.glb.js não carregou' }); return; }

    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    new THREE.GLTFLoader().parse(buf, '', (gltf) => {
      const model = gltf.scene || gltf.scenes[0];
      model.animations = gltf.animations;      // é onde fit-to-target e clip-player procuram
      el.setObject3D('mesh', model);
      el.emit('model-loaded', { format: 'gltf', model: model });
    }, (err) => {
      el.emit('inline-error', { why: String(err && err.message || err) });
    });
  }
});

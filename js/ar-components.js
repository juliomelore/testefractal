/* ------------------------------------------------------------------
   fit-to-target
   Centra e escala o GLB automaticamente sobre o alvo, sem números
   mágicos: mede a bounding box real do modelo depois de carregado.
   O FBX veio deitado no plano XZ (Y para cima, padrão Blender/FBX);
   o alvo do MindAR é o plano XY. Por isso a rotação de +90° em X:
   ela deita o objeto SOBRE a imagem, como se estivesse impresso nela.
------------------------------------------------------------------- */
AFRAME.registerComponent('fit-to-target', {
  schema: {
    widthFraction: { type: 'number', default: 0.82 }, // fração da largura do alvo
    lift:          { type: 'number', default: 0.004 },// folga acima do papel (anti z-fighting)
    offsetX:       { type: 'number', default: 0 },    // desloca no alvo (1.0 = largura do alvo)
    offsetY:       { type: 'number', default: 0 }     // negativo = para baixo do alvo
  },
  init: function () {
    this.userScale = 1;
    this.el.addEventListener('model-loaded', () => this.fit());
  },
  // Box3.setFromObject() NÃO serve aqui: antes da primeira detecção o MindAR
  // deixa a matriz do anchor com valores inválidos (NaN), o que contamina o
  // matrixWorld e devolve uma caixa vazia. Medimos então em espaço LOCAL,
  // acumulando as matrizes a partir da própria entidade.
  localBox: function (root) {
    const box = new THREE.Box3();
    const walk = (obj, parentMat) => {
      obj.updateMatrix();
      const mat = new THREE.Matrix4().multiplyMatrices(parentMat, obj.matrix);
      if (obj.geometry) {
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        box.union(obj.geometry.boundingBox.clone().applyMatrix4(mat));
      }
      obj.children.forEach((c) => walk(c, mat));
    };
    walk(root, new THREE.Matrix4());
    return box;
  },
  fit: function () {
    const obj = this.el.getObject3D('mesh');
    if (!obj) return;

    // 1) deita o objeto no plano da imagem
    this.el.object3D.rotation.set(Math.PI / 2, 0, 0);
    this.el.object3D.scale.set(1, 1, 1);
    this.el.object3D.position.set(0, 0, 0);

    // 2) mede a caixa já rotacionada
    const box = this.localBox(this.el.object3D);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (!isFinite(size.x) || size.x === 0) return;

    this.base = { size: size.clone(), center: center.clone() };
    this.baseScale = this.data.widthFraction / size.x;
    this.apply();

    this.el.emit('fitted', { size: size, scale: this.baseScale }, false);
    console.log('[AR] modelo ajustado — tamanho', size.toArray(), 'escala', this.baseScale);
  },
  apply: function () {
    if (!this.base) return;
    const s = this.baseScale * this.userScale;
    const o = this.el.object3D;
    o.scale.set(s, s, s);
    // centraliza em X/Y e apoia a face de trás no papel, com uma folga
    // O alvo do MindAR tem largura 1, então os offsets são em fração da
    // largura: offsetY -0.36 põe o objeto abaixo do centro da imagem.
    o.position.set(
      -this.base.center.x * s + this.data.offsetX,
      -this.base.center.y * s + this.data.offsetY,
      (this.base.size.z / 2 - this.base.center.z) * s + this.data.lift
    );
  },
  setUserScale: function (f) {
    this.userScale = Math.min(3, Math.max(0.35, this.userScale * f));
    this.apply();
  }
});

/* ------------------------------------------------------------------
   clip-player
   Toca a animação do GLB com um THREE.AnimationMixer próprio (assim não
   é preciso puxar o aframe-extras só por causa do animation-mixer).
   O mixer só avança enquanto o alvo está visível.
------------------------------------------------------------------- */
AFRAME.registerComponent('clip-player', {
  schema: {
    loop:      { type: 'boolean', default: true },
    timeScale: { type: 'number',  default: 1 }
  },
  init: function () {
    this.mixer = null; this.action = null; this.paused = false; this.active = false;
    this.el.addEventListener('model-loaded', (e) => {
      const model = e.detail.model;
      const clips = (model.animations && model.animations.length)
        ? model.animations
        : (this.el.components['gltf-model'].data && []);
      if (!clips || !clips.length) { console.warn('[AR] GLB sem animações'); return; }
      this.mixer = new THREE.AnimationMixer(model);
      this.action = this.mixer.clipAction(clips[0]);
      this.action.setLoop(this.data.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      this.action.clampWhenFinished = !this.data.loop;
      this.action.play();
      this.duration = clips[0].duration;
      console.log('[AR] animação:', clips[0].name, this.duration.toFixed(2) + 's');
    });
  },
  tick: function (t, dt) {
    if (!this.mixer || this.paused || !this.active || !dt) return;
    this.mixer.update((dt / 1000) * this.data.timeScale);
  },
  setActive: function (v) { this.active = v; },
  toggle: function () { this.paused = !this.paused; return this.paused; },
  reset: function () { if (this.mixer) this.mixer.setTime(0); }
});

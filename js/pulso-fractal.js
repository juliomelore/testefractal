/* ============================================================================
   pulso-fractal — recria no navegador a animação que o glTF não sabe carregar.

   NO BLENDER (rafa2.blend), a animação é feita assim:
     - o objeto Curve.009 tem TRÊS modificadores Displace empilhados;
     - cada um é puxado por uma textura Voronoi (PulsoFractal_1/2/3) com
       noise_scale 0.0220 / 0.0105 / 0.0050 — grosso, médio e fino;
     - direção = NORMAL, midlevel = 0, então o deslocamento de cada camada é
           deslocamento = voronoi(posição / noise_scale) * strength
     - as três forças e as três escalas são animadas, 360 keyframes a 30 fps.

   NEM FBX NEM glTF têm modificador Displace ou textura procedural. A única
   forma de levar isso para a web sem assar centenas de megabytes de geometria
   é refazer a conta no vertex shader — que é o que este arquivo faz.

   As curvas vêm de assets/pulso-curvas.js, lidas direto do .blend. O ciclo
   fecha em 180 frames (6 s): o frame 1 é idêntico ao 181.

   O QUE NÃO É IDÊNTICO AO BLENDER: o Voronoi do Cycles usa uma tabela de
   pontos própria; aqui é um Worley F1 com hash. O comportamento (crosta
   fractal que rasteja, na mesma escala e no mesmo ritmo) é o mesmo, o padrão
   exato de células não. `noiseGain` ajusta a amplitude se ficar tímido demais.
============================================================================ */

AFRAME.registerComponent('pulso-fractal', {
  schema: {
    enabled:   { type: 'boolean', default: true },
    noiseGain: { type: 'number',  default: 1.0 },  // multiplica a força das 3 camadas
    timeScale: { type: 'number',  default: 1.0 }
  },

  init: function () {
    this.t = 0;
    this.uniforms = null;
    this.el.addEventListener('model-loaded', () => this.attach());
    if (this.el.getObject3D('mesh')) this.attach();
  },

  attach: function () {
    const curves = window.__PULSO;
    if (!curves) { console.warn('[pulso] assets/pulso-curvas.js não carregou'); return; }
    this.curves = curves;

    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    const U = {
      uStrength:   { value: new THREE.Vector3() },
      uNoiseScale: { value: new THREE.Vector3(0.022, 0.0105, 0.005) }
    };
    this.uniforms = U;

    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uStrength = U.uStrength;
        shader.uniforms.uNoiseScale = U.uNoiseScale;

        shader.vertexShader = `
          uniform vec3 uStrength;
          uniform vec3 uNoiseScale;

          // hash 3D -> ponto de destaque dentro da célula
          vec3 hash3(vec3 p) {
            p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                     dot(p, vec3(269.5, 183.3, 246.1)),
                     dot(p, vec3(113.5, 271.9, 124.6)));
            return fract(sin(p) * 43758.5453123);
          }

          // Worley F1: distância ao ponto mais próximo, ~0..1.
          // É o equivalente do "intensity" da textura Voronoi do Blender.
          float voronoiF1(vec3 p) {
            vec3 g = floor(p), f = p - g;
            float d = 1.0;
            for (int k = -1; k <= 1; k++)
            for (int j = -1; j <= 1; j++)
            for (int i = -1; i <= 1; i++) {
              vec3 o = vec3(float(i), float(j), float(k));
              vec3 r = o + hash3(g + o) - f;
              d = min(d, length(r));
            }
            return clamp(d, 0.0, 1.0);
          }

          // as três camadas somadas, exatamente como os três Displace empilhados
          float pulso(vec3 pos) {
            return voronoiF1(pos / uNoiseScale.x) * uStrength.x
                 + voronoiF1(pos / uNoiseScale.y) * uStrength.y
                 + voronoiF1(pos / uNoiseScale.z) * uStrength.z;
          }
        ` + shader.vertexShader;

        // A normal precisa ser recalculada, senão a superfície continua lisa e
        // o relevo não aparece no metal. Fazemos por diferenças finitas: dois
        // pontos vizinhos no plano tangente, deslocados como o vértice central,
        // e a normal do triângulo que os três formam.
        //
        // Ordem importa: no shader do three.js o <beginnormal_vertex> vem ANTES
        // do <begin_vertex>, e é lá que objectNormal é definido — mexer nele
        // depois seria tarde. Então a normal é perturbada ali, e o
        // deslocamento do vértice é aplicado no begin_vertex, reaproveitando o
        // valor já calculado.
        shader.vertexShader = shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          `
          #include <beginnormal_vertex>
          float pulsoD = pulso(position);
          {
            vec3 n = normalize(normal);
            vec3 t1 = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0))
                                                : cross(n, vec3(1.0, 0.0, 0.0)));
            vec3 t2 = cross(n, t1);                  // (t1, t2, n) e destro
            float h = uNoiseScale.z * 0.5;           // passo = metade da celula mais fina

            vec3 p0 = position + n * pulsoD;
            vec3 pa = position + t1 * h;  pa += n * pulso(pa);
            vec3 pb = position + t2 * h;  pb += n * pulso(pb);

            vec3 nd = cross(pa - p0, pb - p0);
            if (dot(nd, n) < 0.0) nd = -nd;
            objectNormal = normalize(mix(n, normalize(nd), 0.85));
          }
          `
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          transformed += normalize(normal) * pulsoD;
          `
        );
      };
      m.needsUpdate = true;
    });

    console.log('[pulso] shader aplicado — 3 camadas Voronoi, ciclo de',
                (curves.frames / curves.fps).toFixed(1) + 's');
  },

  tick: function (time, dt) {
    if (!this.uniforms || !this.curves || !this.data.enabled || !dt) return;
    if (this.paused) return;

    this.t += (dt / 1000) * this.data.timeScale;
    const c = this.curves;
    const period = c.frames / c.fps;                    // 6 s
    const f = ((this.t % period) / period) * c.frames;  // posição em frames
    const i = Math.floor(f), j = (i + 1) % c.frames, a = f - i;
    const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * a;

    const g = this.data.noiseGain;
    this.uniforms.uStrength.value.set(
      lerp(c.strength[0]) * g, lerp(c.strength[1]) * g, lerp(c.strength[2]) * g
    );
    this.uniforms.uNoiseScale.value.set(
      lerp(c.noiseScale[0]), lerp(c.noiseScale[1]), lerp(c.noiseScale[2])
    );
  },

  setActive: function (v) { this.paused = !v; },
  reset: function () { this.t = 0; }
});

/* ----------------------------------------------------------------------------
   metal-env — um metal sem nada para refletir renderiza quase preto.
   Gera um ambiente mínimo (gradiente céu/chão) e o usa como envMap da cena,
   o que faz o azul metálico do SVGMat aparecer de verdade.
---------------------------------------------------------------------------- */
AFRAME.registerComponent('metal-env', {
  schema: { intensity: { type: 'number', default: 1.0 } },
  init: function () {
    const sceneEl = this.el.sceneEl || this.el;
    const build = () => {
      const renderer = sceneEl.renderer;
      if (!renderer) return;

      const c = document.createElement('canvas');
      c.width = 16; c.height = 128;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0.00, '#ffffff');   // luz do alto
      grad.addColorStop(0.45, '#c9d6e8');
      grad.addColorStop(0.55, '#8fa0b4');   // linha do horizonte
      grad.addColorStop(1.00, '#3a3f47');   // chão
      g.fillStyle = grad; g.fillRect(0, 0, 16, 128);

      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;

      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const env = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose(); tex.dispose();

      sceneEl.object3D.environment = env;
      sceneEl.object3D.environmentIntensity = this.data.intensity;
      console.log('[metal-env] ambiente aplicado');
    };
    if (sceneEl.renderer) build(); else sceneEl.addEventListener('render-target-loaded', build);
  }
});

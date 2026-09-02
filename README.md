# Fractal Arts — experiência Web-AR (objeto 3D animado sobre imagem-alvo)

Pacote pronto para hospedar. Nada aqui depende de CDN: A-Frame, MindAR e o
decodificador Draco estão em `vendor/`.

O que acontece: o visitante abre a página no celular, aponta a câmera para a
**imagem-alvo impressa**, e o logo 3D "Fractal Arts" aparece **deitado sobre a
imagem**, com a animação rodando em loop.

---

## 1. Conteúdo

```
index.html              a página AR — DUPLO CLIQUE, funciona sem servidor
previa.html             o objeto sobre o alvo, sem câmera (conferir enquadramento)
js/ar-components.js     os dois componentes A-Frame: fit-to-target e clip-player
serve.sh                servidor local para testar

assets/
  rafa.glb              modelo 3D convertido do rafa.fbx (446 KB)
  rafa.glb.js           o mesmo modelo em base64
  targets.mind.js       o mesmo alvo em base64
  target.png.js         a imagem-alvo em base64
  pulso-curvas.js       as curvas de animação lidas do rafa2.blend
  targets.mind          alvo de imagem compilado para o MindAR
  target.png            imagem-alvo tratada (640 px) — foi ela que gerou o .mind
  target-source.png     imagem original, sem transparência, para referência
  target-print.pdf      folha A4 pronta para imprimir o alvo (~15 cm)

vendor/
  aframe.min.js                    A-Frame 1.5.0
  mindar-image-aframe.prod.js      MindAR 1.2.5 (image tracking)
```

## 2. Testar — é só dar duplo clique

**Duplo clique em `index.html`.** O navegador vai pedir permissão de câmera;
autorize, aponte para o alvo impresso e o logo aparece. Sem terminal, sem
servidor, sem HTTPS.

`previa.html` mostra o objeto sobre o alvo **sem câmera** — serve para conferir
posição e tamanho sem precisar imprimir nada.

### Por que isso funciona, se "web-AR precisa de HTTPS"

Essa regra é meio verdadeira e é onde quase todo mundo tropeça. O detalhe:

- **`file://` é contexto seguro no Chrome.** `window.isSecureContext` devolve
  `true`, e `getUserMedia` funciona ali. A câmera nunca foi o problema.
- O que quebrava era o resto: em `file://` o navegador bloqueia `fetch`/XHR de
  arquivos locais, `blob:` URLs em origem `null`, e imagens locais como textura
  WebGL. O MindAR pedia `assets/targets.mind`, o pedido morria em silêncio, e o
  resultado era tela preta para sempre — que todo mundo confunde com "a câmera
  foi bloqueada".

A solução: modelo, alvo e imagem viajam em base64 dentro de arquivos `.js`,
carregados por `<script src>` (que o navegador permite em `file://`).
`js/inline-assets.js` intercepta o `fetch` do `targets.mind` e devolve os bytes
da memória, então o HTML continua escrito de forma normal e o mesmo arquivo
funciona igual em duplo clique, em servidor local e em HTTPS.

**Onde a câmera realmente não vai:**

| Como abrir | Câmera? |
|---|---|
| Duplo clique (`file://`) | ✅ |
| `http://localhost:8080` | ✅ |
| `https://...` (GitHub Pages etc.) | ✅ |
| `http://192.168.x.x` (celular na rede) | ❌ HTTP em rede não recebe câmera |
| Dentro do Instagram/WhatsApp | ❌ navegador embutido bloqueia |

A página detecta cada um desses casos e diz qual é, em vez de mostrar tela preta.

### Para abrir no celular

O celular não abre `file://` do seu computador, então aí precisa de HTTPS:

```bash
./serve.sh                                    # sobe em http://localhost:8080
cloudflared tunnel --url http://localhost:8080   # devolve uma URL https temporária
```

## 3. O que foi feito com os arquivos de origem

**`rafa.fbx` → `assets/rafa.glb`**

- Convertido com FBX2glTF. A web não carrega FBX de forma confiável; glTF/GLB é
  o formato nativo do three.js/A-Frame.
- Removidos os nós `Camera` e `Light` que o Blender exportou junto — dentro do
  AR eles atrapalhariam a iluminação da cena.
- Otimizado: **7,2 MB → 446 KB**. A malha original tinha 270 mil triângulos —
  exagero para um texto extrudado. Foi simplificada para 32 mil e quantizada
  (`KHR_mesh_quantization`, que o three.js lê nativamente). Comparei os
  renderizados lado a lado: indistinguível.
- Deliberadamente **sem Draco**. Draco daria uns 100 KB a menos, mas exigiria
  um decodificador `.wasm` carregado por `fetch` — que é justamente o que o
  navegador bloqueia em `file://`. Sem Draco, o mesmo `.glb` serve para a
  página AR e para a prévia offline.
- **A animação vai intacta.** Nada foi recriado, reamostrado ou reinterpolado:
  os mesmos **288 keyframes**, os mesmos 11,96 s, os mesmos valores (escala de
  100,000 a 101,124). Confira você mesmo comparando com o FBX.
- O que o FBX trouxe foi **um único canal**: escala no nó `Curve.009`, variando
  **1,12%** ao longo de 12 s — uma "respiração" bem sutil. Se a ideia original
  era outra coisa (letras crescendo, revelação, deformação), ela **não sobreviveu
  à exportação FBX**; nesse caso vale reexportar do Blender direto em glTF, ou
  assar a animação em keyframes antes de exportar.

  > A malha foi simplificada, a animação não. São coisas separadas: o canal
  > animado é a escala do nó, e ela não depende da contagem de triângulos.

**imagem → `assets/targets.mind`**

- Fundo transparente achatado em branco, recortada nas bordas e reduzida para
  640 px; compilada com o compilador do MindAR.
- Qualidade do alvo: **funciona, mas não é ideal.** A compilação encontrou
  ~360 pontos de correspondência (bom para detectar) mas só **32 pontos de
  rastreio** no nível principal (baixo — o ideal são centenas). O motivo é o
  desenho: traço fino preto sobre muito branco, padrão que se repete e é
  **simétrico nos quatro sentidos**.
- Consequência prática: a detecção deve funcionar, mas o objeto pode **tremer**
  e, por causa da simetria, ocasionalmente **travar girado em 90°/180°**.
- Como melhorar, se incomodar: quebrar a simetria e adicionar textura no alvo —
  o nome "Fractal Arts" impresso embaixo, um QR code em um canto, uma foto ou
  um fundo texturizado. Qualquer um desses eleva muito o rastreio. Depois é só
  recompilar em <https://hiukim.github.io/mind-ar-js-doc/tools/compile> e trocar
  o `assets/targets.mind`.

## 4. Imprimir o alvo

`assets/target-print.pdf` — A4, alvo com ~15 cm.

- Imprima em **100%** (desmarque "ajustar à página"), em **papel fosco**.
  Papel brilhante reflete e derruba o rastreio.
- Superfície plana, luz difusa, sem sombra dura em cima.
- Quanto maior o alvo impresso, mais estável e de mais longe ele detecta.

## 5. Publicar (quando for a hora)

A câmera só funciona sob **HTTPS**. Qualquer hospedagem estática serve — é só
subir esta pasta inteira, sem passo de build:

- **GitHub Pages**: coloque a pasta como `ar/` no repositório Pages; fica em
  `https://<usuario>.github.io/<repo>/ar/`.
- **Netlify / Cloudflare Pages / Vercel**: arraste a pasta.
- **Teste rápido a partir da máquina local**: `cloudflared tunnel --url http://localhost:8080`
  ou `ngrok http 8080` — geram uma URL HTTPS temporária que já dá para abrir no
  celular.

Todos os caminhos no HTML são **relativos**, então funciona em subpasta.

## 6. Ajustes que você provavelmente vai querer

Em `index.html`, no elemento `<a-gltf-model id="model">`:

| Atributo | O que faz |
|---|---|
| `fit-to-target="widthFraction: 0.82"` | largura do objeto como fração da largura do alvo. `1.0` = mesma largura do alvo. |
| `fit-to-target="offsetY: -0.36"` | posição vertical no alvo, em fração da largura. `0` = centro, negativo = mais abaixo. |
| `fit-to-target="offsetX: 0"` | o mesmo na horizontal. |
| `fit-to-target="lift: 0.004"` | folga entre o objeto e o papel (evita z-fighting). |
| `pulso-fractal="noiseGain: 1"` | intensidade da deformação fractal. `0` desliga, `2` dobra. |
| `metal-env="intensity: 1.15"` (no `<a-scene>`) | quanto o metal reflete o ambiente. |
| `clip-player="loop: true"` | `false` = toca uma vez e congela no fim. |
| `clip-player="timeScale: 1"` | velocidade da animação. `2` = dobro. |

**Deixar o objeto em pé** (como um totem saindo do papel, em vez de deitado):
em `js/ar-components.js`, na função `fit()`, troque

```js
this.el.object3D.rotation.set(Math.PI / 2, 0, 0);   // deitado (atual)
```

por

```js
this.el.object3D.rotation.set(0, 0, 0);             // em pé
```

O resto (centralizar, escalar, apoiar no papel) se reajusta sozinho — a medida
da bounding box é feita depois da rotação.

**Trocar o modelo**: substitua `assets/rafa.glb`. Não precisa mexer em números:
o componente `fit-to-target` mede o modelo e o encaixa sozinho. Se o novo GLB
não for Draco, ele carrega do mesmo jeito.

## 7. Armadilhas do web-AR já resolvidas aqui

Se você editar o CSS ou o HTML, preserve estas quatro coisas:

1. **`html, body { background: transparent }`** — o MindAR insere o `<video>` da
   câmera em `z-index: -2`. Qualquer fundo opaco pinta por cima dele e a tela
   fica **preta** com a câmera funcionando normalmente. É o bug nº 1 do web-AR.
2. **`z-index: 20` + `pointer-events: auto` nos botões** — sem isso a interface
   HTML fica *atrás* do `<canvas>` e os botões simplesmente não respondem.
3. **HTTPS obrigatório** — `getUserMedia` não roda em `http://` (exceto
   `localhost`). Abrir o arquivo direto (`file://`) também não funciona.
4. **Navegador dentro de app bloqueia a câmera** — abrir o link dentro do
   Instagram/WhatsApp costuma negar a câmera em silêncio. A página tem um
   timeout de 12 s que mostra um aviso pedindo para abrir no Chrome/Safari, em
   vez de deixar a tela preta.

## 8. Detalhes técnicos que podem economizar tempo depois

- `Box3.setFromObject()` **não funciona** dentro de um anchor do MindAR antes da
  primeira detecção: a matriz do anchor vem com valores inválidos e a caixa sai
  vazia. Por isso `fit-to-target` mede em espaço local, acumulando as matrizes na
  mão (função `localBox`).
- A animação usa um `THREE.AnimationMixer` próprio em vez do `animation-mixer` do
  `aframe-extras` — uma dependência a menos, ~40 linhas em `js/ar-components.js`.
  O mixer só avança enquanto o alvo está visível.
- O `.mind` foi compilado com o compilador **offline** do MindAR rodando em
  Node (backend CPU do TensorFlow.js), não no navegador.

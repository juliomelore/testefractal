#!/usr/bin/env bash
# Servidor local — só é necessário para a PÁGINA AR (index.html).
# Para ver a prévia, é só dar DUPLO CLIQUE em previa.html: não precisa disto.
#
# A câmera exige HTTPS. Em http://localhost o Chrome libera a câmera no PRÓPRIO
# computador, mas o celular acessando pelo IP da rede NÃO — aí é preciso HTTPS
# (cloudflared, ngrok, GitHub Pages, Netlify...).
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Servindo em http://localhost:$PORT"
echo "  AR : http://localhost:$PORT/index.html"
python3 -m http.server "$PORT"

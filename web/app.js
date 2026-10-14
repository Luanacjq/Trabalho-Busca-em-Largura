"use strict";

/* =====================================================================
   Busca em Largura · front-end
   - lê a rede do arquivo externo rede_social.json
   - executa a BFS passo a passo, animando a fila e os níveis
   - encontra os 2 usuários mais distantes (uma BFS por usuário)
   - desenha o grafo num <canvas> com layout de forças
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const tela = $("tela");
const ctx = tela.getContext("2d");

const COR = {
  ciano: "#22d3ee", violeta: "#a78bfa", rosa: "#f472b6",
  amarelo: "#facc15", verde: "#34d399", texto: "#e2e8f0", suave: "#94a3b8",
};

const estado = {
  nomes: [],              // ordem dos alunos no arquivo
  nos: new Map(),         // nome -> { nome, x, y, vx, vy, grau, fixo }
  adj: new Map(),         // nome -> [amigos]  (lista de adjacência)
  arestas: [],            // [a, b]
  visual: new Map(),      // nome -> { tipo: 'fila'|'atual'|'visitado', nivel }
  arvore: new Set(),      // arestas usadas pela BFS para descobrir alguém
  caminho: [], corCaminho: COR.ciano, caminhoInicio: 0,
  distOrigem: null,
  ondas: [],
  hover: null, arrasto: null,
  proximoClique: "origem",
  token: 0,
  alpha: 1,
  vista: { s: 1, cx: 0, cy: 0, pronta: false },
  dpr: 1,
  redesenhar: 3,          // quadros pendentes de desenho (renderização sob demanda)
  dados: null,            // rede completa lida do arquivo
  curtos: new Map(),      // nome completo -> nome curto exibido no grafo
};

const chave = (a, b) => (a < b ? a + "\u0000" + b : b + "\u0000" + a);
const corNivel = (n) => `hsl(${190 + Math.min(n, 8) * 16} 85% 62%)`;
const velocidade = () => parseFloat($("velocidade").value);

/* ---------------------------------------------------------------------
   1. Carregar a rede
   --------------------------------------------------------------------- */
const MAX_ALUNOS = 30; // tamanho da turma

// Valida o arquivo e guarda a rede completa; depois monta com a quantidade escolhida
function carregarDados(dados, nomeArquivo) {
  if (!dados || !Array.isArray(dados.alunos) || !Array.isArray(dados.amizades)) {
    throw new Error("O JSON precisa ter as listas \"alunos\" e \"amizades\".");
  }
  const todos = new Set(dados.alunos);
  for (const [a, b] of dados.amizades) {
    if (!todos.has(a) || !todos.has(b)) throw new Error(`Amizade com aluno desconhecido: ${a} – ${b}`);
  }
  if (dados.alunos.length < 2) throw new Error("A rede precisa de pelo menos 2 alunos.");

  estado.dados = dados;
  estado.curtos = nomesCurtos(dados.alunos);
  const maximo = Math.min(MAX_ALUNOS, dados.alunos.length);
  $("quantidade").max = maximo;
  $("quantidade").value = maximo;
  $("qtdMax").textContent = maximo;
  $("nomeArquivo").textContent = nomeArquivo;
  $("modal").hidden = true;
  montarRede(maximo);
}

// Usa os N primeiros alunos do arquivo e só as amizades entre eles
function montarRede(quantidade) {
  const alunos = estado.dados.alunos.slice(0, quantidade);
  const adj = new Map(alunos.map((a) => [a, []]));
  const arestas = [];
  for (const [a, b] of estado.dados.amizades) {
    if (!adj.has(a) || !adj.has(b)) continue; // amizade com quem ficou de fora
    if (a === b || adj.get(a).includes(b)) continue;
    adj.get(a).push(b);
    adj.get(b).push(a);
    arestas.push([a, b]);
  }

  estado.token++;
  estado.nomes = alunos;
  estado.adj = adj;
  estado.arestas = arestas;
  const n = alunos.length;
  posicionarPorNiveis();
  for (let i = 0; i < 400; i++) simular(); // pré-calcula o layout
  estado.alpha = 0.08;
  estado.vista.pronta = false;

  const origemAntes = $("origem").value, destinoAntes = $("destino").value;
  for (const id of ["origem", "destino"]) {
    $(id).innerHTML = alunos.map((a) => `<option>${escapar(a)}</option>`).join("");
  }
  $("origem").value = adj.has(origemAntes) ? origemAntes : alunos[0];
  $("destino").value = adj.has(destinoAntes) && destinoAntes !== $("origem").value ? destinoAntes : alunos[n - 1];
  $("qtdTxt").textContent = n;

  limparTudo();
  animarNumero($("sAlunos"), n);
  animarNumero($("sAmizades"), arestas.length);
  const conexa = bfs(alunos[0]).dist.size === n;
  definirStatus(conexa
    ? `Rede com <b>${n}</b> alunos e <b>${arestas.length}</b> amizades`
    : `Rede com <b>${n}</b> alunos · atenção: nem todos estão ligados entre si`);
}

async function carregarPadrao() {
  try {
    const resp = await fetch("../rede_social.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(resp.statusText);
    carregarDados(await resp.json(), "rede_social.json");
  } catch {
    $("nomeArquivo").textContent = "nenhum arquivo";
    $("modal").hidden = false;
  }
}

function lerArquivo(arquivo) {
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      carregarDados(JSON.parse(leitor.result), arquivo.name);
    } catch (erro) {
      definirStatus(`Erro ao ler <b>${escapar(arquivo.name)}</b>: ${escapar(erro.message)}`);
      alert("Não foi possível ler a rede: " + erro.message);
    }
  };
  leitor.readAsText(arquivo, "utf-8");
}

/* ---------------------------------------------------------------------
   2. Busca em Largura
   --------------------------------------------------------------------- */

// BFS completa: distâncias e pais de todos os alcançáveis
function bfs(origem) {
  const dist = new Map([[origem, 0]]);
  const pai = new Map([[origem, null]]);
  const fila = [origem];
  let inicio = 0; // índice da frente da fila (evita shift O(n))
  while (inicio < fila.length) {
    const atual = fila[inicio++];
    for (const viz of estado.adj.get(atual)) {
      if (!dist.has(viz)) {
        dist.set(viz, dist.get(atual) + 1);
        pai.set(viz, atual);
        fila.push(viz);
      }
    }
  }
  return { dist, pai };
}

// BFS que registra cada passo para a animação (para ao achar o destino)
function bfsPassos(origem, destino) {
  const dist = new Map([[origem, 0]]);
  const pai = new Map([[origem, null]]);
  const fila = [origem];
  const passos = [{ tipo: "inicio", no: origem, fila: [...fila] }];

  while (fila.length) {
    const atual = fila.shift();
    const vizinhos = estado.adj.get(atual);
    passos.push({
      tipo: "visita", no: atual, nivel: dist.get(atual), fila: [...fila],
      vizinhos, jaVistos: vizinhos.filter((v) => dist.has(v)),
    });
    if (atual === destino) {
      passos.push({ tipo: "achou", no: atual, nivel: dist.get(atual) });
      break;
    }
    for (const viz of vizinhos) {
      if (!dist.has(viz)) {
        dist.set(viz, dist.get(atual) + 1);
        pai.set(viz, atual);
        fila.push(viz);
        passos.push({ tipo: "descobre", no: viz, de: atual, nivel: dist.get(viz), fila: [...fila] });
      }
    }
  }
  return { passos, dist, pai };
}

function reconstruirCaminho(pai, destino) {
  if (!pai.has(destino)) return null;
  const caminho = [];
  for (let no = destino; no !== null; no = pai.get(no)) caminho.push(no);
  return caminho.reverse();
}

function usuariosMaisDistantes() {
  let maior = -1;
  let pares = [];
  const excentricidade = new Map();
  estado.nomes.forEach((origem, i) => {
    const { dist } = bfs(origem);
    excentricidade.set(origem, Math.max(...dist.values()));
    for (const [destino, d] of dist) {
      if (estado.nomes.indexOf(destino) <= i) continue; // cada par uma vez
      if (d > maior) { maior = d; pares = [[origem, destino]]; }
      else if (d === maior) pares.push([origem, destino]);
    }
  });
  return { maior, pares, excentricidade };
}

/* ---------------------------------------------------------------------
   3. Animações das buscas
   --------------------------------------------------------------------- */
function dormir(ms, meu) {
  return new Promise((resolve) => setTimeout(() => resolve(meu === estado.token), ms / velocidade()));
}

async function animarBusca() {
  const origem = $("origem").value;
  const destino = $("destino").value;
  const meu = ++estado.token;
  limparVisual();
  $("pares").querySelectorAll(".par").forEach((p) => p.classList.remove("sel"));
  definirStatus(`Buscando de <b>${rotulo(origem)}</b> até <b>${rotulo(destino)}</b>…`, true);

  const { passos, pai } = bfsPassos(origem, destino);
  let anterior = null;

  for (const passo of passos) {
    if (meu !== estado.token) return;
    const no = passo.no;

    if (passo.tipo === "inicio") {
      estado.visual.set(no, { tipo: "fila", nivel: 0 });
      onda(no, COR.amarelo);
      registrar(`Coloca <b>${rotulo(no)}</b> na fila com distância 0.`);
      mostrarFila(passo.fila);
    } else if (passo.tipo === "visita") {
      if (anterior) estado.visual.get(anterior).tipo = "visitado";
      estado.visual.set(no, { tipo: "atual", nivel: passo.nivel });
      anterior = no;
      mostrarFila(passo.fila);
      const ignorados = passo.jaVistos.length ? ` Já vistos: ${passo.jaVistos.map(rotulo).join(", ")}.` : "";
      registrar(`Tira <b>${rotulo(no)}</b> da fila (nível ${passo.nivel}) e olha os amigos: ${passo.vizinhos.map(rotulo).join(", ")}.${ignorados}`);
      definirStatus(`Visitando <b>${rotulo(no)}</b> · nível ${passo.nivel}`, true);
    } else if (passo.tipo === "descobre") {
      estado.visual.set(no, { tipo: "fila", nivel: passo.nivel });
      estado.arvore.add(chave(passo.de, no));
      onda(no, corNivel(passo.nivel));
      mostrarFila(passo.fila);
      registrar(`Descobre <b>${rotulo(no)}</b> via ${rotulo(passo.de)} → distância ${passo.nivel}. Entra no fim da fila.`);
    } else if (passo.tipo === "achou") {
      registrar(`Chegou em <b>${rotulo(no)}</b>! A BFS garante que essa é a menor distância: ${passo.nivel}.`, true);
    }
    if (!(await dormir(passo.tipo === "descobre" ? 280 : 480, meu))) return;
  }
  if (anterior) estado.visual.get(anterior).tipo = "visitado";

  const caminho = reconstruirCaminho(pai, destino);
  mostrarNiveis(origem);
  if (!caminho) {
    $("sDistancia").textContent = "∞";
    $("caminho").innerHTML = `<span class="vazio">não existe ligação entre eles</span>`;
    definirStatus(`Não há caminho entre <b>${rotulo(origem)}</b> e <b>${rotulo(destino)}</b>`);
    return;
  }
  mostrarCaminho(caminho, COR.ciano);
  animarNumero($("sDistancia"), caminho.length - 1);
  definirStatus(`Distância entre <b>${rotulo(origem)}</b> e <b>${rotulo(destino)}</b>: <b>${caminho.length - 1}</b> conexões`);
}

async function animarDistantes() {
  const meu = ++estado.token;
  limparVisual();
  definirStatus("Rodando uma BFS a partir de <b>cada</b> aluno…", true);
  const { maior, pares, excentricidade } = usuariosMaisDistantes();
  if (!pares.length || maior === 0) {
    definirStatus("Nenhum par de alunos está ligado nesta rede");
    $("pares").innerHTML = `<span class="vazio">não há amizades entre os alunos escolhidos</span>`;
    return;
  }

  for (const nome of estado.nomes) {
    const ecc = excentricidade.get(nome);
    estado.visual.set(nome, { tipo: "atual", nivel: ecc });
    onda(nome, corNivel(ecc));
    registrar(`BFS a partir de <b>${rotulo(nome)}</b>: o mais longe está a ${ecc} conexões.`);
    if (!(await dormir(140, meu))) return;
    estado.visual.get(nome).tipo = "visitado";
  }
  registrar(`Maior distância da rede: <b>${maior}</b> (${pares.length} par${pares.length > 1 ? "es" : ""}).`, true);
  if (!(await dormir(500, meu))) return;

  $("pares").innerHTML = "";
  pares.forEach(([a, b], i) => {
    const botao = document.createElement("button");
    botao.className = "par";
    botao.style.animationDelay = `${i * 60}ms`;
    botao.innerHTML = `<span>${rotulo(a)} ↔ ${rotulo(b)}</span><b>${maior}</b>`;
    botao.onclick = () => selecionarPar(a, b, botao);
    $("pares").appendChild(botao);
  });
  animarNumero($("sDiametro"), maior);
  selecionarPar(pares[0][0], pares[0][1], $("pares").firstChild);
}

function selecionarPar(a, b, botao) {
  estado.token++;
  limparVisual();
  $("pares").querySelectorAll(".par").forEach((p) => p.classList.toggle("sel", p === botao));
  $("origem").value = a;
  $("destino").value = b;
  const caminho = reconstruirCaminho(bfs(a).pai, b);
  caminho.forEach((no, i) => estado.visual.set(no, { tipo: "visitado", nivel: i }));
  mostrarCaminho(caminho, COR.rosa);
  mostrarNiveis(a);
  animarNumero($("sDistancia"), caminho.length - 1);
  definirStatus(`Mais distantes: <b>${rotulo(a)}</b> e <b>${rotulo(b)}</b> · ${caminho.length - 1} conexões`);
}

/* ---------------------------------------------------------------------
   4. Painel de saída
   --------------------------------------------------------------------- */
function mostrarCaminho(caminho, cor) {
  estado.caminho = caminho;
  estado.corCaminho = cor;
  estado.caminhoInicio = performance.now();
  const ultimo = caminho.length - 1;
  $("caminho").innerHTML = caminho.map((no, i) => {
    const classe = i === 0 ? "ponta" : i === ultimo ? "fim" : "";
    const atraso = `style="animation-delay:${i * 90}ms"`;
    const seta = i < ultimo ? `<span class="seta" ${atraso}>→</span>` : "";
    return `<span class="no-chip ${classe}" ${atraso}>${rotulo(no)}</span>${seta}`;
  }).join("");
}

function mostrarFila(fila) {
  if (!fila.length) {
    $("fila").innerHTML = `<span class="vazio">vazia</span>`;
    return;
  }
  const visiveis = fila.slice(0, 10).map((n) => `<span class="no-chip">${rotulo(n)}</span>`).join("");
  const resto = fila.length > 10 ? `<span class="vazio">+${fila.length - 10}</span>` : "";
  $("fila").innerHTML = visiveis + resto;
}

function mostrarNiveis(origem) {
  const { dist } = bfs(origem);
  estado.distOrigem = dist;
  const porNivel = [];
  for (const [nome, d] of dist) (porNivel[d] ||= []).push(nome);
  const fora = estado.nomes.filter((n) => !dist.has(n));
  let html = porNivel.map((membros, d) => `
    <div class="nivel" style="animation-delay:${d * 70}ms">
      <span class="n" style="background:${corNivel(d)}">${d}</span>
      <span class="membros">${membros.map(rotulo).join(", ")}</span>
    </div>`).join("");
  if (fora.length) html += `<div class="nivel"><span class="n" style="background:#64748b">∞</span><span class="membros">${fora.map(rotulo).join(", ")}</span></div>`;
  $("niveis").innerHTML = html;
}

function registrar(html, ok = false) {
  pedirDesenho();
  const li = document.createElement("li");
  li.innerHTML = html;
  if (ok) li.className = "ok";
  $("log").appendChild(li);
  $("log").scrollTop = $("log").scrollHeight;
}

function definirStatus(html, ativo = false) {
  $("status").innerHTML = html;
  $("status").classList.toggle("ativo", ativo);
}

function animarNumero(el, alvo) {
  const inicio = performance.now();
  const dur = 700;
  el.parentElement.classList.remove("pulsar");
  void el.offsetWidth;
  el.parentElement.classList.add("pulsar");
  const passo = () => {
    const p = Math.min(Math.max((performance.now() - inicio) / dur, 0), 1);
    el.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function limparVisual() {
  pedirDesenho();
  estado.visual.clear();
  estado.arvore.clear();
  estado.caminho = [];
  estado.ondas = [];
  estado.distOrigem = null;
  $("log").innerHTML = "";
  mostrarFila([]);
}

function limparTudo() {
  estado.token++;
  limparVisual();
  estado.proximoClique = "origem";
  $("sDistancia").textContent = "–";
  $("sDiametro").textContent = "–";
  $("caminho").innerHTML = `<span class="vazio">nenhum ainda</span>`;
  $("niveis").innerHTML = `<span class="vazio">execute uma busca</span>`;
  $("pares").innerHTML = `<span class="vazio">clique em “Usuários mais distantes”</span>`;
  definirStatus("Escolha dois alunos e clique em <b>Encontrar caminho</b>");
}

function onda(nome, cor) {
  estado.ondas.push({ nome, cor, inicio: performance.now() });
}

// "Gabriel Mota da Silva" -> "Gabriel Silva"; se dois ficarem iguais, entra a inicial do meio: "Gabriel M. Silva"
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);
function nomesCurtos(alunos) {
  const partes = (nome) => nome.split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  const curto = new Map(alunos.map((nome) => {
    const p = partes(nome);
    return [nome, p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : nome];
  }));
  const usos = new Map();
  for (const c of curto.values()) usos.set(c, (usos.get(c) || 0) + 1);
  for (const nome of alunos) {
    if (usos.get(curto.get(nome)) > 1) {
      const p = partes(nome);
      curto.set(nome, [p[0], ...p.slice(1, -1).map((x) => x[0] + "."), p[p.length - 1]].join(" "));
    }
  }
  return curto;
}

const rotulo = (nome) => escapar(estado.curtos.get(nome) ?? nome);

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------------------------------------------------------------
   5. Layout de forças + desenho no canvas
   --------------------------------------------------------------------- */
// Posição inicial: colunas = nível da BFS a partir de uma ponta da rede.
// Começar "desembaraçado" evita que o layout de forças fique com cruzamentos.
function posicionarPorNiveis() {
  estado.nos = new Map();
  const ponta = (origem) => [...bfs(origem).dist].reduce((m, x) => (x[1] > m[1] ? x : m))[0];
  const colunas = [];
  const vistos = new Set();
  for (const nome of estado.nomes) {
    if (vistos.has(nome)) continue; // cada componente desconexo vira um bloco
    const { dist } = bfs(ponta(nome));
    const base = colunas.length;
    for (const [aluno, d] of dist) {
      vistos.add(aluno);
      (colunas[base + d] ||= []).push(aluno);
    }
  }
  colunas.forEach((coluna, c) => coluna.forEach((nome, i) => {
    estado.nos.set(nome, {
      nome, x: c * 90, y: (i - (coluna.length - 1) / 2) * 90 + (c % 2) * 20, vx: 0, vy: 0,
      grau: estado.adj.get(nome).length, fixo: false,
    });
  }));
  const meio = ((colunas.length - 1) * 90) / 2;
  for (const no of estado.nos.values()) no.x -= meio;
  estado.alpha = 1;
}

function simular() {
  const a = estado.alpha;
  if (a < 0.003) return;
  const nos = [...estado.nos.values()];

  // repulsão entre todos os pares
  for (let i = 0; i < nos.length; i++) {
    for (let j = i + 1; j < nos.length; j++) {
      const ni = nos[i], nj = nos[j];
      const dx = nj.x - ni.x, dy = nj.y - ni.y;
      const d2 = Math.max(dx * dx + dy * dy, 1);
      const f = (1100 * a) / d2;
      ni.vx -= dx * f; ni.vy -= dy * f;
      nj.vx += dx * f; nj.vy += dy * f;
    }
  }
  // molas nas amizades
  for (const [x, y] of estado.arestas) {
    const ni = estado.nos.get(x), nj = estado.nos.get(y);
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const d = Math.max(Math.hypot(dx, dy), 0.01);
    const k = ((d - 85) / d) * 0.08 * a;
    ni.vx += dx * k; ni.vy += dy * k;
    nj.vx -= dx * k; nj.vy -= dy * k;
  }
  for (const n of nos) {
    // gravidade para o centro: "dobra" redes compridas e aproveita a tela
    n.vx -= n.x * 0.025 * a;
    n.vy -= n.y * 0.025 * a;
    if (n.fixo) { n.vx = n.vy = 0; continue; }
    n.vx *= 0.6; n.vy *= 0.6;
    n.x += n.vx; n.y += n.vy;
  }
  estado.alpha *= estado.arrasto ? 1 : 0.985;
}

function ajustarVista(W, H) {
  if (estado.arrasto || !estado.nos.size) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of estado.nos.values()) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
  }
  // reserva espaço para o status (topo), a legenda (base) e os nomes abaixo dos nós
  const s = Math.min((W - Math.min(130, W * 0.22)) / Math.max(x1 - x0, 1), (H - 200) / Math.max(y1 - y0, 1), 1.6);
  const v = estado.vista;
  const k = v.pronta ? 0.1 : 1; // na 1ª vez enquadra direto, depois suaviza
  const ds = (Math.max(s, 0.25) - v.s) * k;
  const dx = ((x0 + x1) / 2 - v.cx) * k;
  const dy = ((y0 + y1) / 2 + 6 / v.s - v.cy) * k;
  v.s += ds; v.cx += dx; v.cy += dy;
  v.pronta = W > 0;
  return Math.abs(ds) > 0.0005 || Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2;
}

const paraTela = (n, W, H) => [(n.x - estado.vista.cx) * estado.vista.s + W / 2, (n.y - estado.vista.cy) * estado.vista.s + H / 2];
const raio = (n) => (13 + Math.min(n.grau, 8) * 1.4) * Math.min(Math.max(estado.vista.s, 0.7), 1);

function desenhar(t) {
  const W = tela.clientWidth, H = tela.clientHeight;
  ctx.setTransform(estado.dpr, 0, 0, estado.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!estado.nos.size) return;

  const pos = new Map();
  for (const n of estado.nos.values()) pos.set(n.nome, paraTela(n, W, H));

  const noCaminho = new Set();
  for (let i = 0; i + 1 < estado.caminho.length; i++) noCaminho.add(chave(estado.caminho[i], estado.caminho[i + 1]));

  // arestas
  ctx.lineCap = "round";
  for (const [a, b] of estado.arestas) {
    const k = chave(a, b);
    if (noCaminho.has(k)) continue;
    const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    if (estado.arvore.has(k)) {
      const filho = estado.visual.get(a)?.nivel > estado.visual.get(b)?.nivel ? a : b;
      ctx.strokeStyle = corNivel(estado.visual.get(filho)?.nivel ?? 0);
      ctx.globalAlpha = 0.6; ctx.lineWidth = 2.2;
    } else {
      ctx.strokeStyle = "rgba(148,163,184,.22)"; ctx.globalAlpha = 1; ctx.lineWidth = 1.3;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // caminho: aparece aresta por aresta, depois ganha partículas
  const cam = estado.caminho;
  if (cam.length > 1) {
    const dur = 260 / velocidade();
    const prog = (t - estado.caminhoInicio) / dur;
    ctx.save();
    // o trecho já revelado vira um único traçado (bem mais barato que aresta por aresta)
    const trecho = new Path2D();
    trecho.moveTo(...pos.get(cam[0]));
    for (let i = 0; i + 1 < cam.length; i++) {
      const p = Math.min(Math.max(prog - i, 0), 1);
      if (!p) break;
      const [x1, y1] = pos.get(cam[i]), [x2, y2] = pos.get(cam[i + 1]);
      trecho.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
    }
    ctx.lineJoin = "round";
    ctx.strokeStyle = estado.corCaminho;
    ctx.globalAlpha = 0.22; ctx.lineWidth = 14; ctx.stroke(trecho); // "brilho" sem shadowBlur
    ctx.globalAlpha = 1; ctx.lineWidth = 4.5; ctx.stroke(trecho);
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t / 25;
    ctx.stroke(trecho);
    ctx.setLineDash([]);
    if (prog >= cam.length - 1) {
      const trechos = cam.length - 1;
      for (let k = 0; k < 3; k++) {
        const u = ((t / (trechos * 520) + k / 3) % 1) * trechos;
        const i = Math.floor(u), f = u - i;
        const [x1, y1] = pos.get(cam[i]), [x2, y2] = pos.get(cam[i + 1]);
        const px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f;
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ondas de descoberta
  estado.ondas = estado.ondas.filter((o) => t - o.inicio < 900);
  for (const o of estado.ondas) {
    const idade = Math.max(t - o.inicio, 0) / 900;
    const [x, y] = pos.get(o.nome);
    ctx.strokeStyle = o.cor; ctx.globalAlpha = 1 - idade; ctx.lineWidth = 3 * (1 - idade) + 0.5;
    ctx.beginPath(); ctx.arc(x, y, raio(estado.nos.get(o.nome)) + idade * 38, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // nós
  const origem = $("origem").value, destino = $("destino").value;
  const pulso = 0.5 + 0.5 * Math.sin(t / 280);
  for (const n of estado.nos.values()) {
    const [x, y] = pos.get(n.nome);
    const r = raio(n);
    const v = estado.visual.get(n.nome);

    let preenchimento = "#1e293b", borda = "#64748b", largura = 1.5, brilho = 0;
    if (v?.tipo === "visitado") { preenchimento = corNivel(v.nivel); borda = "rgba(255,255,255,.6)"; brilho = 10; }
    if (v?.tipo === "fila") { preenchimento = "#0b1224"; borda = corNivel(v.nivel); largura = 3; brilho = 12; }
    if (v?.tipo === "atual") { preenchimento = "#ffffff"; borda = corNivel(v.nivel); largura = 4; brilho = 24 + pulso * 12; }
    if (n.nome === origem) { preenchimento = COR.amarelo; borda = "#fff"; brilho = 22; }
    if (n.nome === destino) { preenchimento = COR.rosa; borda = "#fff"; brilho = 22; }

    const escala = estado.hover === n.nome ? 1.15 : 1;
    if (brilho) { // halo translúcido no lugar de shadowBlur (que é muito caro)
      ctx.fillStyle = n.nome === origem ? COR.amarelo : n.nome === destino ? COR.rosa : borda;
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(x, y, r * escala + brilho * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(x, y, r * escala, 0, Math.PI * 2);
    ctx.fillStyle = preenchimento; ctx.fill();
    ctx.lineWidth = largura; ctx.strokeStyle = borda; ctx.stroke();

    // inicial ou nível dentro do nó
    const escuro = v?.tipo === "fila" || (!v && n.nome !== origem && n.nome !== destino);
    ctx.fillStyle = escuro ? COR.texto : "#0b1020";
    ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(v && v.tipo !== "atual" ? v.nivel : n.nome[0], x, y + 0.5);

    // nome
    ctx.font = "600 12px Inter, sans-serif"; ctx.textBaseline = "top";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(7,11,24,.9)"; ctx.lineJoin = "round";
    const nomeCurto = estado.curtos.get(n.nome) ?? n.nome;
    ctx.strokeText(nomeCurto, x, y + r + 5);
    ctx.fillStyle = estado.hover === n.nome ? "#fff" : "#cbd5e1";
    ctx.fillText(nomeCurto, x, y + r + 5);
  }
}

// Só redesenha quando algo está mudando; parado, o canvas não gasta CPU
function precisaDesenhar() {
  if (estado.redesenhar > 0 || estado.alpha >= 0.003 || estado.arrasto) return true;
  if (estado.ondas.length || estado.caminho.length > 1) return true;
  for (const v of estado.visual.values()) if (v.tipo === "atual") return true;
  return false;
}

function pedirDesenho() {
  estado.redesenhar = 3;
}

function quadro() {
  requestAnimationFrame(quadro);
  if (!precisaDesenhar()) return;
  if (estado.redesenhar > 0) estado.redesenhar--;
  const t = performance.now();
  simular();
  if (ajustarVista(tela.clientWidth, tela.clientHeight)) pedirDesenho();
  desenhar(t);
}

function redimensionar() {
  estado.dpr = Math.min(window.devicePixelRatio || 1, 2);
  tela.width = Math.round(tela.clientWidth * estado.dpr);
  tela.height = Math.round(tela.clientHeight * estado.dpr);
  pedirDesenho();
}

/* ---------------------------------------------------------------------
   6. Interação com o mouse
   --------------------------------------------------------------------- */
function noSob(evento) {
  const rect = tela.getBoundingClientRect();
  const mx = evento.clientX - rect.left, my = evento.clientY - rect.top;
  let melhor = null, menor = Infinity;
  for (const n of estado.nos.values()) {
    const [x, y] = paraTela(n, rect.width, rect.height);
    const d = Math.hypot(mx - x, my - y);
    if (d < raio(n) + 6 && d < menor) { melhor = n; menor = d; }
  }
  return { no: melhor, mx, my, rect };
}

tela.addEventListener("pointerdown", (e) => {
  const { no, mx, my } = noSob(e);
  if (!no) return;
  tela.setPointerCapture(e.pointerId);
  estado.arrasto = { no, mx, my, moveu: false };
  no.fixo = true;
  tela.classList.add("arrastando");
});

tela.addEventListener("pointermove", (e) => {
  const { no, mx, my, rect } = noSob(e);
  const arr = estado.arrasto;
  if (arr) {
    if (Math.hypot(mx - arr.mx, my - arr.my) > 4) arr.moveu = true;
    if (arr.moveu) {
      arr.no.x = (mx - rect.width / 2) / estado.vista.s + estado.vista.cx;
      arr.no.y = (my - rect.height / 2) / estado.vista.s + estado.vista.cy;
      estado.alpha = Math.max(estado.alpha, 0.25);
    }
    $("tooltip").classList.remove("visivel");
    return;
  }
  if ((no?.nome ?? null) !== estado.hover) pedirDesenho();
  estado.hover = no?.nome ?? null;
  const tip = $("tooltip");
  if (!no) { tip.classList.remove("visivel"); return; }
  const amigos = estado.adj.get(no.nome);
  const d = estado.distOrigem?.get(no.nome);
  tip.innerHTML = `<strong>${escapar(no.nome)}</strong><br>
    <span class="t-suave">${amigos.length} amigo(s):</span> ${amigos.map(rotulo).join(", ")}
    ${d !== undefined ? `<br><span class="t-suave">Distância de ${rotulo($("origem").value)}:</span> <b>${d}</b>` : ""}`;
  tip.style.left = Math.min(mx + 16, rect.width - 250) + "px";
  tip.style.top = Math.min(my + 16, rect.height - 110) + "px";
  tip.classList.add("visivel");
});

tela.addEventListener("pointerup", () => {
  const arr = estado.arrasto;
  if (!arr) return;
  arr.no.fixo = false;
  estado.arrasto = null;
  tela.classList.remove("arrastando");
  if (!arr.moveu) cliqueNoAluno(arr.no.nome);
});

tela.addEventListener("pointerleave", () => {
  if (estado.hover) pedirDesenho();
  estado.hover = null;
  $("tooltip").classList.remove("visivel");
});

function cliqueNoAluno(nome) {
  if (estado.proximoClique === "origem") {
    estado.token++;
    limparVisual();
    $("origem").value = nome;
    estado.proximoClique = "destino";
    onda(nome, COR.amarelo);
    definirStatus(`Partida: <b>${rotulo(nome)}</b> — agora clique no aluno de chegada`, true);
  } else {
    $("destino").value = nome;
    estado.proximoClique = "origem";
    onda(nome, COR.rosa);
    animarBusca();
  }
}

/* ---------------------------------------------------------------------
   7. Ligações da interface
   --------------------------------------------------------------------- */
$("buscar").addEventListener("click", animarBusca);
$("distantes").addEventListener("click", animarDistantes);
$("limpar").addEventListener("click", limparTudo);
$("trocar").addEventListener("click", () => {
  const o = $("origem").value;
  $("origem").value = $("destino").value;
  $("destino").value = o;
  pedirDesenho();
});
$("origem").addEventListener("change", pedirDesenho);
$("destino").addEventListener("change", pedirDesenho);

let esperaQtd = null;
$("quantidade").addEventListener("input", () => {
  $("qtdTxt").textContent = $("quantidade").value;
  clearTimeout(esperaQtd);
  esperaQtd = setTimeout(() => estado.dados && montarRede(parseInt($("quantidade").value, 10)), 120);
});
$("velocidade").addEventListener("input", () => { $("velTxt").textContent = velocidade() + "×"; });
$("inputArquivo").addEventListener("change", (e) => lerArquivo(e.target.files[0]));
$("inputModal").addEventListener("change", (e) => lerArquivo(e.target.files[0]));

window.addEventListener("dragover", (e) => { e.preventDefault(); $("modal").classList.add("arrastando"); });
window.addEventListener("dragleave", () => $("modal").classList.remove("arrastando"));
window.addEventListener("drop", (e) => {
  e.preventDefault();
  $("modal").classList.remove("arrastando");
  lerArquivo(e.dataTransfer.files[0]);
});

new ResizeObserver(redimensionar).observe(tela);
redimensionar();
requestAnimationFrame(quadro);
carregarPadrao();

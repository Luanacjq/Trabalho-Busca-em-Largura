"""
Trabalho 04 - Busca em Largura (BFS)

Encontra o caminho mais curto de conexões entre dois usuários de uma rede
social simplificada, descobre os 2 usuários mais distantes da rede e
desenha o grafo com networkx + matplotlib.

Uso:
    python bfs.py                                   # pergunta origem/destino
    python bfs.py --origem "Luana Quirino" --destino "Everton"
    python bfs.py --rede outra_rede.json --origem "Ana Bezerra" --destino "Victor Viana"
    python bfs.py --quantidade 10 --origem Diego --destino Francisco   # só 10 alunos
    python bfs.py --origem "Luana Quirino" --destino "Everton" --sem-janela   # só salva o PNG

O nome pode ser o completo, o curto (nome + último sobrenome) ou só o começo,
com ou sem acento. Se combinar com mais de um aluno, o programa avisa.
"""

import argparse
import json
import sys
import unicodedata
from collections import Counter, deque
from pathlib import Path

ARQUIVO_PADRAO = Path(__file__).with_name("rede_social.json")
IMAGEM_SAIDA = Path(__file__).with_name("rede_social.png")
MAX_ALUNOS = 30  # tamanho da turma
PARTICULAS = {"da", "de", "do", "das", "dos", "e"}


# ---------------------------------------------------------------------------
# 1. Leitura da rede (arquivo externo -> lista de adjacência)
# ---------------------------------------------------------------------------
def carregar_rede(caminho_arquivo):
    """Lê o JSON e devolve o grafo como lista de adjacência: {aluno: [amigos]}."""
    with open(caminho_arquivo, encoding="utf-8") as arquivo:
        dados = json.load(arquivo)

    grafo = {aluno: [] for aluno in dados["alunos"]}

    for a, b in dados["amizades"]:
        for aluno in (a, b):
            if aluno not in grafo:
                raise ValueError(f"Amizade cita um aluno que não está na lista: {aluno!r}")
        if a == b:
            raise ValueError(f"Amizade inválida (aluno consigo mesmo): {a!r}")
        # Amizade é mútua -> aresta não direcionada (adiciona nos dois sentidos)
        if b not in grafo[a]:
            grafo[a].append(b)
            grafo[b].append(a)

    return grafo


def nomes_curtos(alunos):
    """
    Nome para exibir no gráfico: primeiro nome + último sobrenome
    ('Gabriel Mota da Silva' -> 'Gabriel Silva'). Se dois ficarem iguais,
    entram as iniciais do meio: 'Gabriel M. Silva' e 'Gabriel O. Silva'.
    """
    def partes(nome):
        return [p for p in nome.split() if p.lower() not in PARTICULAS]

    curto = {}
    for nome in alunos:
        p = partes(nome)
        curto[nome] = f"{p[0]} {p[-1]}" if len(p) > 1 else nome
    usos = Counter(curto.values())
    for nome in alunos:
        if usos[curto[nome]] > 1:
            p = partes(nome)
            curto[nome] = " ".join([p[0], *(x[0] + "." for x in p[1:-1]), p[-1]])
    return curto


def limitar_alunos(grafo, quantidade):
    """Mantém só os `quantidade` primeiros alunos do arquivo e as amizades entre eles."""
    escolhidos = list(grafo)[:quantidade]
    ficam = set(escolhidos)
    return {aluno: [amigo for amigo in grafo[aluno] if amigo in ficam] for aluno in escolhidos}


# ---------------------------------------------------------------------------
# 2. Busca em Largura
# ---------------------------------------------------------------------------
def bfs(grafo, origem):
    """
    Busca em Largura a partir de `origem`.

    Devolve:
      distancia[v] -> nº de conexões (arestas) entre origem e v
      pai[v]       -> de quem v foi descoberto (usado para refazer o caminho)
    Vértices inalcançáveis não aparecem nos dicionários.
    """
    distancia = {origem: 0}
    pai = {origem: None}
    fila = deque([origem])  # FIFO: o primeiro a entrar é o primeiro a sair

    while fila:
        atual = fila.popleft()
        for vizinho in grafo[atual]:
            if vizinho not in distancia:  # ainda não visitado
                distancia[vizinho] = distancia[atual] + 1
                pai[vizinho] = atual
                fila.append(vizinho)

    return distancia, pai


def reconstruir_caminho(pai, destino):
    """Segue os 'pais' do destino até a origem e inverte a lista."""
    if destino not in pai:
        return None
    caminho = []
    no = destino
    while no is not None:
        caminho.append(no)
        no = pai[no]
    caminho.reverse()
    return caminho


def caminho_mais_curto(grafo, origem, destino):
    """Devolve (distância, caminho). Ambos None se não houver ligação."""
    distancia, pai = bfs(grafo, origem)
    return distancia.get(destino), reconstruir_caminho(pai, destino)


# ---------------------------------------------------------------------------
# 3. Usuários mais distantes (diâmetro do grafo)
# ---------------------------------------------------------------------------
def usuarios_mais_distantes(grafo):
    """
    Roda uma BFS a partir de CADA usuário e guarda a maior distância
    encontrada. Devolve (maior_distancia, [pares empatados]).
    Custo: O(V * (V + E)).
    """
    maior = -1
    pares = []
    for origem in grafo:
        distancia, _ = bfs(grafo, origem)
        for destino, d in distancia.items():
            if origem >= destino:  # conta cada par só uma vez
                continue
            if d > maior:
                maior, pares = d, [(origem, destino)]
            elif d == maior:
                pares.append((origem, destino))
    return maior, pares


def eh_conexo(grafo):
    if not grafo:
        return True
    distancia, _ = bfs(grafo, next(iter(grafo)))
    return len(distancia) == len(grafo)


# ---------------------------------------------------------------------------
# 4. Visualização (networkx + matplotlib)
# ---------------------------------------------------------------------------
def visualizar(grafo, caminho, caminho_distantes, mostrar_janela=True):
    import matplotlib

    if not mostrar_janela:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import networkx as nx

    G = nx.Graph()
    G.add_nodes_from(grafo)
    for a, vizinhos in grafo.items():
        for b in vizinhos:
            G.add_edge(a, b)

    curtos = nomes_curtos(grafo)
    rotulos = {a: curtos[a].replace(" ", "\n", 1) for a in grafo}  # nome em cima, sobrenome embaixo
    pos = nx.kamada_kawai_layout(G)
    fig, eixos = plt.subplots(1, 2, figsize=(22, 10))
    fig.patch.set_facecolor("#0f172a")

    paineis = [
        (eixos[0], caminho, "#22d3ee", "Caminho mais curto"),
        (eixos[1], caminho_distantes, "#f472b6", "Usuários mais distantes"),
    ]
    for eixo, cam, cor, titulo in paineis:
        eixo.set_facecolor("#0f172a")
        cam = cam or []
        arestas_cam = set(zip(cam, cam[1:])) | set(zip(cam[1:], cam))

        cores_nos = []
        for no in G.nodes:
            if cam and no in (cam[0], cam[-1]):
                cores_nos.append("#facc15")
            elif no in cam:
                cores_nos.append(cor)
            else:
                cores_nos.append("#94a3b8")

        nx.draw_networkx_edges(G, pos, ax=eixo, edge_color="#334155", width=1.2)
        nx.draw_networkx_edges(
            G, pos, ax=eixo, edgelist=[e for e in G.edges if e in arestas_cam],
            edge_color=cor, width=4,
        )
        nx.draw_networkx_nodes(G, pos, ax=eixo, node_color=cores_nos, node_size=1700,
                               edgecolors="#e2e8f0", linewidths=1)
        nx.draw_networkx_labels(G, pos, labels=rotulos, ax=eixo, font_size=7,
                                font_weight="bold", font_color="#0f172a")

        trilha = " → ".join(curtos[a] for a in cam)
        legenda = f"{titulo} ({len(cam) - 1} conexões):\n{trilha}" if cam else titulo
        eixo.set_title(legenda, color="#e2e8f0", fontsize=10, wrap=True)
        eixo.axis("off")

    plt.tight_layout()
    fig.savefig(IMAGEM_SAIDA, dpi=130, facecolor=fig.get_facecolor())
    print(f"\nImagem da rede salva em: {IMAGEM_SAIDA.name}")
    if mostrar_janela:
        plt.show()
    plt.close(fig)


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------
def normalizar(texto):
    """Minúsculas e sem acentos: 'Éverton' e 'everton' viram a mesma coisa."""
    sem_acento = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def buscar_usuarios(grafo, nome):
    """Alunos que combinam com `nome`: nome completo, nome curto ou o começo de um deles."""
    alvo = normalizar(nome)
    curtos = nomes_curtos(grafo)
    exatos = [a for a in grafo if alvo in (normalizar(a), normalizar(curtos[a]))]
    if exatos:
        return exatos
    return [a for a in grafo
            if normalizar(a).startswith(alvo) or normalizar(curtos[a]).startswith(alvo)]


def localizar_usuario(grafo, nome):
    """Devolve o aluno, ou None (com um aviso) se não achar ou se o nome for ambíguo."""
    candidatos = buscar_usuarios(grafo, nome)
    if len(candidatos) == 1:
        return candidatos[0]
    if candidatos:
        curtos = nomes_curtos(grafo)
        print(f"  Mais de um aluno combina com {nome!r}: " + ", ".join(curtos[a] for a in candidatos))
    else:
        print(f"  Nenhum aluno combina com {nome!r}.")
    return None


def pedir_usuario(grafo, mensagem):
    while True:
        nome = localizar_usuario(grafo, input(mensagem))
        if nome:
            return nome
        print("  Tente de novo (pode digitar só nome e sobrenome, ex.: Luana Quirino).")


def main():
    for saida in (sys.stdout, sys.stderr):
        if hasattr(saida, "reconfigure"):
            saida.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Busca em Largura em uma rede social.")
    parser.add_argument("--rede", default=ARQUIVO_PADRAO, help="arquivo JSON da rede")
    parser.add_argument("--origem", help="usuário de partida")
    parser.add_argument("--destino", help="usuário de chegada")
    parser.add_argument("--quantidade", type=int,
                        help=f"quantos alunos usar (os primeiros do arquivo, de 2 a {MAX_ALUNOS})")
    parser.add_argument("--sem-janela", action="store_true",
                        help="não abre a janela do gráfico (só salva o PNG)")
    args = parser.parse_args()

    grafo = carregar_rede(args.rede)
    maximo = min(MAX_ALUNOS, len(grafo))
    quantidade = args.quantidade if args.quantidade is not None else maximo
    if not 2 <= quantidade <= maximo:
        sys.exit(f"--quantidade deve ficar entre 2 e {maximo}.")
    grafo = limitar_alunos(grafo, quantidade)
    total_amizades = sum(len(v) for v in grafo.values()) // 2
    curtos = nomes_curtos(grafo)
    seta = lambda caminho: " -> ".join(curtos[a] for a in caminho)

    print("=" * 62)
    print(" BUSCA EM LARGURA - REDE SOCIAL DA TURMA")
    print("=" * 62)
    print(f"Arquivo: {Path(args.rede).name}")
    print(f"Alunos: {len(grafo)}  |  Amizades: {total_amizades}")
    print("Usuários:", ", ".join(curtos.values()))
    print("-" * 62)

    if args.origem:
        origem = localizar_usuario(grafo, args.origem)
        if not origem:
            sys.exit(f"Usuário de partida inválido: {args.origem}")
    else:
        origem = pedir_usuario(grafo, "Usuário de partida: ")

    if args.destino:
        destino = localizar_usuario(grafo, args.destino)
        if not destino:
            sys.exit(f"Usuário de chegada inválido: {args.destino}")
    else:
        destino = pedir_usuario(grafo, "Usuário de chegada: ")

    # --- distância e caminho mais curto ---
    distancia, caminho = caminho_mais_curto(grafo, origem, destino)
    print(f"\n[1] Distância entre {origem} e {destino}")
    if caminho is None:
        print("    Não existe ligação entre esses usuários.")
    else:
        print(f"    {distancia} conexão(ões)")
        print("\n[2] Caminho mais curto")
        print("    " + seta(caminho))

    # --- usuários mais distantes ---
    maior, pares = usuarios_mais_distantes(grafo)
    print("\n[3] Usuários mais distantes da rede")
    if not eh_conexo(grafo):
        print("    Atenção: a rede não é conexa; considerando apenas pares alcançáveis.")
    caminho_distantes = None
    if not pares:
        print("    Nenhum par de alunos está ligado nesta rede.")
    else:
        a, b = pares[0]
        _, caminho_distantes = caminho_mais_curto(grafo, a, b)
        print(f"    {a} e {b}: {maior} conexões")
        print("    Caminho: " + seta(caminho_distantes))
        if len(pares) > 1:
            outros = ", ".join(f"{curtos[x]}–{curtos[y]}" for x, y in pares[1:])
            print(f"    Outros pares empatados com {maior}: {outros}")

    # --- visualização ---
    print("\n[4] Visualização")
    visualizar(grafo, caminho, caminho_distantes, mostrar_janela=not args.sem_janela)


if __name__ == "__main__":
    main()

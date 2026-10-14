# Trabalho 04 — Busca em Largura

Encontra o caminho mais curto de conexões entre dois alunos da turma usando **Busca em Largura (BFS)**. O programa também descobre os 2 alunos mais distantes da rede e desenha o grafo.

## Arquivos

| Arquivo | O que é |
|---|---|
| `rede_social.json` | A rede (arquivo externo): os 30 alunos da turma e as amizades entre eles |
| `bfs.py` | Programa principal: BFS, caminho mais curto, mais distantes e visualização (networkx + matplotlib) |
| `rede_social.png` | Imagem gerada pelo programa |
| `web/` | Front-end com a BFS animada passo a passo |
| `iniciar_front.py` | Abre o front-end no navegador |

## Como rodar

```bash
pip install networkx matplotlib

python bfs.py                                              # pergunta origem e destino
python bfs.py --origem "Luana Quirino" --destino "Everton" # direto
python bfs.py --rede outra.json --origem "Ana Bezerra" --destino "Victor Viana"
python bfs.py --quantidade 10 --origem Diego --destino Francisco   # só os 10 primeiros alunos (máx. 30)
python bfs.py --origem "Luana Quirino" --destino "Everton" --sem-janela   # só salva o PNG

python iniciar_front.py                                    # front-end em http://localhost:8000/web/
```

O nome pode ser o completo, o curto (nome + último sobrenome) ou só o começo, com ou sem acento. Se combinar com mais de um aluno (ex.: `Luana`), o programa avisa e pede para escolher.

## Saída de exemplo

```
[1] Distância entre Luana Cirilo Justo Quirino e Éverton Alencar de Lima
    5 conexão(ões)

[2] Caminho mais curto
    Luana Quirino -> Livia Rincon -> Rayssa Lima -> Samuel Barbosa -> Vinícius Soares -> Éverton Lima

[3] Usuários mais distantes da rede
    Erick Rocha Paulino e Luana Oliveira de Paiva: 7 conexões
    Caminho: Erick Paulino -> Dillan Farias -> Diego Rocha -> Gabriel Melo -> Gabriel Freitas -> Lara Pessoa -> Luana Quirino -> Luana Paiva
```

## Formato da rede

```json
{
  "alunos": ["Luana Cirilo Justo Quirino", "Lara Castro Alves Pessoa", "Livia Lima Rincon"],
  "amizades": [["Luana Cirilo Justo Quirino", "Lara Castro Alves Pessoa"], ["Lara Castro Alves Pessoa", "Livia Lima Rincon"]]
}
```

As amizades são mútuas (grafo não direcionado). As amizades do arquivo atual são um exemplo: ajuste para as amizades reais da turma.

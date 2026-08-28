# Dashboard Mobilidade Acadêmica Internacional — UEA

Painel estático (HTML/CSS/JS, sem build step) com a identidade visual
PROPESP/UEA, mostrando os estudantes estrangeiros recebidos na
pós-graduação da UEA.

## Fonte dos dados

`Modelo_PowerBI_Mobilidades_UEA_Estrutura_Completa_ERASMUS_Atualizada.xlsm`
(Google Drive, pasta da UEA/PROPESP — internacionalizacao@uea.edu.br),
baixado e processado em 28/08/2026. A planilha já vem estruturada como
modelo de Power BI (fato + dimensões).

- 66 registros consolidados: 55 GCUB-MOB + 11 ERASMUS+.
- Modalidades "Move La América" e "PROAFRI" já estão no modelo, mas ainda
  sem dados (`Aguardando dados`).

## Privacidade — duas páginas, dois níveis de acesso

Este projeto tem **duas páginas separadas**, deliberadamente não
interligadas por navegação, para que a página pública nunca vaze para a
restrita:

- **`index.html` (pública/institucional)** — usa apenas colunas não
  identificáveis de `Fato_Mobilidades` e `Dim_Programas_Mobilidade`
  (`js/data.js`). Pode ser publicada (GitHub Pages, link institucional,
  telão), conforme a orientação nº 6 da aba `Instruções` da planilha
  original ("não deve ser carregada em painel público").

- **`interno.html` (uso interno — NÃO publicar)** — junta
  `Fato_Mobilidades` com `Dim_Participantes_RESTRITA` (nome, e-mail,
  telefone, matrícula), `Fato_Acompanhamento` (status administrativo:
  Polícia Federal, banco, casa do estudante etc.) e
  `Pendencias_Conferencia` (`js/data-interno.js`). Existe uma faixa de
  aviso vermelha fixa no topo da página e a tag `<meta name="robots"
  content="noindex, nofollow">`, mas isso não substitui cuidado humano:
  **não** hospedar em GitHub Pages, Netlify, Vercel ou qualquer link
  compartilhável; **não** commitar `js/data-interno.js` nem
  `interno.html` num repositório que tenha remoto público (este projeto
  não tem `.git` — se inicializar um, adicione os dois ao
  `.gitignore` antes do primeiro commit); acesso só localmente
  (`localhost`) por quem já tem autorização para ver esses dados na
  planilha de origem.

`Base_Original_RESTRITA` (cópia bruta da fonte, com CPF/passaporte/RNM/
dados bancários) não foi carregada em nenhuma das duas páginas — a
própria planilha orienta usá-la só para auditoria interna, fora do
Power BI/dashboard.

## Estrutura

```
index.html          página pública — dados agregados, sem identificação pessoal
interno.html         página de uso interno — nome, contato e acompanhamento por participante (não publicar)
css/style.css        tokens + componentes (design system PROPESP/UEA) + estilos específicos
js/data.js           dados agregáveis (linhas da Fato_Mobilidades, sem PII) + dimensão de modalidades
js/main.js           tema claro/escuro, filtros, mapa, gráficos, rankings (index.html)
js/data-interno.js    join de Fato_Mobilidades + Dim_Participantes_RESTRITA + Fato_Acompanhamento + Pendencias_Conferencia (uso interno)
js/interno.js         busca, tabela e painel de detalhe (interno.html)
lib/                 d3.v7, topojson-client e o atlas mundial (countries-110m.json)
image/               logo PROPESP UEA
```

## Rodar localmente

```
cd "DASHBOARD MOBILIDADE"
python3 -m http.server 8080
# página pública:      http://localhost:8080/index.html
# uso interno (restrito): http://localhost:8080/interno.html
```

## Funcionalidades

- Segmentador de modalidade (Todas / GCUB-MOB / ERASMUS+) no topo.
- Filtro por edição (clique num card para isolar, clique de novo para
  limpar).
- Mapa coroplético dos países de origem (indicadores oficiais).
- Evolução por edição (mestrado × doutorado × graduação), independente do
  filtro de edição, para manter a linha do tempo completa como contexto.
- Rankings de países e PPGs, qualidade dos dados e fonte de financiamento.
- Tema claro/escuro persistido (localStorage), sem flash no carregamento.

## Atualizar os dados

Quando a planilha de origem for atualizada (novas modalidades, novos
registros), regenerar `js/data.js` a partir de `Fato_Mobilidades` e
`Dim_Programas_Mobilidade`, mantendo as mesmas colunas (sem reintroduzir
nome, contato, documentos ou dados bancários).

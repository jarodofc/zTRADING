<p align="center"><img src="logo.svg" alt="zTRADING" width="80" /></p>

# zTRADING | Market Intelligence Terminal

Terminal web multimercado com identidade minimalista inspirada no Liquid Glass do iOS e Material 3, logotipo SVG próprio e tipografia Plus Jakarta Sans e JetBrains Mono.

## Identidade visual

| Elemento | Especificação |
|---|---|
| Obsidiana | `#0B0D10` |
| Prata | `#F0F3F7` |
| Marca / entrada | `#70A7FF` (azul elétrico) |
| Criptomoedas | `#E8BC6A` (dourado) |
| Ações | `#67D7C5` (verde-água) |
| Tipografia | Plus Jakarta Sans / JetBrains Mono |

Os destaques de navegação identificam o mercado, enquanto as cores semânticas de alta e baixa permanecem independentes. Os estilos compartilhados incluem foco visível, responsividade e preferências de movimento e transparência reduzidos.

## Mercados

| Módulo | Fonte | Recursos |
|---|---|---|
| Criptomoedas | Binance Spot REST e WebSocket | Candles, indicadores, livro de ofertas, negócios e watchlist |
| Ações B3 | brapi REST + PNT histórico REST opcional | Cotação BRL, histórico OHLCV, indicadores, filtros e busca de ticker |

A entrada permite escolher o mercado e retornar a qualquer momento. Ações não simulam preços, negócios ou livro de ofertas; a data do provedor é exibida. O módulo cripto legado pode ativar o fallback explicitamente identificado como feed simulado; não use dados simulados para decisões reais. Indicadores são descritivos, sem execução de ordens.

## Arquitetura

```text
index.html       # menu inicial
crypto.html      # terminal cripto existente
app.js           # Binance e interface cripto
stocks.html      # terminal B3
stocks.js        # API B3, normalização e gráfico
indicators.js    # EMA, SMA, RSI e MACD compartilhados
styles.css       # tokens e componentes do design system
markets.css      # temas de mercado e layout responsivo
logo.svg         # identidade vetorial
api/stocks.js    # proxy Node.js (Vercel), token no servidor
```

## Executar

Sirva a raiz via servidor HTTP estático (por exemplo, `python -m http.server 8080`) e abra http://localhost:8080. O navegador precisa acessar as fontes, Lightweight Charts e APIs externas. Em hospedagem estática, as quatro ações de demonstração (PETR4, VALE3, ITUB4, MGLU3) usam o endpoint público da brapi, sujeito a CORS e limites.

Para ampliar o universo de ações, importe o repositório na Vercel como projeto sem framework e configure a variável de ambiente `BRAPI_TOKEN` no servidor; o proxy em `/api/stocks` utiliza o token sem enviá-lo ao navegador. A API pode limitar intervalos, frequência, licenciamento e histórico por plano. O proxy retorna respostas privadas sem cache compartilhado; antes de implantar em produção, configure controle de acesso, proteção contra abuso e limites de consumo.

## Agregação de fontes B3

A API `/api/stocks` mantém cotação e histórico como recursos independentes. A cotação vem da brapi; o histórico pode vir da brapi ou PNT. O modo automático compara disponibilidade, cobertura e data final; o modo PNT prioriza seu histórico e sinaliza fallback. Séries de candles de fontes diferentes não são concatenadas, evitando misturar ajustes societários. Cada resposta identifica a origem dos dados. Não se trata de streaming ao vivo.

Configure `PNT_CLIENT_ID` e `PNT_CLIENT_SECRET` no servidor para a API histórica PNT com escopo `pntdata.hist`; use credenciais e plano fornecidos pelo provedor. A PNT histórica suporta intervalos diários e de 15 minutos usados pelo terminal, não o semanal. Sem credenciais, a brapi continua operando. O agregador não compartilha cache de dados licenciados. Antes de publicar com credenciais comerciais, restrinja acesso ao servidor, aplique limites de consumo e confirme os direitos de exibição/redistribuição com os fornecedores.

Para negócios e livro de ofertas em tempo real, PNT oferece SignalR e Cedro oferece WebSocket. A ativação desses streams exige contratação, credenciais e backend de conexão persistente; esses streams ainda não estão implementados. Não envie chaves de acesso ao navegador.

- [PNT: documentação histórica e streaming](https://md.pnt.api.br/doc.html)
- [Cedro: WebSocket](https://cedrotech.com/market-apis/api-websocket/)

## Validação

- Abrir a página inicial e entrar nos dois mercados; retornar pelo botão Mercados.
- Verificar os quatro tickers de demonstração e a troca de intervalo.
- Confirmar timestamps, moeda BRL e ausência de valores fictícios no módulo B3.
- Testar falha de rede, histórico insuficiente, limite de consultas e ticker não autorizado.
- Verificar responsividade, teclado e foco visível.
- Validar a integração em produção com a chave do provedor e o plano escolhido.

## Referências

- [Binance Spot API](https://developers.binance.com/docs/binance-spot-api-docs)
- [brapi.dev](https://brapi.dev/docs)
- [Lightweight Charts](https://tradingview.github.io/lightweight-charts/)

Ferramenta educacional e de análise. Não é recomendação de investimento.

## Autoria

Desenvolvido por [@jarodofc](https://github.com/jarodofc). O perfil está disponível na cápsula Dynamic Island ao final das páginas do terminal.

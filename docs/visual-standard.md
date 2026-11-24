# Padrão visual reutilizável | zTRADING

## Componentes

- **Marca:** logo vetorial central, título e subtítulo institucional.
- **Conteúdo:** textos de apresentação, cards de seleção e KPIs resumidos centralizados; tabelas, escalas, livro de ofertas e séries continuam alinhados segundo a leitura financeira.
- **Assinatura:** rodapé centralizado, ícone GitHub, @jarodofc e dois links independentes para perfil e código. Não apresenta status de conexão nem cotação.
- **Movimento:** fundo fixo decorativo com linhas, grade e candles vetoriais. Animação CSS lenta, sem consultas de dados e com respeito à preferência de movimento reduzido.

## Reutilização

1. Carregue os tokens base (`styles.css`), os temas (`markets.css`) e `identity.css`, nesta ordem.
2. Mantenha `market-motion.svg` ao lado de `identity.css`.
3. Reutilize o contêiner `.ambient-backdrop` com `aria-hidden="true"` e sem elementos interativos.
4. Reutilize o rodapé `.project-credit` e a cápsula `.github-island` do `index.html`, trocando o link do repositório para cada projeto.
5. Ajuste as variáveis de acento e o nome/subtítulo; preserve a assinatura do desenvolvedor.

## Acessibilidade

Foco de teclado visível, links com nomes distintos, áreas de toque de pelo menos 44 px na assinatura, adaptação móvel e animação desativada quando o sistema pede movimento reduzido. Evite animações atrás de tabelas de baixo contraste. Nunca use motivos decorativos como se fossem dados financeiros.

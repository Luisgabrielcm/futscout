<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — FutScout

## 1. Projeto

FutScout é uma aplicação web de scout e análise de jogadores de futebol inspirada em experiências como SoFIFA, mas com foco em uma interface mais moderna, prática e orientada ao Career Mode.

Stack principal:

- Next.js 16
- React 19
- TypeScript
- PostgreSQL
- Prisma 7
- App Router

O projeto deve priorizar:

- dados reais;
- automação;
- escalabilidade;
- integridade de dados;
- clareza arquitetural;
- baixo trabalho manual;
- evolução incremental com testes.

---

## 2. Regra obrigatória do Next.js

Esta versão do Next.js possui mudanças importantes em relação a versões anteriores.

Antes de alterar código relacionado a APIs, convenções, configuração ou comportamento do Next.js:

- consultar a documentação disponível em `node_modules/next/dist/docs/`;
- não assumir APIs antigas;
- respeitar avisos de depreciação;
- evitar padrões incompatíveis com Next.js 16.

---

## 3. Fontes de dados e responsabilidades

### EA SPORTS FC

A EA é a fonte principal para dados do jogo.

Usar para:

- jogadores;
- clubes;
- ligas;
- overall oficial;
- atributos;
- subatributos;
- posições;
- posições alternativas;
- PlayStyles;
- Skill Moves;
- Weak Foot;
- demais dados disponíveis no payload oficial.

O `externalId` de Player, Club e outras entidades EA representa a identidade da EA.

Nunca substituir ou confundir `externalId` com IDs de outras fontes.

### API-Football

API-Football é usada para dados do futebol real.

Usar para:

- identificação complementar de jogadores;
- identificação complementar de clubes;
- estatísticas reais;
- temporadas;
- competições;
- transferências;
- títulos;
- elencos;
- informações adicionais quando confiáveis.

IDs da API-Football devem ser armazenados em campos próprios, como:

- `Player.apiFootballId`
- `Club.apiFootballId`

Nunca reutilizar `externalId` para isso.

### TransferRoom

TransferRoom é a referência planejada para valor de mercado real do jogador.

Valores de mercado não devem ser confundidos com valores de transferências.

Transferências reais da API-Football devem preservar:

- data;
- clube de origem;
- clube de destino;
- valor ou tipo bruto retornado pela API.

Exemplos:

- `€180M`
- `Free`
- `Loan`

O valor de mercado atual é um conceito separado.

---

## 4. Identidade e integridade dos jogadores

`Player.externalId` da EA é autoritativo.

Nunca associar um jogador com `externalId` não nulo a outro registro apenas porque o slug ou nome coincide.

Jogadores diferentes podem possuir nomes iguais.

Slugs podem receber sufixos quando necessário para evitar colisões.

Antes de salvar um `apiFootballId`:

- verificar se ele já pertence a outro jogador;
- nunca sobrescrever silenciosamente;
- tratar como conflito.

Matches automáticos devem ser conservadores.

É preferível deixar um jogador sem associação do que salvar uma associação incorreta.

---

## 5. Matcher API-Football de jogadores

O matcher atual utiliza:

- nome;
- data de nascimento;
- nacionalidade;
- clube.

Score atual:

- nome: até 40;
- nascimento: 35;
- nacionalidade: 10;
- clube: 15.

Classificação:

- `MATCH FORTE`: >= 90
- `REVISAR`: >= 75
- `MATCH FRACO`: < 75

Auto-save exige:

- `MATCH FORTE`;
- nascimento correto;
- clube correto;
- `nameScore >= 80`.

Nunca enfraquecer esses critérios sem justificativa e autorização.

Antes de melhorar o matcher, preservar compatibilidade com IDs já validados.

---

## 6. Matcher API-Football de clubes

O matcher de clubes deve ser conservador.

Antes de persistir `Club.apiFootballId`:

- verificar duplicidade;
- rejeitar equipes femininas quando o clube FutScout é masculino;
- rejeitar reservas e categorias de base;
- evitar falsos positivos por nomes curtos;
- considerar futuramente país e liga como sinais adicionais.

Nunca inventar IDs.

---

## 7. Controle de tentativas do matcher

Existe:

`ApiFootballPlayerMatchAttempt`

Objetivo:

- impedir que jogadores não resolvidos consumam API repetidamente;
- registrar histórico operacional do matcher.

Status esperados:

- `matched`
- `not_resolved`
- `review`
- `weak`
- `conflict`
- `error`

O rate limit HTTP 429 não deve gerar tentativa concluída para um jogador se o processo não terminou.

Retries devem respeitar `nextRetryAt`.

---

## 8. Cache de elencos API-Football

Existe:

`ApiFootballTeamRosterCache`

A ordem obrigatória de resolução deve ser:

1. cache em memória;
2. cache PostgreSQL;
3. API-Football.

O cache persistente é indexado por:

- `apiTeamId`;
- `season`.

TTL atual:

- 7 dias.

Evitar chamadas externas quando houver cache válido.

Nunca apagar cache persistente como efeito colateral de uma função destinada a limpar apenas cache em memória.

---

## 9. Rate limits

API-Football possui limites de uso.

O sistema deve:

- detectar HTTP 429;
- interromper lotes com segurança;
- preservar progresso;
- evitar retry agressivo;
- reutilizar cache;
- minimizar chamadas repetidas.

Rate limit deve ser tratado de forma centralizada futuramente.

Não criar loops que continuem chamando a API após 429.

---

## 10. Prisma e banco de dados

Usar Prisma 7 com PostgreSQL.

Cliente Prisma:

`app/generated/prisma`

Conexão:

`@prisma/adapter-pg`

Variável principal:

`DIRECT_URL`

Antes de migrations:

- validar schema;
- verificar impacto;
- evitar alterações destrutivas;
- nunca resetar banco sem autorização explícita.

Comandos como:

- `prisma migrate reset`;
- remoção massiva;
- truncate;
- deleteMany amplo;

não devem ser executados sem aprovação explícita.

---

## 11. Sincronização EA

A sincronização EA é um pipeline de produção já consolidado.

Fluxo:

EA Ratings
→ provider
→ mapper
→ normalizer
→ sync
→ PostgreSQL

A sincronização completa já foi projetada para:

- paginação;
- checkpoint;
- retry;
- erros;
- persistência incremental.

Não reescrever esse pipeline sem necessidade.

Não resetar a sincronização EA apenas para testar outras features.

---

## 12. Estado de dados EA

O FutScout já foi preparado para importar a base completa de jogadores da EA.

Evitar:

- seeds manuais como fonte principal;
- reintrodução de jogadores hardcoded;
- dependência manual de manutenção de atletas.

A arquitetura deve continuar orientada à sincronização automática.

---

## 13. Dados ausentes

Regra fundamental:

NUNCA inventar dados.

Se a fonte não fornecer:

- salário;
- contrato;
- número da camisa;
- logo de liga;
- valor;
- transferência;
- estatística;
- histórico;

o sistema deve representar ausência de dado.

Não criar valores fictícios apenas para preencher a UI.

---

## 14. Overall, potencial e mercado

### Overall oficial

Vem da EA.

### Dynamic Overall

Será um sistema proprietário do FutScout.

Não substituir pelo rating da API-Football.

### Potential

Pode evoluir para um sistema próprio do FutScout.

Não derivar arbitrariamente sem regra definida.

### Market Value

É separado de:

- overall;
- dynamicOverall;
- valor de transferência.

---

## 15. Frontend

A identidade visual do FutScout usa:

- fundo escuro/preto;
- verde;
- bege;
- layout limpo;
- alta legibilidade;
- foco em Career Mode.

A interface deve evitar:

- duplicações;
- excesso de blocos redundantes;
- informações inventadas;
- poluição visual.

As páginas devem continuar responsivas.

---

## 16. Perfil do jogador — roadmap

Preservar no roadmap:

- bandeira de nacionalidade;
- escudo do clube;
- logo da liga quando houver fonte confiável;
- Skill Moves;
- Weak Foot;
- múltiplas posições secundárias;
- funções táticas;
- histórico de carreira;
- histórico de seleção;
- contrato, salário e número da camisa apenas quando houver fonte confiável;
- jogadores similares;
- estatísticas reais;
- transferências reais;
- títulos e campanhas;
- dynamicOverall;
- sistema FutScout de potencial;
- valor de mercado.

---

## 17. Componentes e código legado

Antes de apagar componentes ou scripts aparentemente não utilizados:

- verificar referências;
- verificar se fazem parte de testes ou roadmap;
- não remover apenas por parecer legado.

Código duplicado pode ser consolidado, mas somente após validação.

---

## 18. Testes e validação

Antes de considerar uma alteração concluída:

Executar pelo menos:

`npx tsc --noEmit`

Quando aplicável:

`npm run lint`

Para alterações Prisma:

`npx prisma validate`

Após migration:

`npx prisma generate`

Não executar chamadas externas apenas para validar TypeScript.

Criar testes locais/mockados sempre que possível.

---

## 19. Scripts

Scripts podem ter comportamentos diferentes:

- somente leitura;
- teste;
- gravação;
- sincronização;
- auditoria;
- reset.

Antes de executar um script:

- ler o arquivo;
- identificar se ele modifica banco;
- identificar se chama API externa;
- informar o impacto.

Scripts destrutivos nunca devem ser executados automaticamente.

---

## 20. Git

Antes de mudanças relevantes:

- verificar estado do Git;
- revisar arquivos modificados;
- preservar alterações do usuário.

Nunca:

- descartar mudanças;
- executar hard reset;
- sobrescrever trabalho local;

sem autorização.

Preferir mudanças pequenas e revisáveis.

---

## 21. Forma de trabalho dos agentes

Agentes devem trabalhar com responsabilidades separadas.

### Arquiteto

Responsável por:

- arquitetura;
- planejamento;
- dependências entre áreas;
- decisões estruturais;
- revisão de grandes mudanças.

Não deve implementar grandes alterações sem plano.

### Dados e APIs

Responsável por:

- EA;
- API-Football;
- futuras fontes externas;
- normalização;
- matchers;
- rate limit;
- caches;
- pipelines de sincronização.

Não deve redesenhar frontend sem necessidade.

### Backend e Banco

Responsável por:

- Prisma;
- PostgreSQL;
- models;
- migrations;
- índices;
- integridade;
- transações;
- serviços de persistência.

Não deve executar migrations destrutivas sem aprovação.

### Frontend e UI

Responsável por:

- páginas;
- componentes;
- responsividade;
- UX;
- identidade visual;
- filtros;
- visualização de dados.

Não deve alterar schema Prisma apenas para facilitar UI sem aprovação arquitetural.

### QA e Auditoria

Responsável por:

- TypeScript;
- lint;
- testes;
- builds;
- auditorias;
- duplicidades;
- regressões;
- integridade.

Não deve alterar comportamento funcional apenas para fazer um teste passar sem entender a causa.

---

## 22. Regra de ownership

Um agente não deve modificar indiscriminadamente outras áreas.

Se uma tarefa exigir mudança em outra camada:

1. identificar a dependência;
2. explicar a mudança;
3. alterar apenas o mínimo necessário;
4. validar impacto.

Mudanças cross-layer relevantes devem passar por revisão arquitetural.

---

## 23. Mudanças incrementais

Preferir:

- pequenas alterações;
- um objetivo por vez;
- validação depois de cada etapa;
- diffs claros.

Evitar:

- refactors gigantes não solicitados;
- renomeações em massa;
- alterações cosméticas misturadas com mudanças críticas;
- reescrita de código funcional sem benefício comprovado.

---

## 24. Segurança operacional

Nunca executar automaticamente:

- reset de banco;
- exclusão em massa;
- migration destrutiva;
- sincronização completa;
- chamada massiva de API;
- mudanças em produção;
- comandos irreversíveis.

Solicitar autorização antes.

---

## 25. Estado atual do desenvolvimento

O desenvolvimento está atualmente na fase de estabilização da integração API-Football.

Implementações recentes:

- `Club.apiFootballId`;
- `Player.apiFootballId`;
- matcher de clubes;
- matcher de jogadores;
- `ApiFootballPlayerMatchAttempt`;
- política de retry;
- `ApiFootballTeamRosterCache`;
- cache memória → PostgreSQL → API;
- sincronização de estatísticas reais;
- transferências;
- títulos.

Ponto atual:

o cache persistente de elencos foi implementado e conectado ao matcher.

Próxima etapa:

1. validar migrations recentes no PostgreSQL;
2. testar cache persistente;
3. uniformizar rate limit;
4. estabilizar matcher;
5. criar auditorias;
6. só depois aumentar escala da sincronização.

---

## 26. Princípio final

A prioridade do FutScout é:

CORREÇÃO DOS DADOS
>
AUTOMAÇÃO
>
ESCALABILIDADE
>
VELOCIDADE DE IMPLEMENTAÇÃO

É melhor uma feature levar mais tempo e preservar integridade do que produzir rapidamente dados incorretos.

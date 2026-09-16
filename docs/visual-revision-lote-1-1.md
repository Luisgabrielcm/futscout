# Homologação corretiva — Lote visual 1.1

Escopo autorizado: até a seção 70, item 27. O mockup citado não foi anexado;
esta implementação segue a arquitetura textual, sem alegar equivalência visual
com uma imagem não inspecionada. Homologação final de produto continua necessária.

## 1. Precheck

`beta-next`, HEAD `f0e7749`, árvore limpa e alinhada com `origin/beta-next`.
Sem alteração de schema/migration, serviços de persistência, providers ou sync.

## 2. Sombras

Não havia declaração ativa de text-shadow/drop-shadow/text-stroke no CSS autoral.
Foi ampliado o contrato de tipografia plana a textos e pseudo-elementos, com
text-shadow none, stroke zero e filter none em elementos textuais. Não há texto
duplicado gerado por pseudo-elementos. Os box-shadows restantes pertencem ao
elemento decorativo do hero, contêineres/fotos/cards, marcador do campo e indicador
de aba ativa; não são sombras das letras. Pesos de nome/cards foram suavizados.

## 3. Links

Clube, liga, nacionalidade, resumo e PlayStyles deixam de parecer badges/caixas.
Hover textual discreto, underline somente no hover e focus-visible preservado.
Posições continuam badges semânticos, pois são metadados, não links textuais comuns.

## 4. Buttons

Primary agora usa fundo escuro discreto, borda e texto bege; não bloco verde sólido.
Buscar/Aplicar/Limpar compartilham dimensões, foco e disabled. Favoritar/Comparar
mantêm alvos de 44px, estado pressionado e não mudam a lógica de armazenamento.

## 5. Player Page architecture

Header → navegação por anchors → Visão geral → EA SPORTS FC → Vida Real → Atributos
→ PlayStyles → Estatísticas → Histórico. Links resolvem IDs únicos, sem novas rotas
ou carregamentos por tab; conteúdo SSR permanece acessível sem JavaScript.

## 6. EA SPORTS FC

Clube/liga do catálogo e posições identificados como EA. Atributos/PlayStyles têm
o mesmo domínio explícito. OVR/potencial continuam no header; Skill Moves/Weak Foot
permanecem no resumo. Análise FutScout é rotulada como análise baseada em EA,
não como estatística real nem rating API-Football.

## 7. Vida Real

Carreira/contrato em domínio separado. Campos preparados para clube confirmado,
liga real, seleção, salário, contrato, camisa e última transferência. Sem reader
V2 improvisado: ausência permanece `—`; catálogo EA nunca vira clube real aprovado.

## 8. Transfer placement

A timeline/estado ausente saiu da caixa antes de Posições. `PlayerHistory` agora
fica no final, explicitamente dentro do domínio Vida Real. `PlayerCareer` liga ao
Histórico. Não houve leitura nova de TransferObservations nem promoção de proposals.

## 9. Club badge status

`AVAILABLE_AND_IMPLEMENTED` para o contrato de URL válida fornecida. `Club.imageUrl`
existe e o mapper público já o preserva. URLs ausentes ou de contexto incompatível
não são substituídas por endpoints derivados. Nenhuma cobertura nova de arte foi
criada. `ClubBadge` centraliza dimensões, lazy loading e fallback FutScout.

## 10. League logo status

`SOURCE_NOT_AVAILABLE` no catálogo público atual: League não tem campo de logo.
`LeagueLogo` consome URL opcional validada; header está preparado via DTO opcional,
sem nova query. Sem URL, somente nome. Não derivar arte a partir de ID de competição.

## 11. Asset source

Auditados public, schema, mapper EA/database, tipos, helpers, componentes e config.
Não há coleção local de escudos/ligas/PlayStyles. Native img consome URLs fornecidas;
não há proxy Next Image ou remotePatterns a reparar. Sem CSP novo. Erro de carga,
inclusive antes da hidratação, cai no fallback existente; nenhuma API/URL externa
foi usada para completar cobertura. Uma URL sintaticamente válida não comprova
licença ou identidade: novos mappings exigem revisão da origem/direitos.

## 12. Player Card club badge

Escudo de 24px junto ao clube. Arte válida tem precedência; ausente/incompatível
usa F neutro, explicitamente FutScout, com descrição acessível de indisponibilidade.
O mesmo componente atende header e diretório/Club Page.

## 13. Secondary positions

Preservadas posições EA principal + 0..N secundárias, deduplicação e tradução PT/EN.
Card mais compacto por foto, espaçamento e metadados; nenhum dado foi removido.

## 14. Nationality/selection

Nacionalidade continua explícita; bandeiras reutilizadas. Seleção representada é
campo distinto e não inferido. `REQUIRES_SEPARATE_DATA_PIPELINE` para seleção real.

## 15. Salary

`SALARY_DATA_AVAILABLE = false`, `SOURCE_NOT_AVAILABLE` no schema/DTO produtivo.
Contrato visual aceita salário comprovado, moeda e período semana/ano; fixture
testa valores/zero. Card não cresce com salário ausente. Não inferir de marketValue.

## 16. Contract

`SOURCE_NOT_AVAILABLE` no contrato público; datas/status preparados, não preenchidos.

## 17. Shirt number

`SOURCE_NOT_AVAILABLE` no contrato público; não inferir de lineup ou roster bruto.

## 18. Market value

Valor de mercado, salário e typeRaw de transferência permanecem conceitos separados.
Valores/nulls existentes e comportamento de PlayerCard foram preservados.

## 19. PlayStyle icon status

`PLAYSTYLE_ICON_ASSETS_BLOCKED = true`.
`REQUIRES_SEPARATE_DATA_PIPELINE`: EARatingsPlayerAbility admite imageUrl, mas
mapEARatingsPlayer produz somente code/name/level; PlayStyle persistido e DTO público
não têm URL. Nenhum ícone local encontrado. Mapping de arte canônica preparado,
vazio em produção, sem URLs sintetizadas ou emojis. Círculos vazios removidos;
nome real + aviso textual de arte indisponível são o fallback honesto.

## 20. PlayStyle+

Normal e Plus têm slots distintos no mapping; nunca reaproveitar automaticamente
arte normal como Plus. Bege/dourado e rótulo PlayStyle+ mantidos, cards compactos.

## 21. Fallback behavior

Foto existente preservada. Escudo indisponível: FutScout neutro. Liga: nome.
PlayStyle: nome/nível e mensagem textual, sem círculo. Vida Real: `—` e histórico
indisponível no lugar correto. Sem dados ilustrativos convertidos em fatos.

## 22. Mbappé smoke

Produção local (`next start`): PT/EN em 390, 768 e 1280px, sem overflow horizontal.
Foto carregada; ATA/PE (ST/LW), França/France e OVR 91 preservados. Potencial/valor
ausentes permanecem `—`. Anchors existentes, Vida Real separada e PlayStyles sem
círculos vazios; PlayStyle+ continua distinto. Escudo indisponível usa F neutro.

## 23. Salah smoke

PT/EN nos três tamanhos, sem overflow. Foto carregada, PD/RW, Egito/Egypt, Liverpool
e OVR 91 presentes; potencial/valor ausentes. Salário/seleção/clube real confirmado
não inferidos. Header e navegação mobile legíveis, sem erros de console observados.

## 24. Haaland smoke

PT/EN nos três tamanhos, sem overflow. Foto carregada, ATA/ST, Noruega/Norway,
Manchester City e OVR 90 preservados. Escudo sem arte permanece fallback; liga
somente textual. Contrato/salário ausentes não recebem valores ilustrativos.

## 25. Bellingham smoke

PT/EN nos três tamanhos, sem overflow. Foto carregada, MEI/MC (CAM/CM),
Inglaterra/England; OVR 90, potencial 94 e €145M preservados. Vida Real não herda
Real Madrid como clube confirmado. Capturas inspecionadas em mobile/tablet/desktop;
sem warnings/errors de console capturados, inclusive hydration.

## 26. Filtros

Contratos de URL/busca não alterados; estilos discretos aplicados às ações existentes.
Filtro Striker em EN gerou `position=ATA`; troca para PT preservou filtro/página.
Limpar removeu os parâmetros; após conclusão da navegação, buscar Mbappé retornou
Kylian e Ethan. Busca/aplicar/limpar observados em desktop e 390px, cards também
em tablet, sem overflow. Botões de ação medidos em aproximadamente 45px de altura;
foco de teclado visível. Nenhuma mudança na lógica de favoritos/comparação.

## 27. Paginação e gates

Componente de paginação, Top 10, busca e buckets de nacionalidade preservados.
Regressões mockadas de filtros/querystring permanecem na suíte.
TypeScript, lint, Prisma Validate e diff check passaram. Suíte final: **1.302 PASS,
0 FAIL, 8 skips preexistentes (1.310 total)**. Nove testes novos. A primeira execução
identificou teste legado proibindo qualquer underline, inclusive hover solicitado;
o contrato foi ajustado para permitir underline somente no hover e a suíte repetida.
Build de produção **PASS** após liberação de memória pelo usuário (951 MiB de RAM
livre e cerca de 16 GiB de memória virtual na retomada). Build/validate usam URLs
fictícias de processo, sem editar `.env`. Smoke local **PASS**: os quatro perfis,
cards e filtros PT/EN; paginação EN passou de 1 para 2 preservando `position=ATA`,
e troca para PT manteve página 2/126. Página de Real Madrid também conferida:
ClubBadge compartilhado com fallback neutro de 72px, sem overflow.

O smoke utilizou somente as leituras normais das páginas públicas e suas imagens;
nenhuma escrita no banco, API operacional, matcher, sync ou migration executada.
Servidor e aba temporários encerrados. Nenhum screenshot/artefato de smoke versionado.
O servidor emitiu aviso do driver pg sobre futura mudança de semântica dos modos
SSL; não é falha do smoke nem foi alterada configuração de conexão nesta revisão.
Pronto tecnicamente para commit/push somente em beta-next; homologação de produto
contra o mockup não recebido e cobertura de artes/dados continuam limitações explícitas.

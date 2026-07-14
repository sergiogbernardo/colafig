# Plano de implementação — segurança, privacidade e organização da coleção

Atualizado em 14 de julho de 2026. Este documento converte a auditoria em entregas verificáveis. A validação jurídica indicada abaixo deve ser feita por profissional qualificado; o plano não substitui parecer jurídico.

## Objetivo do produto

O ColaFig deve permitir que uma pessoa:

1. navegue pela caderneta na ordem física do álbum;
2. consulte todas as faltantes sem escolher seleção por seleção;
3. consulte todas as repetidas e a quantidade disponível para troca;
4. compartilhe a coleção com amigos sem expor e-mail ou dados de autenticação;
5. entenda e exerça seus direitos de privacidade.

## Entrega 1 — organização global da coleção

Status: implementada no código, aguardando publicação.

- Separar as visões `Caderneta`, `Faltantes` e `Repetidas`.
- Manter paginação e seletor de seção apenas na Caderneta.
- Agrupar faltantes e repetidas por seleção em uma lista global pesquisável.
- Mostrar, nas repetidas, o total de cópias e quantas estão disponíveis para troca.
- Permitir alterar a quantidade diretamente em qualquer visão.
- Tornar os indicadores Faltantes e Repetidas do resumo atalhos clicáveis.

Critério de aceite: uma pessoa encontra qualquer faltante ou repetida em até dois toques, sem navegar por páginas do álbum.

## Entrega 2 — endurecimento técnico imediato

Status: implementada no código e na migration `20260714005000_social_abuse_controls.sql`, aguardando aplicação coordenada.

- Impedir a renderização da coleção quando o aplicativo estiver dentro de um frame de outro site.
- Fixar GitHub Actions em SHAs completos e limitar `pages: write`/`id-token: write` ao job de deploy.
- Substituir a consulta direta e ampla de perfis por RPC autenticada:
  - busca mínima de três caracteres;
  - no máximo 12 resultados;
  - no máximo 30 buscas a cada 10 minutos por usuário.
- Substituir insert direto de convites por RPC autenticada:
  - no máximo 20 convites em 24 horas por usuário;
  - cooldown de 10 minutos para reenviar ao mesmo perfil;
  - histórico de eventos não removido ao cancelar um convite.

Critério de aceite: o frontend publicado usa as novas RPCs, a migration está aplicada e os fluxos de busca, convite, aceite, recusa e remoção passam em produção.

Observação: a proteção de frame no aplicativo reduz o risco no GitHub Pages, mas o controle ideal continua sendo o cabeçalho HTTP `Content-Security-Policy: frame-ancestors 'none'`. Para aplicá-lo, o domínio deve passar por uma camada que permita configurar cabeçalhos, como CDN/proxy gerenciado.

## Entrega 3 — controles sociais complementares

Status: planejada.

- Adicionar bloqueio de usuário, impedindo busca, convite e visualização futura da coleção.
- Criar ação “Denunciar perfil” com motivo, protocolo e fila de análise.
- Adicionar moderação básica para nome de usuário/nome exibido.
- Definir prazo de retenção e limpeza para `friend_request_events`.
- Medir abuso por métricas agregadas, sem analytics comportamental no navegador.

Critério de aceite: uma pessoa bloqueada não consegue enviar convite, localizar o perfil bloqueador nem consultar sua coleção.

## Entrega 4 — LGPD operacional

Status: processo inicial descrito em `docs/privacy-operations-runbook.md`; evidências operacionais ainda precisam ser criadas.

- Confirmar responsável pelo canal `privacidade@sabion.io` e substituto.
- Manter registro de solicitações, verificação de identidade, decisões e datas.
- Implementar exportação estruturada dos dados da conta.
- Implementar exclusão completa envolvendo Auth, perfil, coleções, amizades, limites/eventos, backups e dados locais.
- Aprovar uma tabela de retenção para conta, logs, backups, convites e incidentes.
- Executar um exercício de resposta a incidente e guardar a evidência.

Critério de aceite: uma solicitação simulada de acesso/exportação e outra de exclusão percorrem o processo completo e deixam trilha auditável.

## Entrega 5 — transferência internacional

Status: bloqueada por evidência contratual.

- Obter a versão aceita do DPA da conta Supabase.
- Confirmar a região efetiva do projeto e os subprocessadores aplicáveis.
- Confirmar o mecanismo de transferência internacional aplicável ao Brasil e eventual aditivo com cláusulas-padrão da ANPD.
- Atualizar a Política de Privacidade somente após a confirmação documental.

Critério de aceite: DPA, mecanismo de transferência e lista de subprocessadores ficam registrados com versão, data e responsável pela revisão.

## Entrega 6 — ECA Digital e menores

Status: contenção provisória 18+ implementada no código e na migration `20260714006000_adult_only_access.sql`; revisão jurídica e adequação à orientação definitiva da ANPD continuam pendentes.

- Nesta fase, não é oferecida uma experiência para crianças ou adolescentes: novas contas e contas existentes precisam confirmar elegibilidade 18+.
- A data de nascimento é validada no banco durante a requisição e descartada. O perfil guarda somente o resultado positivo, a data da confirmação e a versão da regra.
- Campos de elegibilidade enviados pelo navegador são removidos pelo gatilho do banco antes da criação da conta; somente o fluxo controlado do banco pode confirmar a elegibilidade.
- RLS restritiva bloqueia coleções, biblioteca e amizades para contas sem confirmação, independentemente da interface.
- Contas existentes passam por uma confirmação obrigatória antes de a aplicação carregar dados locais ou remotos.
- A autodeclaração de data é uma contenção provisória e não deve ser apresentada como aferição etária robusta ou conformidade jurídica definitiva.

Próximos passos: acompanhar a orientação definitiva da ANPD, prevista no cronograma oficial para agosto de 2026; reavaliar o mecanismo de aferição; obter revisão jurídica; documentar testes e decisão sobre eventual experiência futura para menores.

Critério de aceite provisório: uma conta não confirmada não acessa coleções nem recursos sociais por API, e a data de nascimento não persiste no Auth nem nas tabelas públicas.

## Ordem recomendada de publicação

1. Publicar frontend e migration social de forma coordenada.
2. Validar busca/convites/RLS com duas contas de teste.
3. Configurar cabeçalho anti-frame em uma camada HTTP do domínio.
4. Implementar bloqueio e denúncia.
5. Fechar DPA/transferência e executar o runbook LGPD.
6. Validar juridicamente e revisar a contenção 18+ após a orientação definitiva da ANPD; não promover o produto ao público infantojuvenil.

## Evidências mínimas por release

- build e lint concluídos;
- migrations aplicadas e registradas;
- teste de RLS entre proprietário, amigo aceito e terceiro;
- teste das quotas sociais;
- revisão das variáveis públicas do Pages, sem `service_role`;
- registro da versão dos textos legais e do responsável pela aprovação.

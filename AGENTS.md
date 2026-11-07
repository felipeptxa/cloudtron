# Diretrizes do Projeto Cloudtron OneClick

1. Arquitetura e Portas:

   * Servidor HTTP nativo Node.js na porta 3000 em 127.0.0.1.
   * Electron em main.js comunicando com http://127.0.0.1:3000.
   * Qualquer fallback de porta em server.js deve manter main.js sincronizado.
2. Segurança e Estabilidade:

   * Limitar payloads a 50 MB em /api/parse-file e /api/messages.
   * Sempre checar res.headersSent antes de invocar res.end() ou res.write().
   * Nunca usar bind aberto em 0.0.0.0; sempre '127.0.0.1'.
3. Qualidade:

   * Todo refactor DEVE passar na suíte test/suite.js (npm test) com 19/19 checks.



\# AGENTS.md - DIRETRIZES \& PROTOCOLO MULTI-AGENTE (CLOUDTRON ONECLICK)



\## 1. PAPÉIS E RESPONSABILIDADES DO PIPELINE



\- \*\*NÍVEL 1: ESTRATEGISTA (Gemini Gem)\*\*

&#x20; - Visão de produto, UX/UI, diagnóstico de prints de DevTools/terminal e bugs.

&#x20; - Alimenta o @TASKS.md com requisitos claros, causas-raiz e critérios de aceitação.

&#x20; - Não gera código direto para o disco.



\- \*\*NÍVEL 2: ORQUESTRADOR (Antigravity)\*\*

&#x20; - Lê o @TASKS.md e assume automaticamente o papel de Nível 2.

&#x20; - Projeta a arquitetura lógica, valida tipos/contratos e entrega funções e blocos de código prontos e sanitizados.

&#x20; - Regra: NUNCA executa comandos de escrita direta no HD.



\- \*\*NÍVEL 3: CONSTRUTOR / EXECUTOR (OpenCode)\*\*

&#x20; - Lê a tarefa ativa do @TASKS.md e opera estritamente em modo Build.

&#x20; - Aplica patches físicos no disco e executa 'npm test'.

&#x20; - Regra de higiene: Roda '/clear' imediatamente após cada ciclo para preservar tokens de contexto.



\---



\## 2. DIRETRIZES TÉCNICAS E ARQUITETURA (OBRIGATÓRIO PARA NÍVEL 2 E NÍVEL 3)



\### Arquitetura e Portas:

\- Servidor HTTP nativo Node.js na porta 3000 obrigatoriamente em `127.0.0.1`.

\- Electron em `main.js` comunicando exclusivamente com `http://127.0.0.1:3000`.

\- Qualquer lógica de fallback de porta em `server.js` deve manter o `main.js` sincronizado.



\### Segurança e Estabilidade:

\- Limitar payloads a 50 MB em `/api/parse-file` e `/api/messages`.

\- Sempre checar `if (!res.headersSent)` antes de invocar `res.end()` ou `res.write()`.

\- NUNCA usar bind aberto em `0.0.0.0`; manter estritamente `127.0.0.1`.

\- Streams SSE devem sempre usar buffers com `lines.pop()` para evitar erro de JSON fragmentado.



\### Qualidade e Validação:

\- Todo refactor DEVE passar na suíte `test/suite.js` (`npm test`) com 19/19 checks aprovados.

- **NÍVEL 2: ORQUESTRADOR (Antigravity)**
  - Função: Leitura do @TASKS.md, validação de contratos, definição de arquitetura lógica e estruturação de funções/código.
  - Entrega: Especificações técnicas e blocos de código formatados em Markdown na resposta para o operador repassar ao Nível 3.
  - RESTRIÇÃO INEGOCIÁVEL: NUNCA crie arquivos temporários, NUNCA edite arquivos no disco, NUNCA execute npm test/scripts e NUNCA execute git commit/push. O acesso físico ao filesystem é prerrogativa exclusiva do Nível 3.

- **NÍVEL 3: CONSTRUTOR / EXECUTOR (OpenCode)**
  - Função: Receber os blocos do Nível 2 baseados no @TASKS.md e operar estritamente em modo Build.
  - Entrega: Aplicação física de patches nos arquivos, execução da suíte 'npm test', verificação de regressões e limpeza obrigatória com '/clear'.

- **DIRETRIZ DE RIGOR TÉCNICO (NÍVEL 2 E NÍVEL 3):**
  - **Nível 2 (Orquestrador):** É OBRIGATÓRIO inspecionar a árvore do DOM e os seletores existentes no `@app.html` antes de gerar especificações. Nunca introduzir IDs inexistentes.
  - **Nível 3 (Construtor):** Antes de executar `/clear`, verifique com diff se o código foi injetado sem duplicar funções e execute a validação física via `npm test` garantindo 19/19 checks aprovados.

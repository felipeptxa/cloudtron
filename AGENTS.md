# AGENTS.md — DIRETRIZES & PROTOCOLO MULTI-AGENTE (CLOUDTRON ONECLICK v1.4.0)

## 1. O PIPELINE DE ENGENHARIA DE 5 NÍVEIS

O desenvolvimento do Cloudtron OneClick opera sob uma esteira estrita e desacoplada em 5 níveis de maturidade, eliminando regressões através de contratos formais e validação contínua:

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│  L1: ESTRATEGISTA│ ────> │ L2: ORQUESTRADOR LÓG.│ ────> │  L3: CONSTRUTOR     │
│    (Gemini Gem) │       │    (Antigravity)     │       │    (OpenCode)       │
└─────────────────┘       └──────────────────────┘       └──────────┬──────────┘
                                                                    │
                                                                    ▼
                                                         ┌─────────────────────┐
                                                         │ L4: REVISOR CEGO    │
                                                         │ (pipeline-verify.js)│
                                                         └──────────┬──────────┘
                                                                    │
                                                                    ▼
                                                         ┌─────────────────────┐
                                                         │ L5: VALIDADOR E2E   │
                                                         │  (Playwright E2E)   │
                                                         └─────────────────────┘
```

---

### Papéis e Responsabilidades:

1. **NÍVEL 1: ESTRATEGISTA (Gemini Gem)**
   - **Função:** Visão de produto, UX/UI, diagnóstico de bugs e priorização de arquitetura.
   - **Entrega:** Alimenta e atualiza exclusivamente o `TASKS.md` com requisitos inequívocos, causas-raiz e critérios de aceitação.
   - **Restrição:** Não gera código direto para o disco.

2. **NÍVEL 2: ORQUESTRADOR LÓGICO & ENGENHEIRO DE SOFTWARE (Antigravity)**
   - **Função:** Leitura do `TASKS.md`, inspeção estrutural de contratos, árvore do DOM e seletores. Planeja a arquitetura lógica e gera blocos cirúrgicos e funções puras prontas para aplicação.
   - **Entrega:** Blocos de código 100% prontos e sanitizados em Markdown na resposta para o operador repassar ao Nível 3.
   - **RESTRIÇÃO INEGOCIÁVEL:** NUNCA edita arquivos no disco, NUNCA executa scripts de terminal, NUNCA roda testes e NUNCA faz commits. O acesso físico ao filesystem é prerrogativa do Nível 3.

3. **NÍVEL 3: CONSTRUTOR / EXECUTOR (OpenCode)**
   - **Função:** Aplica os patches de código fornecidos pelo Nível 2 nos arquivos do workspace.
   - **Entrega:** Gravação física no disco e disparo autônomo do pipeline unificado via `npm run pipeline`.
   - **Regra de Higiene:** Executa obrigatoriamente `/clear` após a validação para evitar vazamento de contexto entre tarefas.

4. **NÍVEL 4: REVISOR CEGO (Script Automatizado / Diff Auditor)**
   - **Função:** Integrado em `scripts/pipeline-verify.js`. Realiza análise estática automatizada do `git diff`, verifica integridade de arquivos vitais (`server.js`, `app.html`), inspeciona profundidade de CSS e bloqueia inclusão de arquivos temporários (`.tmp`, `.log`, `.bak`).
   - **Critério de Saída:** Aborta a execução com `exit(1)` imediatamente caso detecte quebras de contrato.

5. **NÍVEL 5: VALIDADOR FUNCIONAL E2E (Playwright Runner)**
   - **Função:** Executa a bateria de testes de ponta a ponta em Chromium headless (`npm run test:e2e`).
   - **Critérios Auditados:** Console limpo (zero `ReferenceError`), responsividade e persistência do splitter da barra lateral, desacoplamento de payload do NeMo e sanidade de reset de sessão.

---

## 2. DIRETRIZES TÉCNICAS E ARQUITETURA INEGOCIÁVEIS

### Arquitetura e Rede:
- Servidor HTTP nativo Node.js obrigatoriamente na porta 3000 em `127.0.0.1`. NUNCA usar bind aberto em `0.0.0.0`.
- Electron em `main.js` comunicando exclusivamente com `http://127.0.0.1:3000`.
- Payloads limitados a 50 MB em `/api/parse-file` e `/api/messages`.
- Sempre checar `if (!res.headersSent)` antes de invocar `res.end()` ou `res.write()`.
- Streams SSE devem utilizar decodificação em buffer com `lines.pop()` para evitar fragmentação de JSON.

### Qualidade e Homologação:
- Nenhuma tarefa é considerada concluída sem que o comando `npm run pipeline` retorne código de saída `0` com 100% dos checks unitários e testes E2E aprovados.

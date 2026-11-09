# TASKS - CLOUDTRON ONECLICK (v1.4.1-align)

### TAREFA ATIVA: Alinhamento Visual do App, Resolução de Download e Modernização da Landing Page

- [ ] **Alvos:** `@index.html`, `@docs/index.html`, `@app.html`, `@docs/app.html`, `@test/suite.js`
- [ ] **Prioridade:** UX/UI, Confiabilidade de Release e Consistência de Branding

---

#### 1. Landing Page: Botões e Correção de Rota (@index.html e @docs/index.html)
- [ ] **Remover Botão Redundante:** Eliminar o botão "Versão mais recente no GitHub". Manter estritamente:
  1. `Baixar para Windows (x64)` com subtexto `Cloudtron-OneClick-Setup-1.4.0.exe (NSIS)`.
     - Link de download apontando para a release ativa verificada:
       `https://github.com/felipeptxa/cloudtron/releases/download/1.4.0/Cloudtron-OneClick-Setup-1.4.0.exe`
  2. `Ver no GitHub (MIT)` apontando para `https://github.com/felipeptxa/cloudtron`.
- [ ] **Reescrita dos 6 Cards de Recursos (Linguagem Popular + Rigor Técnico):**
  - Card 1: Instalação Instantânea (Zero Setup) — Baixe e use sem Python/CUDA vs Electron + Node.js SSE.
  - Card 2: Raciocínio Transparente (Deep Thinking) — Caixa retrátil para ver a lógica vs tag <thinking> CoT nativa.
  - Card 3: Entendimento de Imagens e Arquivos (Multimodal) — Ctrl+V para prints e tabelas vs parsers PDF/DOCX/XLSX.
  - Card 4: Visualizador em Tempo Real (Live Sandbox Preview) — Iframe isolado para rodar HTML/JS ao vivo.
  - Card 5: Conexão Resiliente e Sem Quedas (Cascading Failover) — IA sem interrupção vs cascata configurável NVIDIA -> Groq -> OpenRouter.
  - Card 6: Ajuste de Raciocínio por Tarefa (Effort Adaptativo) — Respostas rápidas vs foco profundo e analítico.
- [ ] **Sincronização da Seção Linha do Tempo:**
  - Card 1: v1.0 - v1.2 (Lançado) — Base Desktop & Proxy SSE
  - Card 2: v1.3.0 (Lançado) — Effort Dock, Split View & Sandbox
  - Card 3: v1.4.0 (Versão Atual) — Cascading Failover & Pipeline Resiliente L4/L3/L5
  - Card 4: v1.5.0 (Planejado) — Matriz de Agentes Customizável (Paperclip Core) & Priority Failover

---

#### 2. Refinamento Visual da Aplicação Real (@app.html e @docs/app.html)
- [ ] **Preservação Contratual Rígida:**
  - NÃO alterar IDs funcionais, seletores de squad, streaming SSE, parsers ou modal de configurações recém-implementados.
  - MANTER a logo oficial intacta (hexágono de nós de rede do Cloudtron).
- [ ] **Elevação Cosmética (Paridade com Mockup da Landing):**
  - Paleta de sintaxe nos codeblocks inspirada no Deep Midnight / Neon:
    - Cyan Neon (`#38bdf8`) para tags e seletores.
    - Mint Green (`#4ade80`) para componentes, funções e badges de sucesso.
    - Lilac / Rose (`#c084fc` / `#f472b6`) para strings e propriedades.
    - Fundo do editor em contraste refinado (`bg-[#0c1017]` ou similar com borda `border-white/5`).
  - Polimento de raios de curvatura (`rounded-xl`) e bordas translúcidas nos containers laterais e chat.
  - Garantir 100% de paridade entre `app.html` e `docs/app.html`.

---

#### 3. Bateria de Validação Automatizada (@test/suite.js)
- [ ] Atualizar Seção 4 para validar as URLs corrigidas da Hero da landing page.
- [ ] Garantir profundidade CSS depth=0 e integridade dos testes de contrato da Seção 7.

---

#### 4. Critérios de Aceitação
- Botão de download na landing page baixa o binário oficial sem erro 404.
- Landing page limpa com apenas 2 botões na Hero.
- Janela real do app alinhada à estética da landing page preservando a logo oficial e o novo motor multi-agente intacto.
- Pipeline `npm run pipeline` 100% verde (L4 -> L3 -> L5).
<div align="center">

# ⚡ Cloudtron OneClick (v1.3.0)
### Desktop Nativo & Web UI para NVIDIA Nemotron 3.5 Super VL 120B

[![Website](https://img.shields.io/badge/%F0%9F%8C%90_Website_Oficial-felipeptxa.github.io%2Fcloudtron-00F0FF?style=for-the-badge&logo=googlechrome&logoColor=black)](https://felipeptxa.github.io/cloudtron/)
[![Download Windows](https://img.shields.io/badge/%F0%9F%93%A5_Baixar_Windows_x64-v1.3.0-00FFA3?style=for-the-badge&logo=windows&logoColor=black)](https://github.com/felipeptxa/cloudtron/releases/download/v1.3.0/Cloudtron-OneClick-Setup-1.3.0.exe)
[![Licença MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-7928CA?style=for-the-badge)](LICENSE)

**[👉 Acessar Landing Page Oficial](https://felipeptxa.github.io/cloudtron/)** • **[⚡ Web Preview Online](https://felipeptxa.github.io/cloudtron/app.html)** • **[📦 Baixar Instalador NSIS v1.3.0](https://github.com/felipeptxa/cloudtron/releases/download/v1.3.0/Cloudtron-OneClick-Setup-1.3.0.exe)** • **[📖 Documentação](#-recursos-principais-v13)**

---

</div>

Aplicativo Desktop nativo para Windows (Electron) e Web UI local projetado para interagir com o modelo multimodal de raciocínio profundo **NVIDIA Nemotron 3.5 Super VL 120B** sem configurações complexas de ambiente.

Distribuição pronta via instalador executável: `Cloudtron-OneClick-Setup-1.3.0.exe` (NSIS x64).

---

## 🇧🇷 Português (Brasil)

### ✨ Recursos Principais (v1.3.0)

* 📑 **Universal Document Ingestion (Extração Local e Direta de Documentos):**
  * Leitura e extração estruturada de documentos diretamente na máquina local sem expor dados brutos:
    - **PDF:** Extração de texto integral com contagem de páginas e palavras (`pdf-parse`).
    - **Word (DOCX, DOC, RTF):** Conversão automática para Markdown estruturado (`mammoth`).
    - **Excel (XLSX, XLS):** Detecção de abas e conversão em tabelas Markdown (`xlsx`).
    - **PowerPoint (PPTX):** Extração de texto slide a slide (`officeparser`).
    - **Jupyter Notebooks (IPYNB):** Parse inteligente de células Markdown e blocos de código com suas saídas.
    - **Pacotes ZIP:** Mapeamento visual da árvore de pastas e concatenação de códigos e textos internos (`adm-zip`).
    - **Códigos e Scripts:** Suporte a dezenas de extensões (`.py`, `.js`, `.ts`, `.html`, `.sql`, `.json`, etc.).
  * Chips informativos com metadados no chat (ex.: `📕 contrato.pdf (12 págs · 3.400 palavras)`).

* 📋🔨 **Modo Plan vs. Modo Build (Seletor no Prompt):**
  * **Plan (📋):** Injeta diretiva de sistema focada em arquitetura, análise de dependências e plano de ação — sem gerar código executável bruto. Ideal para planejar antes de implementar.
  * **Build (🔨):** Focado em implementação direta, refatoração cirúrgica e blocos de código executáveis prontos para uso.

* 🧠 **Seletor de Esforço (Effort) com Dropdown Minimalista:**
  * **Auto (Heurístico):** Detecção contextual automática de complexidade.
  * **Rápido:** Baixa latência, sem reasoning estendido — respostas diretas e econômicas.
  * **Código:** Otimizado para testes e sintaxe estrita.
  * **Criativo:** Temperatura expandida para ideação, brainstorming e exploração de conceitos.
  * **Profundo:** CoT estendido com alta densidade lógica para desafios de arquitetura e problemas complexos.

* 🛡️ **Clautron NeMo Core & Guardrails:**
  * **NeMo Guardrails de Pré-Validação:** Sanitização de caracteres de controle e bytes nulos, e normalização com alternância estrita de papéis no histórico.
  * **NeMo LLM-as-a-Judge em Background:** Avaliação assíncrona não bloqueante de cada resposta com pontuação (1 a 10) e veredito PASS/FAIL gravado em `data/nemo_evals.jsonl`.
  * **Seed Determinística & Modo JSON:** Suporte a seed constante para reprodução exata e formatação `json_object`.
  * **Feedback Humano (👍/👎):** Botões no rodapé para qualificar respostas e reportar motivos específicos em `data/feedback.jsonl`.

* 🔄 **Closed-Loop Intelligence: Auto-Correção Ativa via NVIDIA NeMo Judge (In-Context RLHF):**
  * **Aprendizado Contínuo em Tempo de Execução:** Esqueça LLMs que repetem os mesmos erros. O Cloudtron OneClick v1.3.0 implementa **In-Context RLHF em tempo de execução**: cada resposta é auditada sintaticamente e semanticamente por um LLM-as-a-Judge independente, cujo feedback calibra dinamicamente as inferências seguintes dentro da mesma sessão.
  * **Injeção de Diretiva de Auto-Calibração:** Ao detectar advertências ou inconformidades (`nemo.score < 7` ou `FAIL/WARN`), o backend injeta automaticamente o bloco `[AUDITORIA DO JUIZ NEMO DA RESPOSTA ANTERIOR]` no turno subsequente, instruindo o modelo a reconhecer a falha anterior e refatorar com precisão estrita sem necessidade de prompts corretivos manuais.
  * **Telemetria e Transparência Total:** Veredito exposto diretamente no badge interativo com nota, status e crítica técnica acessível via tooltip e botão isolado de cópia instantânea (`📋` com feedback `✅`).

* 🤖 **Modo Adaptativo Heurístico ("Automático"):**
  * Detecção instantânea de intenção e modulação dinâmica de temperatura, top-p, tokens e thinking.

* ⚙️ **Central de Configurações Globais (Abas):**
  * **Personalização & Contexto:** Custom System Prompt permanente, upload de arquivos de regras/documentação (.md, .txt, .pdf, .docx, .zip) e Context Bridge para importar históricos de outras IAs.
  * **Provedores & API Keys:** NVIDIA NIM, Groq Cloud, OpenRouter Free, DeepSeek Oficial, Google AI Studio e Anthropic Claude — organizados por tiers (Gratuitos / Alta Potência, Custo-Benefício, Flagships).
  * **Otimização & Agentes:** Toggle do auditor NVIDIA NeMo com descrição de integridade lógica e mitigação de alucinações.

* 🟢 **Verificação de Atualizações do GitHub:**
  * Checagem automática e não intrusiva com modal de changelog e botão de download.

* 🔍 **Busca Instantânea no Histórico:**
  * Barra de busca rápida na barra lateral para filtrar conversas salvas em tempo real.

* ⚡ **Smart Auto-Scroll & Telemetria Linear:**
  * Rolagem inteligente sem travamento, caixa de pensamento recolhida por padrão e telemetria em linha única: `⚡ TTFT: 0.4s • Total: 1.8s • Mode: Plan • Effort: Profundo • NeMo: PASS`.

* 🖥️ **Aplicativo Desktop Nativo (Windows x64):**
  * Empacotado com **Electron** e **electron-builder** com instalador NSIS completo.
  * Ícone, janela customizada com tema escuro imersivo e sem barras de menu poluídas.
  * Atalho **F12** integrado para depuração e inspeção em tempo real.

* 🧠 **NVIDIA Nemotron 3.5 Super VL 120B:**
  * Conexão direta com o endpoint oficial NVIDIA NIM.
  * Suporte nativo a **Chain-of-Thought / Deep Thinking**.
  * Streaming em tempo real via Server-Sent Events (SSE) de baixa latência.

* 🩺 **Botão de Diagnóstico de 2 Passos no Topo:**
  * Checa a comunicação com o servidor local e testa em tempo real se a chave `nvapi-...` está ativa e autorizada.

* 👁️ **Suporte Multimodal Nativo (Visão):**
  * Cole imagens diretamente da área de transferência com **Ctrl + V**.
  * Arraste arquivos de código (`.js`, `.py`, `.html`, `.css`, `.json`, `.csv`, `.md`) e capturas de tela.

* 🔄 **Fila de Swap & Failover Resiliente (Zero Interrupção):**
  * O backend mantém uma fila de prioridade de provedores (NVIDIA NIM → Groq Cloud → OpenRouter Free → DeepSeek Oficial → Google AI Studio → Anthropic Claude).
  * Se o provedor ativo retornar 429 (Rate Limit), 402 (Payment/Quota Exceeded), 401 (Chave Inválida) ou timeout (>15s), o backend **não aborta** a comunicação: envia um evento SSE de `failover` ao cliente e executa imediatamente a chamada ao próximo provedor válido da fila com o mesmo histórico.
  * Se o erro ocorrer após tokens já transmitidos, o buffer parcial é limpo para que o modelo substituto responda de forma coesa.
  * A telemetria exibe a etiqueta `🔄 Failover: <Provedor Destino> (<Provedor Origem>)` quando ocorre uma troca.

* 🎛️ **Controle de Esforço / Raciocínio por Conversa:**
  * **Rápido:** Desativa o raciocínio estendido para respostas instantâneas e econômicas.
  * **Médio:** Equilíbrio técnico ideal para o dia a dia.
  * **Alto / Profundo (CoT):** Orçamento máximo de raciocínio profundo para desafios de arquitetura e lógica.

* ▶️ **Live Sandbox / Visualização Interativa:**
  * Execute códigos HTML5/CSS3/JavaScript gerados pelo modelo dentro da própria interface em sandbox segura, com rolagem fluida, isolamento de layout e toolbar de controles (Reset View, resolução ajustável e abrir em nova janela).

* 📐 **Interface Otimizada:**
  * Barra lateral retrátil com ajuste de largura manual.
  * Armazenamento local no computador (`localStorage`), exportação em Markdown (`.md`) e renomeação de chats.
  * Layout responsivo (`min(90vw, 1200px)`) que se adapta a telas Full HD / 2K sem faixas pretas excessivas.

---

### 📸 Demonstrações Visuais

| # | Tela | Descrição |
|---|------|-----------|
| 1 | ![Mockup Principal](docs/og-preview.png) | Interface Principal com a nova Docked Input Bar (Plan/Build + Seletor de Esforço). |
| 2 | ![Central de Provedores](docs/og-preview.png) | Central de Provedores e Configuração de Failover (abas de Configurações). |
| 3 | ![Live Sandbox](docs/og-preview.png) | Live Preview Sandbox interativo executando código gerado. |
| 4 | ![Ingestão](docs/og-preview.png) | Ingestão Universal de Documentos (PDF, DOCX, XLSX). |

---

### 📦 Como Instalar e Rodar

#### Opção 1: Instalador Desktop Windows (Recomendado para usuários finais)
1. Baixe o instalador `Cloudtron-OneClick-Setup-1.3.0.exe` na [Release v1.3.0](https://github.com/felipeptxa/cloudtron/releases/tag/v1.3.0).
2. Execute o instalador e siga o assistente (criará atalho na Área de Trabalho e no Menu Iniciar).
3. Abra o aplicativo, clique em **Configurações** no topo, insira sua chave da NVIDIA (`nvapi-...`) ou de outro provedor (Groq, OpenRouter, DeepSeek, etc.) e comece a conversar!

#### Opção 2: Modo Desenvolvedor (Terminal / Código Fonte)
1. Instale o [Node.js](https://nodejs.org/) (versão 18+).
2. Clone o repositório:
   ```bash
   git clone https://github.com/felipeptxa/cloudtron.git
   cd cloudtron
   ```
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o aplicativo desktop:
   ```bash
   npm start
   ```
5. Para gerar um novo instalador `.exe`:
   ```bash
   npm run dist
   ```

---

## 🇺🇸 English

### ✨ Key Features (v1.3.0)

* 🖥️ **Native Desktop App (Windows x64):**
  * Built with **Electron** & **electron-builder** with NSIS installer.
  * Custom dark mode theme, frameless look, zero unnecessary menu bars.
  * Integrated **F12** shortcut for real-time developer inspection.
* 🧠 **NVIDIA Nemotron 3.5 Super VL 120B:**
  * Direct connection to NVIDIA NIM.
  * Native **Chain-of-Thought / Deep Thinking**.
  * Real-time Server-Sent Events (SSE) streaming.
* 🩺 **One-Click Diagnostic Button:**
  * Real-time 2-step check: verifies local proxy and validates `nvapi-...` credentials against NVIDIA servers.
* 👁️ **Native Multimodal Support (Vision):**
  * Paste images with **Ctrl + V**.
  * Drag & drop code files and screenshots.
* 📋🔨 **Plan vs. Build Mode:**
  * **Plan:** Architectural directives, dependency analysis and action plans — no raw executable code.
  * **Build:** Direct implementation, surgical refactoring and executable code blocks.
* 🧠 **Effort Selector (Dropdown):**
  * **Auto:** Contextual heuristic detection.
  * **Fast:** Low latency, no extended reasoning.
  * **Code:** Optimized for tests and strict syntax.
  * **Creative:** Expanded temperature for ideation and brainstorming.
  * **Deep:** Extended CoT with high logical density for complex problems.

* 🔄 **Closed-Loop Intelligence: Active Self-Correction via NVIDIA NeMo Judge (In-Context RLHF):**
  * **Runtime Continual Calibration:** Forget LLMs that repeat identical errors. Cloudtron OneClick v1.3.0 introduces runtime In-Context RLHF: every assistant turn is audited syntactically and semantically by an independent LLM-as-a-Judge, dynamically calibrating subsequent reasoning within the ongoing session.
  * **Automated Self-Calibration Injection:** When warnings or regressions are identified (`nemo.score < 7` or `FAIL/WARN`), the backend automatically prepends `[AUDITORIA DO JUIZ NEMO DA RESPOSTA ANTERIOR]` to the following turn, compelling the model to acknowledge flaws and deliver hardened refactorings without user manual prompting.
  * **Full Telemetry & Inspection:** Real-time verdict badge with score and full critique exposed via native tooltips and decoupled copy buttons (`📋` with `✅` visual confirmation).

* 🔄 **Swap Queue & Resilient Failover (Zero Interruption):**
  * Priority provider queue (NVIDIA NIM → Groq Cloud → OpenRouter Free → DeepSeek → Google AI Studio → Anthropic Claude).
  * On 429 / 402 / 401 / timeout (>15s), the backend sends an SSE `failover` event and immediately retries with the next provider using the same history.
  * If the error occurs after tokens were already transmitted, the partial buffer is cleared so the substitute model replies coherently.
  * Telemetry displays `🔄 Failover: <Dest> (<Origin>)` when a swap occurs.
* ▶️ **Live Sandbox / Web Preview:**
  * Test and run HTML/CSS/JS artifacts directly inside the application with smooth scrolling, layout isolation and a control toolbar.

---

### 📄 License

Distributed under the MIT License. Author: Felipe Monroe.

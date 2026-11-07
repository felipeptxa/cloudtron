# Relatório de Mudanças — Cloudtron OneClick

**Versão anterior:** 1.2.0  
**Versão atual:** 1.2.1  
**Data:** atualização de padronização de marca e links  
**Autor:** Felipe Monroe  

---

## Resumo

Este relatório documenta as alterações realizadas para padronizar o nome oficial do projeto como **Cloudtron**, unificar o link do repositório GitHub e sincronizar a versão exibida no site com a versão definida no ficheiro `package.json`.

---

## Alterações por ficheiro

### 1. CLAUTRON SITE/index.html

| Campo | Antes (1.2.0) | Depois (1.2.1) |
|-------|---------------|----------------|
| Nome oficial do projeto | CLOUDTRON / CLAUTRON (misto) | Cloudtron |
| Título da página | CLOUDTRON OneClick — ... (v1.2.0) | Cloudtron OneClick — ... (v1.2.1) |
| Meta `description` | CLOUDTRON OneClick é a estação... | Cloudtron OneClick é a estação... |
| Meta `keywords` | CLOUDTRON, CLOUDTRON OneClick, CLAUTRON, ... | Cloudtron, Cloudtron OneClick, ... |
| Link canónico | https://felipeptxa.github.io/claudtron/ | https://felipeptxa.github.io/cloudtron/ |
| Open Graph `og:url` | https://felipeptxa.github.io/claudtron/ | https://felipeptxa.github.io/cloudtron/ |
| Open Graph `og:site_name` | CLOUDTRON OneClick | Cloudtron OneClick |
| Twitter `twitter:url` | https://felipeptxa.github.io/claudtron/ | https://felipeptxa.github.io/cloudtron/ |
| Schema.org `name` | CLOUDTRON OneClick | Cloudtron OneClick |
| Schema.org `downloadUrl` | https://github.com/felipeptxa/claudtron/releases | https://github.com/felipeptxa/cloudtron/releases |
| Botão de download (href) | .../claudtron/releases/download/v1.2.0/CLOUDTRON-OneClick-Setup-1.2.0.exe | .../cloudtron/releases/download/v1.2.1/Cloudtron-OneClick-Setup-1.2.1.exe |
| Texto do botão de download | CLOUDTRON OneClick Setup 1.2.0.exe | Cloudtron OneClick Setup 1.2.1.exe |
| Versão exibida na marca | v1.2.0 | v1.2.1 |
| Links de suporte/GitHub no rodapé e modal | github.com/felipeptxa/claudtron | github.com/felipeptxa/cloudtron |
| Mensagens de toast | referências a CLOUDTRON e v1.2.0 | referências a Cloudtron e v1.2.1 |

### 2. GITHUB/package.json

| Campo | Antes | Depois |
|-------|-------|--------|
| `repository.url` | https://github.com/felipeptxa/clautron.git | https://github.com/felipeptxa/cloudtron.git |
| `githubRepo` | felipeptxa/clautron | felipeptxa/cloudtron |
| `version` | 1.2.1 (já estava correto) | 1.2.1 (mantido) |
| `name` | cloudtron-oneclick | cloudtron-oneclick (mantido) |
| `productName` | Cloudtron OneClick | Cloudtron OneClick (mantido) |

---

## Observações

- O nome do diretório de origem continua a ser `CLAUTRON SITE`, mas todas as referências visuais e de metadados dentro do `index.html` agora usam **Cloudtron**.
- O repositório GitHub oficial está unificado em:  
  **https://github.com/felipeptxa/cloudtron**
- A versão do site foi ajustada de **v1.2.0** para **v1.2.1** para coincidir com o `package.json`.

---

*Fim do relatório.*

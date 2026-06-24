# Raro API — Documentação Completa

> API de armazenamento pessoal serverless, com backend 100% no Telegram.
> 
> Deploy: Netlify Functions · Auth: JWT · Storage: Telegram Bot API

---

## Índice

1. [Configuração](#configuração)
2. [Autenticação](#autenticação)
3. [Pastas](#pastas)
4. [Arquivos de texto](#arquivos-de-texto)
5. [Upload e Download binário](#upload-e-download-binário)
6. [Mover e Copiar](#mover-e-copiar)
7. [Busca](#busca)
8. [Formato de resposta](#formato-de-resposta)
9. [Códigos de erro](#códigos-de-erro)
10. [Como o armazenamento funciona](#como-o-armazenamento-funciona)

---

## Configuração

### Variáveis de ambiente (Netlify → Site settings → Environment variables)

Variável
Descrição
Exemplo

`JWT_SECRET`
Chave secreta para assinar os tokens JWT
`uma_chave_longa_e_aleatoria`

`ADMIN_USERNAME`
Usuário de acesso à API
`raro`

`ADMIN_PASSWORD`
Senha de acesso à API
`minha_senha_segura`

`TELEGRAM_BOT_TOKEN`
Token do bot obtido no @BotFather
`7412345678:AAF...`

`TELEGRAM_CHAT_ID`
ID do chat/canal onde os arquivos ficam salvos
`-1001234567890`

### Requisito do bot no Telegram

O bot precisa ser **administrador** do grupo ou canal com permissão de **enviar mensagens**.

O manifest do sistema de arquivos é salvo automaticamente na descrição do bot — nenhuma configuração extra necessária.

### Base URL

```
[apifile.netlify.app](https://apifile.netlify.app/)
```

---

## Autenticação

Todos os endpoints (exceto o login) exigem um token JWT no header `Authorization`.

### Login

```
POST /api/auth/login
```

**Body**

```
{
  "username": "admin",
  "password": "sua_senha"
}
```

**Resposta 200**

```
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Como usar o token nas próximas requests**

Adicione o header em todas as chamadas:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> O token expira em **24 horas**. Após isso, faça login novamente.

---

## Pastas

### Listar raiz

Lista todos os arquivos e pastas no diretório `/`.

```
GET /api/folders/
```

**Resposta 200**

```
{
  "success": true,
  "data": {
    "items": [
      { "path": "/documentos", "name": "documentos", "type": "folder", "createdAt": "2026-06-24T03:00:00.000Z" },
      { "path": "/notas.txt",  "name": "notas.txt",  "type": "file",   "size": 42, "createdAt": "2026-06-24T03:01:00.000Z" }
    ]
  }
}
```

---

### Listar subpasta

```
GET /api/folders/{path}
```

Parâmetro
Onde
Descrição

`path`
URL
Caminho da pasta **sem** a barra inicial. Ex: `documentos` ou `documentos/fotos`

**Exemplos de URL**

```
GET /api/folders/documentos
GET /api/folders/documentos/fotos
```

**Resposta 200**

```
{
  "success": true,
  "data": {
    "items": [
      { "path": "/documentos/fotos", "name": "fotos", "type": "folder" },
      { "path": "/documentos/cv.txt", "name": "cv.txt", "type": "file", "size": 1024 }
    ]
  }
}
```

---

### Criar pasta

```
POST /api/folders/
Content-Type: application/json
```

**Body**

```
{
  "path": "/documentos"
}
```

> O caminho deve começar com `/`.
> 
> A pasta pai precisa existir. Para criar `/documentos/fotos`, crie `/documentos` primeiro.

**Resposta 201**

```
{
  "success": true,
  "data": {
    "name": "documentos",
    "type": "folder",
    "createdAt": "2026-06-24T03:00:00.000Z",
    "updatedAt": "2026-06-24T03:00:00.000Z"
  }
}
```

---

### Deletar pasta

Deleta a pasta e **todo o conteúdo** recursivamente.

```
DELETE /api/folders/{path}
```

Parâmetro
Onde
Descrição

`path`
URL
Caminho da pasta sem a barra inicial. Ex: `documentos`

**Resposta 200**

```
{
  "success": true,
  "data": { "message": "Pasta e conteúdo deletados com sucesso." }
}
```

---

## Arquivos de texto

### Criar arquivo

```
POST /api/files/
Content-Type: application/json
```

**Body**

```
{
  "path": "/documentos/notas.txt",
  "content": "Conteúdo do arquivo aqui."
}
```

> A pasta pai precisa existir. Para criar `/documentos/notas.txt`, crie `/documentos` primeiro.

**Resposta 201**

```
{
  "success": true,
  "data": {
    "name": "notas.txt",
    "type": "file",
    "size": 25,
    "mimeType": "text/plain",
    "createdAt": "2026-06-24T03:00:00.000Z",
    "updatedAt": "2026-06-24T03:00:00.000Z"
  }
}
```

---

### Ler arquivo

```
GET /api/files/{path}
```

Parâmetro
Onde
Descrição

`path`
URL
Caminho do arquivo sem a barra inicial. Ex: `documentos/notas.txt`

**Resposta 200**

```
{
  "success": true,
  "data": {
    "content": "Conteúdo do arquivo aqui."
  }
}
```

---

### Atualizar arquivo

Sobrescreve o conteúdo do arquivo existente.

```
PUT /api/files/{path}
Content-Type: application/json
```

**Body**

```
{
  "content": "Novo conteúdo do arquivo."
}
```

**Resposta 200**

```
{
  "success": true,
  "data": {
    "name": "notas.txt",
    "type": "file",
    "size": 26,
    "updatedAt": "2026-06-24T04:00:00.000Z"
  }
}
```

---

### Metadados do arquivo

Retorna informações do arquivo sem baixar o conteúdo.

```
GET /api/files/{path}/info
```

**Resposta 200**

```
{
  "success": true,
  "data": {
    "name": "notas.txt",
    "type": "file",
    "size": 25,
    "mimeType": "text/plain",
    "createdAt": "2026-06-24T03:00:00.000Z",
    "updatedAt": "2026-06-24T03:00:00.000Z",
    "chunks": ["BQACAgIAAxkBAAIB..."]
  }
}
```

---

### Deletar arquivo

```
DELETE /api/files/{path}
```

**Resposta 200**

```
{
  "success": true,
  "data": { "message": "Arquivo deletado com sucesso." }
}
```

---

## Upload e Download binário

Para arquivos binários (imagens, PDFs, ZIPs etc.) use estes endpoints.

### Upload

```
POST /api/upload
Content-Type: multipart/form-data
```

Campo
Tipo
Descrição

`path`
string
Caminho completo onde salvar. Ex: `/fotos/imagem.png`

`file`
file
O arquivo binário

**Exemplo com curl**

```
curl -X POST https://<seu-site>.netlify.app/api/upload \
  -H "Authorization: Bearer <token>" \
  -F "path=/fotos/imagem.png" \
  -F "file=@/caminho/local/imagem.png"
```

**Resposta 201**

```
{
  "success": true,
  "data": {
    "name": "imagem.png",
    "type": "file",
    "size": 204800,
    "mimeType": "image/png",
    "createdAt": "2026-06-24T03:00:00.000Z"
  }
}
```

---

### Download

```
GET /api/download/{path}
```

Retorna o arquivo binário diretamente com o `Content-Type` original.

**Exemplo com curl**

```
curl -OJ https://<seu-site>.netlify.app/api/download/fotos/imagem.png \
  -H "Authorization: Bearer <token>"
```

---

## Mover e Copiar

### Mover / Renomear

Funciona para arquivos **e** pastas (move recursivamente o conteúdo junto).

```
POST /api/files/move
Content-Type: application/json
```

**Body**

```
{
  "source":      "/documentos/notas.txt",
  "destination": "/backup/notas-antigas.txt"
}
```

**Resposta 200**

```
{
  "success": true,
  "data": { "message": "Item movido com sucesso." }
}
```

---

### Copiar

```
POST /api/files/copy
Content-Type: application/json
```

**Body**

```
{
  "source":      "/documentos/notas.txt",
  "destination": "/backup/notas.txt"
}
```

> Arquivos copiados referenciam os mesmos `file_id`s no Telegram (não duplica o arquivo lá, só o ponteiro no manifest).

**Resposta 200**

```
{
  "success": true,
  "data": { "message": "Item copiado com sucesso." }
}
```

---

## Busca

Busca por nome de arquivo ou pasta em todo o sistema de arquivos.

```
GET /api/search?q={termo}
```

Parâmetro
Onde
Descrição

`q`
query string
Termo de busca (case-insensitive)

**Exemplo**

```
GET /api/search?q=notas
```

**Resposta 200**

```
{
  "success": true,
  "data": [
    { "path": "/documentos/notas.txt", "name": "notas.txt", "type": "file", "size": 25 },
    { "path": "/backup/notas-antigas.txt", "name": "notas-antigas.txt", "type": "file" }
  ]
}
```

---

## Formato de resposta

Todas as respostas seguem o mesmo formato:

```
{
  "success": true | false,
  "data":    { ... } | null,
  "error":   null | "mensagem de erro"
}
```

---

## Códigos de erro

Código
Significado

`400`
Requisição inválida — body incorreto, caminho inválido, item já existe, pasta pai não existe

`401`
Token ausente, malformado ou expirado

`404`
Arquivo ou pasta não encontrado

`500`
Erro interno — geralmente falha de comunicação com o Telegram

**Exemplo de erro**

```
{
  "success": false,
  "data":    null,
  "error":   "Pasta pai não existe."
}
```

---

## Como o armazenamento funciona

```
┌─────────────────────────────────────────────────────────┐
│                     Netlify Function                    │
│                                                         │
│  Request  →  initializeFileSystem()                     │
│               └─ getMyDescription()  ←──────────────┐  │
│                   └─ extrai file_id do manifest      │  │
│                       └─ downloadFile(file_id)       │  │
│                           └─ manifest.json em RAM    │  │
│                                                      │  │
│  Operação (criar/deletar/mover)                      │  │
│    └─ modifica manifest em RAM                       │  │
│        └─ sendDocument(manifest.json) → Telegram     │  │
│            └─ obtém novo file_id                     │  │
│                └─ setMyDescription(file_id) ─────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Manifest** — é um JSON que guarda o índice de tudo:

```
{
  "files": {
    "/documentos/notas.txt": {
      "name": "notas.txt", "size": 25,
      "chunks": ["BQACAgIAAxkBAAIB..."]
    }
  },
  "folders": {
    "/documentos": { "name": "documentos" }
  }
}
```

**Arquivos grandes** — divididos em chunks de 50 MB (limite do Telegram). O manifest guarda os `file_id`s de cada chunk; no download eles são concatenados automaticamente.

**Histórico** — cada vez que o manifest é salvo, uma nova mensagem `manifest.json` aparece no chat. Isso é intencional — serve como histórico de versões automático.

**Sem pining necessário** — o `file_id` do manifest atual fica na **descrição do bot** (`/setdescription` no BotFather). Qualquer instância serverless consegue localizar o manifest sem precisar de variáveis de ambiente extras ou permissão de admin.

# Yakult Final

Versao web da rede social Yakult, servida por `Express` e pronta para deploy no `Render` como `Web Service`.

## Requisitos

- Node.js 20 ou superior
- npm

## Estrutura

- `index.html`: interface principal da aplicacao
- `server.js`: servidor HTTP com `Express`
- `static/favicon.ico`: favicon servido em `/favicon.ico`
- `Dockerfile`: imagem pronta para deploy no Render

## Rodando localmente

1. Instale as dependencias:

```bash
npm install
```

2. Inicie o servidor:

```bash
npm start
```

3. Abra no navegador:

```text
http://localhost:10000
```

Se quiser usar outra porta localmente:

```bash
$env:PORT=3000; npm start
```

## Deploy no Render Web Service

### Opcao 1: usando o `Dockerfile` deste projeto

1. Envie o projeto para um repositorio GitHub.
2. No Render, clique em `New +` > `Web Service`.
3. Conecte o repositorio.
4. O Render detectara o `Dockerfile` automaticamente.
5. Finalize a criacao do servico.

Configuracoes importantes:

- Ambiente: `Docker`
- Porta interna do container: o app escuta pela variavel `PORT` fornecida pelo Render
- Health Check Path: `/healthz`

### Opcao 2: sem Docker

Se preferir criar o servico como Node direto no Render, use:

- Build Command: `npm install`
- Start Command: `npm start`

## O que foi ajustado para o Render

- O servidor agora usa `process.env.PORT`
- Os arquivos estaticos sao servidos pela rota `/static`
- O favicon agora responde em `/favicon.ico`
- O `Dockerfile` passou a copiar todo o projeto, incluindo a pasta `static`
- Foi adicionada a rota `/healthz` para verificacao de saude

## Observacao sobre o favicon

O favicon nao aparecia no deploy porque o `Dockerfile` antigo copiava apenas o `index.html` para dentro da imagem. Como `static/favicon.ico` ficava de fora, o navegador nao encontrava o arquivo em producao.

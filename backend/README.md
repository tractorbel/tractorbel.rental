# Backend seguro para gerenciamento de documentos

Este backend fornece um exemplo de como proteger o token GitHub no servidor e permitir alterações seguras em um repositório.

## Por que usar backend/token seguro?

- O token GitHub (`GITHUB_TOKEN`) é mantido apenas no servidor.
- O cliente nunca vê o token diretamente.
- O frontend autentica o usuário com Firebase Auth e envia um ID token ao backend.
- O backend verifica o ID token com Firebase Admin e só então altera o repositório.

## Instalação

1. Entre na pasta do backend:
   ```bash
   cd backend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` baseado em `.env.example` e preencha os valores.

## Configuração do GitHub

- Crie um Personal Access Token no GitHub com escopo `repo`.
- Nunca coloque esse token no frontend.
- Use `GITHUB_TOKEN` apenas no arquivo `.env` do backend.

## Configuração do Firebase

- Crie um service account no Firebase com permissão para verificar tokens.
- Copie `project_id`, `client_email` e `private_key` para o `.env`.
- O backend usa `firebase-admin` para validar se o usuário está autenticado.

## Rotas principais

- `GET /api/manifest` — carrega `documentos.json` do repositório.
- `POST /api/documents` — adiciona novo documento e, opcionalmente, upload de ícone.
- `PUT /api/documents/:id` — atualiza título, notas e substitui arquivo/ícone.
- `DELETE /api/documents/:id` — remove documento e arquivos relacionados.

## Como usar no frontend

1. Faça login no Firebase Auth no frontend.
2. Peça o ID token com `firebase.auth().currentUser.getIdToken()`.
3. Inclua o token no cabeçalho `Authorization: Bearer <TOKEN>` nas requisições para o backend.

Exemplo (fetch):

```js
const idToken = await firebase.auth().currentUser.getIdToken();
const response = await fetch("http://localhost:4000/api/documents", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${idToken}`
  },
  body: formData
});
```

## Segurança

- Armazene o `.env` em um local seguro e não o publique no repositório.
- Adicione `backend/.env` e `node_modules/` ao `.gitignore`.
- Utilize HTTPS em produção.
- Não exponha `GITHUB_TOKEN` no navegador.

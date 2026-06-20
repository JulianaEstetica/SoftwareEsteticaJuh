# Estetica CRM

Sistema web gratuito para gerenciamento inicial de clientes de estetica, feito com HTML, CSS, JavaScript puro e Firebase.

## Arquivos

- `index.html`: telas do sistema.
- `style.css`: layout responsivo e visual.
- `app.js`: regras da aplicacao, CRUD, notificacoes e WhatsApp.
- `firebase-config.js`: configuracao do Firebase.
- `README.md`: instrucoes de configuracao e publicacao.

## Funcionalidades desta primeira versao

- Login e criacao de conta com Firebase Authentication.
- Dados separados por usuario autenticado.
- Dashboard basico.
- Cadastro, listagem, edicao e exclusao de clientes.
- Registro de procedimentos.
- Retorno automatico 30 dias depois quando o procedimento for exatamente `Limpeza de Pele`.
- Notificacoes basicas.
- Botao de WhatsApp usando `https://wa.me/55NUMERO?text=MENSAGEM`.

## Como criar o projeto no Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Clique em `Adicionar projeto`.
3. Crie o projeto e desative Google Analytics se quiser manter simples.
4. No menu `Authentication`, clique em `Primeiros passos`.
5. Ative o provedor `E-mail/senha`.
6. No menu `Firestore Database`, clique em `Criar banco de dados`.
7. Comece em modo de producao e escolha uma regiao.
8. Em `Configuracoes do projeto`, clique no icone da Web `</>`.
9. Registre o app e copie o objeto `firebaseConfig`.
10. Cole os valores no arquivo `firebase-config.js`.

## Regras seguras do Firestore

No Firebase Console, abra `Firestore Database > Regras` e use:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Essas regras fazem cada usuario ler e gravar apenas dentro de `users/{uid}`.

## Como publicar no GitHub Pages

1. Crie um repositorio no GitHub.
2. Envie estes arquivos para a raiz do repositorio.
3. No GitHub, abra `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Salve e aguarde o link do GitHub Pages.

## Observacao importante

Antes de publicar, substitua os valores de exemplo em `firebase-config.js`. Sem isso, login e banco de dados nao funcionam.

## Proximas evolucoes sugeridas

- Indicacoes convertidas.
- Controle de brindes.
- Agenda.
- Aniversariantes do dia, semana e mes.
- Filtros, busca avancada e relatorios.

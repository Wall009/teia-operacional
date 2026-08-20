# Teia Operacional

Kanban HUD (estilo interface Stark) com API própria — pronto pra rodar no EasyPanel e
conversar com o n8n do jeito que você já faz com Notion/WhatsApp.

## Rodar local

```bash
npm install
cp .env.example .env   # edite API_KEY e ALERT_WEBHOOK_URL
npm start
```

Abre em `http://localhost:3000`. Clique no ⚙ no canto superior e configure:
- **API Base URL**: `http://localhost:3000` (ou deixe vazio se front e API forem o mesmo domínio)
- **x-api-key**: a mesma `API_KEY` do `.env`

## Deploy no EasyPanel

1. Suba esta pasta num repositório no seu GitHub (Wall009).
2. No EasyPanel: **Create Service → App → From GitHub**, aponte pro repo.
3. Build: Dockerfile (já incluso, não precisa configurar nada extra).
4. Em **Environment**, defina:
   - `API_KEY` — chave forte, a mesma que o n8n vai usar
   - `ALERT_WEBHOOK_URL` — URL do seu workflow n8n que recebe os alertas
   - `PORT=3000`
5. Em **Volumes**, monte `/app/data` num volume persistente (senão as missões somem a cada deploy).
6. Configure o domínio (ex: `teia.servidorwall.online`) via Cloudflare, igual você já faz com `webhook.` e `evolution.`.

## API — pra usar no n8n

Todas as rotas `/api/*` exigem o header `x-api-key` (a mesma `API_KEY` do `.env`).

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/cards` | lista todas as missões |
| POST | `/api/cards` | cria uma missão |
| POST | `/api/webhook/cards` | alias — pensado pra HTTP Request node do n8n |
| PUT | `/api/cards/:id` | atualiza (ex: mudar status) |
| DELETE | `/api/cards/:id` | remove |
| GET | `/api/health` | healthcheck |

Body esperado (POST/PUT):
```json
{
  "title": "Revisar cooldown do agente comercial",
  "area": "Comercial",
  "prio": "urgente",
  "status": "backlog",
  "prazo": "2026-08-25",
  "notas": "Vendedor Peterson reportou disparo duplicado."
}
```

### Exemplo de HTTP Request node no n8n

- Method: `POST`
- URL: `https://teia.servidorwall.online/api/webhook/cards`
- Headers: `x-api-key: {{sua API_KEY}}`
- Body (JSON): igual ao exemplo acima — pode vir de um trigger do Notion, de uma mensagem
  do WhatsApp Business, ou do seu workflow de captura de atividades (`Vpapws9shgpj67RW`).

### Alertas automáticos de saída

Se `ALERT_WEBHOOK_URL` estiver definida, o servidor dispara um `POST` automático pra ela quando:
- uma missão é criada com `prio: "urgente"`
- uma missão muda para `status: "travado"`
- uma missão existente muda pra `prio: "urgente"`

Payload enviado:
```json
{ "event": "missao.urgente.criada", "card": { ... }, "timestamp": "..." }
```

Do lado do n8n, é só um Webhook trigger que recebe isso e manda pro grupo/número certo via
Evolution API — mesmo padrão que você já usa no sistema de aprovação de compras.

## Dados

As missões ficam em `data/cards.json` dentro do container. Sem banco externo — se quiser
migrar pro Postgres que você já usa (`1HWY786DTOHGumta`), é só trocar as funções
`readCards`/`writeCards` do `server.js` por queries; o resto do app não muda.

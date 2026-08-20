require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- persistencia (arquivo JSON, simples e robusto p/ uso pessoal) ----------
const defaultCards = [
  { id: 'c1', title: 'Efeito scene-scrubber no portfolio', area: 'Pessoal', prio: 'baixa', status: 'backlog', prazo: '', notas: 'Aguardando envio dos arquivos do site.' },
  { id: 'c2', title: 'Curso FrotaZap - modulo 3', area: 'Pessoal', prio: 'baixa', status: 'backlog', prazo: '', notas: 'SaaS multicompany ficticio para estudo.' },
  { id: 'c3', title: 'Relatorios de telemetria de frota (Chiptronic)', area: 'Frota', prio: 'medio', status: 'fazendo', prazo: '', notas: 'Iterando HTML interativo para diretoria.' },
  { id: 'c4', title: 'Sistema de atividades diarias (Notion)', area: 'Automacao', prio: 'medio', status: 'fazendo', prazo: '', notas: 'Lembrete 08:30 + captura via WhatsApp com GPT.' },
  { id: 'c5', title: 'Prospeccao B2B - aquecimento WhatsApp', area: 'Comercial', prio: 'urgente', status: 'travado', prazo: '', notas: 'Numeros restritos por spam. Warm-up gradual em andamento.' },
  { id: 'c6', title: 'Canal de e-mail B2B bloqueado', area: 'Infra', prio: 'urgente', status: 'travado', prazo: '', notas: 'Politica do tenant Azure travando client secret.' },
  { id: 'c7', title: 'SharePoint - organizador automatico', area: 'Automacao', prio: 'baixa', status: 'entregue', prazo: '', notas: 'Roteamento por prefixo em producao.' },
  { id: 'c8', title: 'Aprovacao de compras via WhatsApp', area: 'Automacao', prio: 'baixa', status: 'entregue', prazo: '', notas: '5 workflows em producao.' },
  { id: 'c9', title: 'Agente comercial WhatsApp (producao)', area: 'Comercial', prio: 'baixa', status: 'entregue', prazo: '', notas: '10 categorias de alerta, base de 1161 clientes.' },
  { id: 'c10', title: 'Dashboard de controle de ativos', area: 'Infra', prio: 'baixa', status: 'entregue', prazo: '', notas: '108 ativos, QR code embutido.' },
  { id: 'c11', title: 'Livro "O Apocalipse e Agora!"', area: 'Pessoal', prio: 'baixa', status: 'entregue', prazo: '', notas: '18 capitulos, padrao Amazon KDP.' },
  { id: 'c12', title: 'Alertas de multas de frota', area: 'Frota', prio: 'baixa', status: 'entregue', prazo: '', notas: 'Infosimples DETRAN/DER-SP, piloto ativo.' },
];

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultCards, null, 2));
}
function readCards() {
  ensureStore();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return []; }
}
function writeCards(cards) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2));
}

// ---------- auth simples por chave de API (usada pelo n8n e pelo front) ----------
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // sem API_KEY configurada = aberto (defina em producao!)
  const sent = req.header('x-api-key');
  if (sent && sent === API_KEY) return next();
  return res.status(401).json({ error: 'x-api-key invalido ou ausente' });
}

// ---------- alerta de saida (dispara pro seu webhook n8n, ex: WhatsApp) ----------
async function maybeSendAlert(card, event) {
  if (!ALERT_WEBHOOK_URL) return;
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, card, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('Falha ao enviar alerta para ALERT_WEBHOOK_URL:', err.message);
  }
}

// ---------- rotas ----------
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/cards', requireApiKey, (req, res) => {
  res.json(readCards());
});

app.post('/api/cards', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'title e obrigatorio' });
  const card = {
    id: 'c' + crypto.randomBytes(5).toString('hex'),
    title: String(b.title).trim(),
    area: b.area || 'Automacao',
    prio: ['urgente', 'medio', 'baixa'].includes(b.prio) ? b.prio : 'medio',
    status: ['backlog', 'fazendo', 'travado', 'entregue'].includes(b.status) ? b.status : 'backlog',
    prazo: b.prazo || '',
    notas: b.notas || '',
  };
  const cards = readCards();
  cards.push(card);
  writeCards(cards);
  if (card.prio === 'urgente') await maybeSendAlert(card, 'missao.urgente.criada');
  res.status(201).json(card);
});

// alias pensado para automacoes n8n (Notion, WhatsApp intake, etc) - mesmo contrato do POST /api/cards
app.post('/api/webhook/cards', requireApiKey, async (req, res) => {
  req.url = '/api/cards';
  app._router.handle(req, res);
});

app.put('/api/cards/:id', requireApiKey, async (req, res) => {
  const cards = readCards();
  const idx = cards.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'missao nao encontrada' });
  const before = cards[idx];
  const updated = { ...before, ...req.body, id: before.id };
  cards[idx] = updated;
  writeCards(cards);
  if (before.status !== updated.status && updated.status === 'travado') {
    await maybeSendAlert(updated, 'missao.travada');
  }
  if (before.prio !== 'urgente' && updated.prio === 'urgente') {
    await maybeSendAlert(updated, 'missao.urgente.atualizada');
  }
  res.json(updated);
});

app.delete('/api/cards/:id', requireApiKey, (req, res) => {
  const cards = readCards();
  const next = cards.filter(c => c.id !== req.params.id);
  if (next.length === cards.length) return res.status(404).json({ error: 'missao nao encontrada' });
  writeCards(next);
  res.status(204).end();
});

app.listen(PORT, () => {
  ensureStore();
  console.log(`Teia Operacional rodando na porta ${PORT}`);
  if (!API_KEY) console.warn('AVISO: API_KEY nao definida - as rotas /api estao abertas.');
  if (!ALERT_WEBHOOK_URL) console.warn('AVISO: ALERT_WEBHOOK_URL nao definida - alertas de saida desativados.');
});

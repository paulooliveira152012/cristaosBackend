// =============================================
// server/routes/suggestions.js  (Express Router)
// =============================================
// ROTAS
//   GET    /api/suggestions
//   POST   /api/suggestions
//   PATCH  /api/suggestions/:id/status
//   POST   /api/suggestions/:id/vote
//   GET    /api/suggestions/roadmap
//   PUT    /api/suggestions/roadmap
// ---------------------------------------------
// COMO PLUGAR NO APP
//   const suggestionsRouter = require('./routes/suggestions');
//   app.use('/api/suggestions', suggestionsRouter);

const express = require('express');
const router = express.Router();
const { protect } = require("../utils/auth")

// importe os MODELS/CONSTANTES separados
const { Suggestion, VALID_TYPES, VALID_STATUS, VALID_SEVERITY } = require('../models/Suggestions');
const Roadmap = require('../models/Roadmap');

// ================= helpers =================


// ============== routes ==============
// GET /api/suggestions  (listagem com filtros + sort)
router.get('/', async (req, res) => {
  try {
    const { q = '', type = 'all', status = 'all', sort = 'recent', limit = 200, page = 1 } = req.query;

    const filter = {};
    if (type !== 'all' && VALID_TYPES.includes(type)) filter.type = type;
    if (status !== 'all' && VALID_STATUS.includes(status)) filter.status = status;

    const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
    const skip = Math.max(0, (parseInt(page, 10) - 1) * lim);

    // busca textual simples
    const find = { ...filter };
    if (q && String(q).trim()) {
      const rx = new RegExp(sanitizeString(q), 'i');
      find.$or = [{ title: rx }, { description: rx }, { 'author.name': rx }];
    }

    let items = await Suggestion.find(find)
      .sort(sort === 'recent' ? { createdAt: -1 } : { createdAt: -1 })
      .limit(lim)
      .skip(skip)
      .lean({ virtuals: true });

    items = items.map((d) => ({ ...d, votes: Array.isArray(d.voters) ? d.voters.length : 0 }));
    if (sort === 'popular') {
      items.sort((a, b) => (b.votes || 0) - (a.votes || 0) || new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json(items);
  } catch (e) {
    console.error('GET /api/suggestions error', e);
    res.status(500).json({ error: 'Falha ao listar sugestões' });
  }
});


// POST /api/suggestions (criar)
// POST /api/suggestions (criar)
// POST /api/suggestions (criar)
router.post('/', protect, async (req, res) => {
  try {
    // ❱❱ pegue o body direto (não desestrutura "payload")
    const { type, title, description, severity, suggestion, currentUser } = req.body;

    // ❱❱ pegue user do middleware ou (fallback) do body
    const user =
      req.currentUser ||
      req.user ||
      currentUser || // fallback se você já mandar o user no body
      null;

    // ❱❱ Se veio só "suggestion", crie defaults
    const finalType = type || 'ideia';
    const finalTitle = title || (suggestion ? String(suggestion).slice(0, 80) : '');
    const finalDesc = description || (suggestion ? String(suggestion) : '');

    // validações
    if (!finalTitle || !finalDesc) {
      return res.status(400).json({ error: 'Título e descrição são obrigatórios' });
    }

    // (opcional) validar enums do seu model
    // const { VALID_TYPES, VALID_SEVERITY } = require('../models/suggestion.model');
    // if (!VALID_TYPES.includes(finalType)) return res.status(400).json({ error: 'Tipo inválido' });
    // if (finalType === 'bug' && severity && !VALID_SEVERITY.includes(severity)) {
    //   return res.status(400).json({ error: 'Severidade inválida' });
    // }

    const doc = await Suggestion.create({
      type: finalType,
      title: finalTitle.trim(),
      description: finalDesc.trim(),
      severity: finalType === 'bug' ? (severity || 'médio') : undefined,
      status: 'pendente',
      author: user
        ? { _id: user._id, name: user.name || user.username || user.firstName || 'Usuário' }
        : undefined,
    });
    console.log("done")
    return res.status(201).json(doc.toJSON());
  } catch (e) {
    console.error('POST /api/suggestions error', e);
    return res.status(500).json({ error: 'Falha ao criar sugestão' });
  }
});



// PATCH /api/suggestions/:id/status (somente líder)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    const updated = await Suggestion.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    if (!updated) return res.status(404).json({ error: 'Item não encontrado' });

    updated.votes = Array.isArray(updated.voters) ? updated.voters.length : 0;
    res.json(updated);
  } catch (e) {
    console.error('PATCH /api/suggestions/:id/status error', e);
    res.status(500).json({ error: 'Falha ao atualizar status' });
  }
});

// POST /api/suggestions/:id/vote (idempotente)
router.post('/:id/vote', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.currentUser;

    const updated = await Suggestion.findOneAndUpdate(
      { _id: id, voters: { $ne: user._id } },
      { $addToSet: { voters: user._id } },
      { new: true }
    ).lean({ virtuals: true });

    const doc = updated || (await Suggestion.findById(id).lean({ virtuals: true }));
    if (!doc) return res.status(404).json({ error: 'Item não encontrado' });

    doc.votes = Array.isArray(doc.voters) ? doc.voters.length : 0;
    res.json(doc);
  } catch (e) {
    console.error('POST /api/suggestions/:id/vote error', e);
    res.status(500).json({ error: 'Falha ao registrar voto' });
  }
});

// GET /api/suggestions/roadmap
router.get('/roadmap', async (_req, res) => {
  try {
    let doc = await Roadmap.findOne().lean();
    if (!doc) doc = (await Roadmap.create({ notes: '' })).toJSON();
    res.json({ notes: doc.notes || '' });
  } catch (e) {
    console.error('GET /api/suggestions/roadmap error', e);
    res.status(500).json({ error: 'Falha ao carregar notas' });
  }
});

// PUT /api/suggestions/roadmap (líder)
router.put('/roadmap', async (req, res) => {
  try {
    const user = req.currentUser;
    const { notes = '' } = req.body || {};

    const doc = await Roadmap.findOneAndUpdate(
      {},
      { $set: { notes: String(notes), updatedBy: { _id: user._id, name: user.name || user.username } } },
      { new: true, upsert: true }
    ).lean();

    res.json({ notes: doc.notes || '' });
  } catch (e) {
    console.error('PUT /api/suggestions/roadmap error', e);
    res.status(500).json({ error: 'Falha ao salvar notas' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  console.log("deleting suggestion")

  const { id } = req.params;
   const user = req.currentUser || req.user || (req.session && req.session.user);

  if (!id || ! user) {
    console.log("missing suggestion id or user...")
    return
  }

  try {
    const suggestion = await Suggestion.findByIdAndDelete(id)
    
    if (!suggestion) {
      console.log("suggestion not found")
      return res.status(404).json({ error: "suggestion not found" });
    }
    // se deu certo
    console.log("Deleted successfully")
    res.json({ message: "suggestion deleted" })
  } catch (err) {
    console.log("error deleting suggestion:", err)
    res.status(500).json({ error: "Failed to delete suggestion" })
  }
})

module.exports = router;

const express = require("express");
const router = express.Router();
// const Study = require("../models/BibleStudy");
const BibleStudy = require("../models/BibleStudy")
const ThemeStudy = require("../models/ThemeStudy")
const { protect } = require("../utils/auth");
const { verifyLeader } = require("../utils/auth");
const { THEME_ENUM } = require("../models/ThemeStudy")

// ===================================== By bible chapter=====================================

/** Mapa: slug do livro -> número de capítulos */
const CHAPTERS_BY_BOOK = {
  // AT
  genesis: 50,
  exodo: 40,
  levitico: 27,
  numeros: 36,
  deuteronomio: 34,
  josue: 24,
  juizes: 21,
  rute: 4,
  "1samuel": 31,
  "2samuel": 24,
  "1reis": 22,
  "2reis": 25,
  "1cronicas": 29,
  "2cronicas": 36,
  esdras: 10,
  neemias: 13,
  ester: 10,
  jo: 42,
  salmos: 150,
  proverbios: 31,
  eclesiastes: 12,
  canticos: 8,
  isaias: 66,
  jeremias: 52,
  lamentacoes: 5,
  ezequiel: 48,
  daniel: 12,
  oseias: 14,
  joel: 3,
  amos: 9,
  obadias: 1,
  jonas: 4,
  miqueias: 7,
  naum: 3,
  habacuque: 3,
  sofonias: 3,
  ageu: 2,
  zacarias: 14,
  malaquias: 4,
  // NT
  mateus: 28,
  marcos: 16,
  lucas: 24,
  joao: 21,
  atos: 28,
  romanos: 16,
  "1corintios": 16,
  "2corintios": 13,
  galatas: 6,
  efesios: 6,
  filipenses: 4,
  colossenses: 4,
  "1tessalonicenses": 5,
  "2tessalonicenses": 3,
  "1timoteo": 6,
  "2timoteo": 4,
  tito: 3,
  filemom: 1,
  hebreus: 13,
  tiago: 5,
  "1pedro": 5,
  "2pedro": 3,
  "1joao": 5,
  "2joao": 1,
  "3joao": 1,
  judas: 1,
  apocalipse: 22,
};

/**
 * GET /api/studies/:bookId/chapters
 * -> { ok:true, items:[{chapter,hasStudy}], total }
 */
router.get("/:bookId/chapters", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim().toLowerCase();
    const total = CHAPTERS_BY_BOOK[bookId];
    if (!total) {
      return res.status(400).json({ ok:false, message:"Livro inválido/desconhecido." });
    }

    // apenas estudos públicos publicados
    const rows = await BibleStudy.find(
      { bookId, status: "published", visibility: "public" },
      { chapter: 1, _id: 0 }
    ).lean();

    const set = new Set(rows.map(r => Number(r.chapter)));
    const items = Array.from({ length: total }, (_, i) => {
      const ch = i + 1;
      return { chapter: ch, hasStudy: set.has(ch) };
    });

    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok:true, items, total });
  } catch (err) {
    console.error("GET /:bookId/chapters error:", err);
    return res.status(500).json({ ok:false, message:"Erro ao listar capítulos." });
  }
});


/**
 * GET /api/studies/:bookId/:chapter
 * -> { ok:true, item }  (404 se não existir)
 *
 * Se houver vários estudos, retorna o mais recente publicado;
 * se não houver publicado, retorna o mais recente de qualquer status.
 */
// routes/studies.js
router.get("/:bookId/:chapter", async (req, res) => {
  try {
    const bookId = String(req.params.bookId || "").trim().toLowerCase();
    const chapterNum = Number(req.params.chapter);
    if (!bookId || !Number.isInteger(chapterNum) || chapterNum < 1) {
      return res.status(400).json({ ok:false, message:"Parâmetros inválidos." });
    }

    const user = req.user; // pode ser undefined em rota pública
    const isLeader = !!(user?.leader || user?.role === "leader");
    const requestedAuthor = req.query.author;
    const mine = req.query.mine === "1";

    let query = { bookId, chapter: chapterNum };

    if (user && mine) {
      query.author = user._id;
    } else if (user && isLeader && requestedAuthor) {
      query.author = requestedAuthor;
    } else {
      // visitante: só conteúdo público publicado
      query.status = "published";
      query.visibility = "public";
    }

    const doc = await BibleStudy.findOne(query)
      .sort({ updatedAt: -1, _id: -1 })
      .populate({ path: "author", select: "username profileImage" });

    if (!doc) return res.status(404).json({ ok:false, message:"Estudo não encontrado." });

    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok:true, item: doc });
  } catch (e) {
    console.error("GET /:bookId/:chapter error:", e);
    return res.status(500).json({ ok:false, message:"Erro ao carregar estudo." });
  }
});


/**
 * POST /api/studies
 * body: { bookId, chapter, title?, summary?, content, status? }
 * Upsert por (bookId, chapter): cria se não existir, senão atualiza o mais recente.
 */
router.post("/", protect, verifyLeader, async (req, res) => {
  console.log("listando novo estudo...");
  try {
    const { bookId, chapter, title, summary, content, status, author } =
      req.body || {};
    const book = String(bookId || "")
      .trim()
      .toLowerCase();
    const ch = parseInt(chapter, 10);

    if (!CHAPTERS_BY_BOOK[book]) {
      return res.status(400).json({ ok: false, message: "bookId inválido." });
    }
    if (!Number.isInteger(ch) || ch < 1 || ch > CHAPTERS_BY_BOOK[book]) {
      return res.status(400).json({ ok: false, message: "chapter inválido." });
    }
    if (!content || !String(content).trim()) {
      return res
        .status(400)
        .json({ ok: false, message: "content é obrigatório." });
    }

    const desiredStatus =
      status && ["draft", "published", "archived"].includes(status)
        ? status
        : "published";

    // pega o mais recente desse capítulo (se existir) para atualizar
    const existing = await BibleStudy.findOne({ book, chapter: ch }).sort({
      createdAt: -1,
    });

    if (!existing) {
      const created = await BibleStudy.create({
        book,
        bookId,
        chapter: ch,
        title: title?.trim(),
        summary: summary?.trim(),
        content,
        author,
        status: desiredStatus,
        createdBy: req.user._id,
      });
      return res.status(201).json({ ok: true, item: created });
    }

    existing.title = title?.trim() ?? existing.title;
    existing.summary = summary?.trim() ?? existing.summary;
    existing.content = content ?? existing.content;
    existing.status = desiredStatus ?? existing.status;
    await existing.save();

    return res.json({ ok: true, item: existing });
  } catch (err) {
    console.error("POST /studies error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Erro ao salvar estudo." });
  }
});

/**
 * DELETE /api/studies/:id
 */
router.delete("/:id", protect, verifyLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const gone = await BibleStudy.findByIdAndDelete(id);
    if (!gone)
      return res
        .status(404)
        .json({ ok: false, message: "Estudo não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /studies/:id error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Erro ao excluir estudo." });
  }
});

// atualizar
// api/studies/
router.put("/:bookId/:chapter", protect, async (req, res) => {
  console.log("atualização de capítulo...");

  try {
    const rawBookId = String(req.params.bookId || "").trim();
    console.log("rawBookId:", rawBookId);
    const bookId = rawBookId.toLowerCase(); // se o schema pede slug minúsculo
    console.log("bookId:", bookId);
    const chapterNum = Number(req.params.chapter);
    console.log("chapterNum:", chapterNum);

    if (!bookId || !Number.isInteger(chapterNum) || chapterNum < 1) {
      console.log(
        "faltando id do livro, ou chapterNum nao e um numero ou chapterNum é menor que 1"
      );
      return res
        .status(400)
        .json({ ok: false, message: "Parâmetros inválidos." });
    }

    // Segurança: use apenas req.user._id (cookies/sessão). Evite aceitar author do body.
    const authorId = req.user?._id;
    console.log("authorId:", authorId);
    if (!authorId) {
      return res
        .status(401)
        .json({ ok: false, message: "Autor obrigatório. Faça login." });
    }

    const { title, content } = req.body;
    console.log("title:", title, "content:", content);

    if (!title?.trim() || !content?.trim()) {
      return res
        .status(400)
        .json({ ok: false, message: "Título e conteúdo são obrigatórios." });
    }

    console.log("informacoe ok, prosseguindo...");

    const query = { bookId, chapter: chapterNum, author: authorId };
    console.log("query:", query);

    const result = await BibleStudy.findOneAndUpdate(
      query,
      {
        $set: { title: title.trim(), content: content.trim() },
        $setOnInsert: {
          status: "published",
          visibility: "public",
          author: authorId,
        },
      },
      {
        new: true, // retorna o doc após a atualização
        upsert: true, // cria se não existir
        setDefaultsOnInsert: true,
        runValidators: true,
        context: "query",
        rawResult: true,
      }
    );

    const raw = result; // o que você já recebeu do findOneAndUpdate

    // Compatível com ambos os formatos (rawResult ou doc direto)
    const last = raw?.lastErrorObject;
    let doc = raw?.value || raw;
    const created = last ? !last.updatedExisting : false;

    if (!doc && last?.upserted) {
      doc = await BibleStudy.findById(last.upserted);
    }
    if (!doc) {
      return res
        .status(500)
        .json({ ok: false, message: "Falha ao obter o estudo salvo." });
    }

    await doc.populate({ path: "author", select: "username profileImage" });

    console.log("Atualizado!", { id: doc._id?.toString?.(), created });
    return res.status(created ? 201 : 200).json({ ok: true, item: doc });
  } catch (err) {
    console.error("PUT /studies error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Erro ao salvar estudo." });
  }
});


// ===================================== By theme =====================================

// helpers
const clampInt = (v, d = 1) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const pick = (obj, keys) =>
  keys.reduce((acc, k) => (obj[k] !== undefined ? (acc[k] = obj[k], acc) : acc), {});

// ===============================
// PUBLIC: LISTA APROVADOS (com filtros)
// GET /api/theme-studies?theme=theology&q=cruz&page=1&limit=10&sort=new
// ===============================
router.get("/themeStudy", async (req, res) => {
  try {
    const { theme, q, page = "1", limit = "10", sort = "new" } = req.query;

    const filter = { status: "approved" };
    if (theme) {
      const themeSlug = String(theme).trim().toLowerCase();
      if (!THEME_ENUM.includes(themeSlug)) {
        return res.status(400).json({ ok: false, message: "Tema inválido." });
      }
      filter.theme = themeSlug;
    }
    if (q && String(q).trim()) {
      filter.$text = { $search: String(q).trim() };
    }

    const pg = Math.max(1, clampInt(page, 1));
    const lim = Math.min(50, Math.max(1, clampInt(limit, 10)));

    const sortMap = {
      new: { publishedAt: -1, createdAt: -1, _id: -1 },
      old: { publishedAt: 1, createdAt: 1, _id: 1 },
    };
    const sortBy = sortMap[sort] || sortMap.new;

    const [items, total] = await Promise.all([
      ThemeStudy.find(filter)
        .sort(sortBy)
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate({ path: "author", select: "username profileImage" })
        .exec(),
      ThemeStudy.countDocuments(filter),
    ]);

    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, items, total, page: pg, pageSize: items.length });
  } catch (err) {
    console.error("GET /api/theme-studies error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar estudos por tema." });
  }
});

// ===============================
// PUBLIC: OBTÉM 1 APROVADO POR ID
// GET /api/theme-studies/:id
// ===============================
router.get("/themeStudy/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ThemeStudy.findById(id)
      .populate({ path: "author", select: "username profileImage" });
    if (!doc) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });

    if (doc.status !== "approved") {
      // público só vê aprovados
      return res.status(404).json({ ok: false, message: "Estudo não aprovado." });
    }
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, item: doc });
  } catch (err) {
    console.error("GET /api/theme-studies/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao carregar estudo." });
  }
});

// ===============================
// PROTECTED: CRIAR (member envia para aprovação)
// POST /api/theme-studies
// body: { title, theme, content, image? }
// ===============================
router.post("/themeStudy", protect, async (req, res) => {
  try {
    const { title, theme, content, image } = req.body || {};
    const themeSlug = String(theme || "").trim().toLowerCase();

    if (!title?.trim()) return res.status(400).json({ ok: false, message: "title é obrigatório." });
    if (!content?.trim()) return res.status(400).json({ ok: false, message: "content é obrigatório." });
    if (!THEME_ENUM.includes(themeSlug)) {
      return res.status(400).json({ ok: false, message: "theme inválido." });
    }

    const payload = {
      author: req.user._id,
      title: title.trim(),
      theme: themeSlug,
      content: content.trim(),
      status: "pending",
    };
    if (image?.url) {
      payload.image = {
        url: String(image.url).trim(),
        alt: (image.alt && String(image.alt).trim()) || undefined,
      };
    }

    const created = await ThemeStudy.create(payload);
    const out = await created.populate({ path: "author", select: "username profileImage" });
    return res.status(201).json({ ok: true, item: out });
  } catch (err) {
    console.error("POST /api/theme-studies error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao criar estudo temático." });
  }
});

// ===============================
// PROTECTED: LISTA “MEUS” ESTUDOS (qualquer status)
// GET /api/theme-studies/mine?status=pending|approved|rejected&theme=&q=&page=&limit=
// ===============================
router.get("/themeStudy/mine/list", protect, async (req, res) => {
  try {
    const { status, theme, q, page = "1", limit = "10" } = req.query;
    const filter = { author: req.user._id };
    if (status && ["pending", "approved", "rejected"].includes(status)) filter.status = status;
    if (theme) {
      const themeSlug = String(theme).trim().toLowerCase();
      if (!THEME_ENUM.includes(themeSlug)) return res.status(400).json({ ok: false, message: "Tema inválido." });
      filter.theme = themeSlug;
    }
    if (q && String(q).trim()) filter.$text = { $search: String(q).trim() };

    const pg = Math.max(1, clampInt(page, 1));
    const lim = Math.min(50, Math.max(1, clampInt(limit, 10)));

    const [items, total] = await Promise.all([
      ThemeStudy.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate({ path: "author", select: "username profileImage" })
        .exec(),
      ThemeStudy.countDocuments(filter),
    ]);

    return res.json({ ok: true, items, total, page: pg, pageSize: items.length });
  } catch (err) {
    console.error("GET /api/theme-studies/mine error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar seus estudos." });
  }
});

// ===============================
// PROTECTED + LEADER: MODERAÇÃO
// GET /api/theme-studies/mod?status=pending&theme=&q=&page=&limit=
// ===============================
router.get("/themeStudy/mod/list", protect, verifyLeader, async (req, res) => {
  try {
    const { status = "pending", theme, q, page = "1", limit = "10" } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) filter.status = status;
    if (theme) {
      const themeSlug = String(theme).trim().toLowerCase();
      if (!THEME_ENUM.includes(themeSlug)) return res.status(400).json({ ok: false, message: "Tema inválido." });
      filter.theme = themeSlug;
    }
    if (q && String(q).trim()) filter.$text = { $search: String(q).trim() };

    const pg = Math.max(1, clampInt(page, 1));
    const lim = Math.min(50, Math.max(1, clampInt(limit, 10)));

    const [items, total] = await Promise.all([
      ThemeStudy.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate({ path: "author", select: "username profileImage" })
        .exec(),
      ThemeStudy.countDocuments(filter),
    ]);

    return res.json({ ok: true, items, total, page: pg, pageSize: items.length });
  } catch (err) {
    console.error("GET /api/theme-studies/mod error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar para moderação." });
  }
});

// ===============================
// PROTECTED: EDITAR (autor) — volta para pending se estava approved
// PUT /api/theme-studies/:id
// body: { title?, theme?, content?, image? }
// ===============================
router.put("/themeStudy/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ThemeStudy.findById(id);
    if (!doc) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });

    const isLeader = !!(req.user?.leader || req.user?.role === "leader");
    const isOwner = String(doc.author) === String(req.user._id);
    if (!isOwner && !isLeader) {
      return res.status(403).json({ ok: false, message: "Sem permissão para editar." });
    }

    const allowed = pick(req.body || {}, ["title", "theme", "content", "image"]);
    if (allowed.title) doc.title = String(allowed.title).trim();
    if (allowed.theme) {
      const themeSlug = String(allowed.theme).trim().toLowerCase();
      if (!THEME_ENUM.includes(themeSlug)) return res.status(400).json({ ok: false, message: "Tema inválido." });
      doc.theme = themeSlug;
    }
    if (allowed.content) doc.content = String(allowed.content).trim();
    if (allowed.image) {
      const img = allowed.image || {};
      doc.image = img?.url ? { url: String(img.url).trim(), alt: img.alt ? String(img.alt).trim() : undefined } : undefined;
    }

    // Se autor (não-líder) editar um aprovado, volta pra pending
    if (!isLeader && doc.status === "approved") {
      doc.status = "pending";
      doc.approvedBy = undefined;
      doc.approvedAt = undefined;
      doc.publishedAt = undefined;
      doc.rejectionReason = undefined;
    }

    await doc.save();
    const out = await doc.populate({ path: "author", select: "username profileImage" });
    return res.json({ ok: true, item: out });
  } catch (err) {
    console.error("PUT /api/theme-studies/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar estudo." });
  }
});

// ===============================
// PROTECTED + LEADER: APROVAR
// PUT /api/theme-studies/:id/approve
// body (opcional): { publishedAt }
// ===============================
router.put("/themeStudy/:id/approve", protect, verifyLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ThemeStudy.findById(id);
    if (!doc) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });

    doc.status = "approved";
    doc.approvedBy = req.user._id;
    doc.approvedAt = new Date();
    doc.publishedAt = req.body?.publishedAt ? new Date(req.body.publishedAt) : (doc.publishedAt || new Date());
    doc.rejectionReason = undefined;

    await doc.save();
    const out = await doc.populate({ path: "author", select: "username profileImage" });
    return res.json({ ok: true, item: out });
  } catch (err) {
    console.error("PUT /api/theme-studies/:id/approve error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao aprovar estudo." });
  }
});

// ===============================
// PROTECTED + LEADER: REJEITAR
// PUT /api/theme-studies/:id/reject
// body: { reason? }
// ===============================
router.put("/themeStudy/:id/reject", protect, verifyLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const doc = await ThemeStudy.findById(id);
    if (!doc) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });

    doc.status = "rejected";
    doc.rejectionReason = (reason && String(reason).trim()) || "Rejeitado sem justificativa detalhada.";
    doc.approvedBy = undefined;
    doc.approvedAt = undefined;
    doc.publishedAt = undefined;

    await doc.save();
    const out = await doc.populate({ path: "author", select: "username profileImage" });
    return res.json({ ok: true, item: out });
  } catch (err) {
    console.error("PUT /api/theme-studies/:id/reject error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao rejeitar estudo." });
  }
});

// ===============================
// PROTECTED: EXCLUIR (autor ou líder)
// DELETE /api/theme-studies/:id
// ===============================
router.delete("/themeStudy/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ThemeStudy.findById(id);
    if (!doc) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });

    const isLeader = !!(req.user?.leader || req.user?.role === "leader");
    const isOwner = String(doc.author) === String(req.user._id);
    if (!isOwner && !isLeader) {
      return res.status(403).json({ ok: false, message: "Sem permissão para excluir." });
    }

    await doc.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/theme-studies/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao excluir estudo." });
  }
});

// ===============================
// PUBLIC: LISTAR ESTUDOS APROVADOS (com filtros)
// GET /api/studies/themeStudy/public/list?theme=&q=&page=&limit=&sort=new|old
// ===============================
// GET /api/studies/themeStudy/public/list
router.get("/themeStudy/public/list", async (req, res) => {
  try {
    const { theme, q, page = "1", limit = "10", sort = "new" } = req.query;

    const filter = { status: "approved" };

    if (theme) {
      const themeSlug = String(theme).trim().toLowerCase();
      if (!THEME_ENUM.includes(themeSlug)) {
        return res.status(400).json({ ok: false, message: "Tema inválido." });
      }
      filter.theme = themeSlug;
    }

    // 🔧 Troca $text por regex (substring, case-insensitive)
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");
      // só título:
      // filter.title = rx;
      // título OU conteúdo:
      filter.$or = [{ title: rx }, { content: rx }];
    }

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const sortMap = {
      new: { publishedAt: -1, createdAt: -1, _id: -1 },
      old: { publishedAt: 1, createdAt: 1, _id: 1 },
    };
    const sortBy = sortMap[sort] || sortMap.new;

    const [items, total] = await Promise.all([
      ThemeStudy.find(filter)
        .sort(sortBy)
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate({ path: "author", select: "username profileImage" })
        .lean()
        .exec(),
      ThemeStudy.countDocuments(filter),
    ]);

    return res.json({ ok: true, items, total, page: pg, pageSize: items.length });
  } catch (err) {
    console.error("GET /api/studies/themeStudy/public/list error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar estudos por tema." });
  }
});


/**
 * GET /api/studies/theme-studies/:id
 * Retorna um estudo temático público (aprovado) por ID.
 */
// rota simples, sem regex, sem nada extra
router.get("/themeStudy/id/:id", async (req, res) => {
  console.log("✅ buscando estudo individual (by-id)...", req.params);
  try {
    const { id } = req.params;

    const item = await ThemeStudy.findOne({ _id: id, status: "approved" })
      .populate({ path: "author", select: "username profileImage" })
      .lean();

    if (!item) {
      return res.status(404).json({ ok: false, message: "Estudo não encontrado." });
    }

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("GET /api/studies/themeStudy/id/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao buscar estudo." });
  }
});




module.exports = router;

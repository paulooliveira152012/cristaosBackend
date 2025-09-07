const express = require("express");
const router = express.Router();
const Study = require("../models/Study");
const { protect } = require("../utils/auth");
const { verifyLeader } = require("../utils/auth")

/** Mapa: slug do livro -> número de capítulos */
const CHAPTERS_BY_BOOK = {
  // AT
  genesis: 50, exodo: 40, levitico: 27, numeros: 36, deuteronomio: 34,
  josue: 24, juizes: 21, rute: 4,
  "1samuel": 31, "2samuel": 24, "1reis": 22, "2reis": 25,
  "1cronicas": 29, "2cronicas": 36,
  esdras: 10, neemias: 13, ester: 10, jo: 42, salmos: 150,
  proverbios: 31, eclesiastes: 12, canticos: 8,
  isaias: 66, jeremias: 52, lamentacoes: 5, ezequiel: 48, daniel: 12,
  oseias: 14, joel: 3, amos: 9, obadias: 1, jonas: 4, miqueias: 7,
  naum: 3, habacuque: 3, sofonias: 3, ageu: 2, zacarias: 14, malaquias: 4,
  // NT
  mateus: 28, marcos: 16, lucas: 24, joao: 21, atos: 28,
  romanos: 16, "1corintios": 16, "2corintios": 13,
  galatas: 6, efesios: 6, filipenses: 4, colossenses: 4,
  "1tessalonicenses": 5, "2tessalonicenses": 3,
  "1timoteo": 6, "2timoteo": 4, tito: 3, filemom: 1,
  hebreus: 13, tiago: 5,
  "1pedro": 5, "2pedro": 3,
  "1joao": 5, "2joao": 1, "3joao": 1, judas: 1,
  apocalipse: 22,
};

/**
 * GET /api/studies/:bookId/chapters
 * -> { ok:true, items:[{chapter,hasStudy}], total }
 */
router.get("/:bookId/chapters", async (req, res) => {
  console.log("rota de busacar todos os capitulos")
  try {
    const book = String(req.params.bookId || "").trim().toLowerCase();
    const total = CHAPTERS_BY_BOOK[book];
    if (!total) {
      return res.status(400).json({ ok: false, message: "Livro inválido/desconhecido." });
    }

    const rows = await Study.find({ book }, { chapter: 1, status: 1 }).lean();
    const set = new Set(rows.map(r => Number(r.chapter)));

    const items = Array.from({ length: total }, (_, i) => {
      const ch = i + 1;
      return { chapter: ch, hasStudy: set.has(ch) };
    });

    return res.json({ ok: true, items, total });
  } catch (err) {
    console.error("GET /studies/:bookId/chapters error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar capítulos." });
  }
});

/**
 * GET /api/studies/:bookId/:chapter
 * -> { ok:true, item }  (404 se não existir)
 *
 * Se houver vários estudos, retorna o mais recente publicado;
 * se não houver publicado, retorna o mais recente de qualquer status.
 */
router.get("/:bookId/:chapter", async (req, res) => {
    console.log("✅ rota para buscar capitulo")
  try {
    const book = String(req.params.bookId || "").trim().toLowerCase();

    const chapter = parseInt(req.params.chapter, 10);
    if (!CHAPTERS_BY_BOOK[book] || !Number.isInteger(chapter) || chapter < 1) {
      console.log("🚨 Parâmetros inválidos.")
      return res.status(400).json({ ok: false, message: "Parâmetros inválidos." });
    }

    console.log("prosseguindo...")

    console.log("book:", book, "chapter:", chapter)

    let item =
      (await Study.findOne({ bookId:book, chapter})
        .sort({ createdAt: -1 })
        .lean()) 
      
    if (!item) {
      console.log("item nao encontrado")
      return res.status(404).json({ ok: false, message: "Estudo não encontrado." });
    } 

    console.log("✅ item:", item)

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("GET /studies/:bookId/:chapter error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao carregar estudo." });
  }
});

/**
 * POST /api/studies
 * body: { bookId, chapter, title?, summary?, content, status? }
 * Upsert por (bookId, chapter): cria se não existir, senão atualiza o mais recente.
 */
router.post("/", protect, verifyLeader, async (req, res) => {
    console.log("listando novo estudo...")
  try {
    const { bookId, chapter, title, summary, content, status, author } = req.body || {};
    const book = String(bookId || "").trim().toLowerCase();
    const ch = parseInt(chapter, 10);

    if (!CHAPTERS_BY_BOOK[book]) {
      return res.status(400).json({ ok: false, message: "bookId inválido." });
    }
    if (!Number.isInteger(ch) || ch < 1 || ch > CHAPTERS_BY_BOOK[book]) {
      return res.status(400).json({ ok: false, message: "chapter inválido." });
    }
    if (!content || !String(content).trim()) {
      return res.status(400).json({ ok: false, message: "content é obrigatório." });
    }

    const desiredStatus =
      status && ["draft", "published", "archived"].includes(status) ? status : "published";

    // pega o mais recente desse capítulo (se existir) para atualizar
    const existing = await Study.findOne({ book, chapter: ch }).sort({ createdAt: -1 });

    if (!existing) {
      const created = await Study.create({
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
    return res.status(500).json({ ok: false, message: "Erro ao salvar estudo." });
  }
});

/**
 * DELETE /api/studies/:id
 */
router.delete("/:id", protect, verifyLeader, async (req, res) => {
  try {
    const { id } = req.params;
    const gone = await Study.findByIdAndDelete(id);
    if (!gone) return res.status(404).json({ ok: false, message: "Estudo não encontrado." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /studies/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao excluir estudo." });
  }
});

module.exports = router;

// routes/churchRoutes.js
const express = require("express");
const router = express.Router();

// 🔁 troque pelos caminhos corretos dos seus models:
const Church = require("../models/church"); // ex: ../models/Church.js
const ChurchMembership = require("../models/churchMembers"); // ex: ../models/ChurchMembership.js

// (opcional) seus middlewares reais:
const protect = (req, res, next) => {
  /* TODO: auth */ next();
};
const adminOnly = (req, res, next) => {
  /* TODO: role */ next();
};

// helper: atualizar cache de contagem
async function refreshMembersCount(churchId) {
  const count = await ChurchMembership.countDocuments({
    church: churchId,
    status: "active",
  });
  await Church.findByIdAndUpdate(churchId, { membersCount: count });
}



/**
 * GET /api/admChurchRoutes/geojson
 * GeoJSON pra usar direto no Mapbox
 */
// GET /api/admChurch/geojson  (público)
// GET /api/admChurch/geojson (público)
router.get("/geojson", async (req, res) => {
  console.log("🟢 PUBLIC: getting CHURCH geojson for map");

  const churches = await Church.find(
    { "location.coordinates.0": { $exists: true } },
    { name: 1, summary: 1, location: 1, address: 1 }
  ).lean(); // opcional: resposta menor/mais rápida

  const fc = {
    type: "FeatureCollection",
    features: churches
      .filter((c) =>
        Array.isArray(c.location?.coordinates) &&
        c.location.coordinates.length === 2 &&
        Number.isFinite(c.location.coordinates[0]) &&
        Number.isFinite(c.location.coordinates[1])
      )
      .map((c) => ({
        type: "Feature",
        properties: {
          id: String(c._id),
          title: c.name,
          description: c.summary || "",
          url: `/church/${c._id}`,
          address: c.address || "",
        },
        geometry: {
          type: "Point",
          coordinates: c.location.coordinates, // [lng, lat]
        },
      })),
  };

  res.type("application/geo+json").json(fc);
});


/**
 * GET /api/admChurchRoutes/:id
 * Detalhe da igreja
 */
// GET /api/church/:id  (público)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "id inválido" });
  }
  try {
    const church = await Church.findById(id).lean();
    if (!church) return res.status(404).json({ message: "church not found" });
    // cache leve opcional
    res.set("Cache-Control", "public, max-age=60");
    return res.json(church);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "internal error" });
  }
});

/**
 * POST /api/admChurchRoutes
 * Cria igreja
 * Aceita body com { name, summary, website, address, denomination, meetingTimes[], imageUrl, location { type: 'Point', coordinates: [lng, lat] } }
 * ou com lng/lat separados (converte automaticamente)
 */
router.post("/registerChurch", protect, adminOnly, async (req, res) => {
  console.log("🟢 Listing a new church");
  const body = { ...req.body };
  if (body.lng != null && body.lat != null && !body.location) {
    body.location = {
      type: "Point",
      coordinates: [Number(body.lng), Number(body.lat)],
    };
  }
  const c = await Church.create(body);
  console.log("new church created")
  res.status(201).json(c);
});

/**
 * PUT /api/admChurchRoutes/:id
 * Atualiza igreja
 */
router.put("/:id", protect, adminOnly, async (req, res) => {
  console.log("🟢 Updating an existing church");
  const body = { ...req.body };
  if (body.lng != null && body.lat != null) {
    body.location = {
      type: "Point",
      coordinates: [Number(body.lng), Number(body.lat)],
    };
  }
  const c = await Church.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!c) return res.status(404).json({ message: "Church not found" });
  res.json(c);
});

/**
 * DELETE /api/churches/:id
 * Remove igreja e vínculos
 */
router.delete("/:id", protect, adminOnly, async (req, res) => {
  console.log("🟢 deleting a church");
  const c = await Church.findById(req.params.id);
  if (!c) return res.status(404).json({ message: "Church not found" });

  await ChurchMembership.deleteMany({ church: c._id });
  await c.deleteOne();
  res.json({ ok: true });
});

/**
 * GET /api/churches/:id/members
 * Lista membros ativos da igreja
 */
router.get("/:id/members", protect, adminOnly, async (req, res) => {
  console.log("🟢 getting a specific member of a registered church");
  const members = await ChurchMembership.find({
    church: req.params.id,
    status: "active",
  })
    .populate("user", "username name profileImage")
    .sort({ createdAt: -1 });

  res.json(members);
});

/**
 * POST /api/churches/:id/members
 * Adiciona/atualiza vínculo de membro
 * Body: { userId, role = 'member' }
 */
router.post("/:id/members", protect, adminOnly, async (req, res) => {
    console.log("🟢 atualizando vinculo de membro com a igreja...")
  const { userId, role = "member" } = req.body;
  if (!userId) return res.status(400).json({ message: "userId é obrigatório" });

  const doc = await ChurchMembership.findOneAndUpdate(
    { user: userId, church: req.params.id },
    { user: userId, church: req.params.id, role, status: "active" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await refreshMembersCount(req.params.id);
  res.status(201).json(doc);
});

/**
 * DELETE /api/churches/members/:membershipId
 * Remove vínculo de membro
 */
router.delete(
  "/members/:membershipId",
  protect,
  adminOnly,
  async (req, res) => {
    console.log("🟢 removing member ... ?")
    const m = await ChurchMembership.findById(req.params.membershipId);
    if (!m) return res.status(404).json({ message: "Membership not found" });

    const churchId = m.church;
    await m.deleteOne();
    await refreshMembersCount(churchId);

    res.json({ ok: true });
  }
);

module.exports = router;

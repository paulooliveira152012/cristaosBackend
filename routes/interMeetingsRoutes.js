const express = require("express");
const router = express.Router();
const InterMeeting = require("../models/InterMeeting");

// POST /api/intermeeting/
router.post("/", async (req, res) => {
  console.log("creating new meeting… body:", req.body);

  try {
    const {
      name,
      summary = "",
      address = "",
      website = "",
      meetingDate,      // string/ISO ou Date
      location,         // opcional: { type:"Point", coordinates:[lng,lat] }
      lng,              // opcional
      lat,              // opcional
    } = req.body;

    // 1) valida 'name'
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name é obrigatório" });
    }

    // 2) monta 'finalLocation' a partir de location OU lng/lat
    let finalLocation = null;

    // a) se veio GeoJSON válido
    if (
      location &&
      location.type === "Point" &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2
    ) {
      const [lng0, lat0] = location.coordinates;
      finalLocation = {
        type: "Point",
        coordinates: [Number(lng0), Number(lat0)],
      };
    }

    // b) se não veio GeoJSON, tente com lng/lat
    if (!finalLocation && lng != null && lat != null) {
      finalLocation = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    // c) valida coordenadas
    if (
      !finalLocation ||
      !Number.isFinite(finalLocation.coordinates[0]) ||
      !Number.isFinite(finalLocation.coordinates[1])
    ) {
      return res.status(400).json({
        message:
          "location inválido. Envie location GeoJSON { type:'Point', coordinates:[lng,lat] } ou campos lng/lat numéricos.",
      });
    }

    // 3) meetingDate (opcional) → Date válido
    let meetingDateParsed = undefined;
    if (meetingDate !== undefined && meetingDate !== null && meetingDate !== "") {
      const d = new Date(meetingDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: "meetingDate inválido" });
      }
      meetingDateParsed = d;
    }

    // 4) cria documento
    const doc = await InterMeeting.create({
      name: String(name).trim(),
      summary: String(summary || "").trim(),
      address: String(address || "").trim(),
      website: String(website || "").trim(),
      meetingDate: meetingDateParsed, // pode ficar undefined
      location: finalLocation,        // requerido pelo schema
    });

    console.log("done")

    return res.status(201).json(doc); // front espera doc direto
  } catch (err) {
    console.error("Erro ao criar intermeeting:", err);
    return res.status(500).json({ message: "internal error" });
  }
});

// CREATE - POST /api/intermeeting/
// router.post("/", async (req, res) => {
//   console.log("criando uma nova reunião");
//   try {
//     const {
//       name,
//       title,
//       summary,
//       description,
//       location, // GeoJSON opcional
//       locationText, // texto opcional (ex: "Sao Paulo")
//       lng,
//       lat, // coordenadas opcionais
//     } = req.body;

//     const finalName = name || title;
//     if (!finalName) {
//       return res.status(400).json({ message: "name é obrigatório" });
//     }

//     // monta location a partir de lng/lat se vierem soltos
//     let finalLocation = location;

//     // Se NÃO tiver GeoJSON válido, permita salvar só com texto e geocodar depois
//     if (
//       finalLocation &&
//       (finalLocation.type !== "Point" ||
//         !Array.isArray(finalLocation.coordinates) ||
//         finalLocation.coordinates.length !== 2 ||
//         !Number.isFinite(finalLocation.coordinates[0]) ||
//         !Number.isFinite(finalLocation.coordinates[1]))
//     ) {
//       return res
//         .status(400)
//         .json({
//           message:
//             "location inválido. Use { type:'Point', coordinates:[lng,lat] }",
//         });
//     }

//     // valida location
//     if (
//       !finalLocation ||
//       finalLocation.type !== "Point" ||
//       !Array.isArray(finalLocation.coordinates) ||
//       finalLocation.coordinates.length !== 2 ||
//       !Number.isFinite(finalLocation.coordinates[0]) ||
//       !Number.isFinite(finalLocation.coordinates[1])
//     ) {
//       return res.status(400).json({
//         message:
//           "location inválido. Use { type:'Point', coordinates:[lng,lat] }",
//       });
//     }

//     const doc = await InterMeeting.create({
//       name: finalName,
//       summary: summary ?? description ?? "",
//       location: finalLocation || undefined,
//       locationText:
//         locationText ??
//         (typeof req.body.location === "string" ? req.body.location : ""),
//     });

//     return res.status(201).json(doc);
//   } catch (err) {
//     console.error("Erro ao criar intermeeting:", err);
//     return res.status(500).json({ message: "internal error" });
//   }
// });

// GET /api/intermeetings/geojson
// GET /api/intermeeting
router.get("/", async (req, res) => {
  console.log("🟢 PUBLIC: getting interdenominational meetings");
  try {
    const rows = await InterMeeting.find(
      { "location.coordinates.0": { $exists: true } },
      { name: 1, summary: 1, address: 1, meetingDate: 1, website: 1, location: 1 }
    ).lean();

    const meetings = (rows || [])
      .filter(
        (m) =>
          Array.isArray(m?.location?.coordinates) &&
          m.location.coordinates.length === 2 &&
          Number.isFinite(m.location.coordinates[0]) &&
          Number.isFinite(m.location.coordinates[1])
      )
      .map((m) => ({
        id: String(m._id),
        name: m.name,
        summary: m.summary || "",
        address: m.address || "",
        website: m.website || "",
        meetingDate: m.meetingDate ? m.meetingDate.toISOString() : null,
        lng: m.location.coordinates[0],
        lat: m.location.coordinates[1],
      }));

    return res.json({ meetings });
  } catch (err) {
    console.error("❌ intermeeting list error:", err);
    return res.status(500).json({ message: "Erro ao listar reuniões" });
  }
});

// PUT /api/intermeeting
// PUT /api/intermeeting/:id
router.put("/:id", async (req, res) => {
  console.log("updating meeting...", req.params.id);

  // Se o cliente mandar { payload: {...} } também funciona
  const data = req.body?.payload ?? req.body;

  // Monte um objeto de atualização só com os campos enviados
  const update = {};

  if (data.name !== undefined) update.name = data.name;
  if (data.summary !== undefined) update.summary = data.summary;
  if (data.address !== undefined) update.address = data.address;
  if (data.website !== undefined) update.website = data.website;

  if (data.meetingDate !== undefined) {
    // aceita null para limpar, string/Date para setar
    update.meetingDate = data.meetingDate ? new Date(data.meetingDate) : null;
  }

  // Se vierem lng/lat válidos, atualiza a localização
  const hasLng = data.lng !== undefined && data.lng !== null && data.lng !== "";
  const hasLat = data.lat !== undefined && data.lat !== null && data.lat !== "";

  if (hasLng && hasLat) {
    const lng = Number(data.lng);
    const lat = Number(data.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      update.location = { type: "Point", coordinates: [lng, lat] }; // [lng, lat]
    } else {
      return res.status(400).json({ message: "lng/lat inválidos" });
    }
  }

  try {
    // Opção A: atualizar direto
    const doc = await InterMeeting.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({ message: "Reunião não encontrada" });
    }

    console.log("atualizado!")
    return res.json(doc);

    // ---- Opção B (alternativa): carregar, setar e salvar ----
    // const doc = await InterMeeting.findById(req.params.id);
    // if (!doc) return res.status(404).json({ message: "Reunião não encontrada" });
    // doc.set(update);
    // await doc.save();
    // return res.json(doc);

  } catch (err) {
    console.error("Erro ao atualizar reunião:", err);
    return res.status(500).json({ message: "Erro interno ao atualizar" });
  }
});


module.exports = router;

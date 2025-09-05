const express = require("express");
const router = express.Router();
const InterMeeting = require("../models/InterMeeting");
const mongoose = require("mongoose")

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
// routes/interMeetingRoutes.js
// GET /api/intermeeting/geojson
router.get("/geojson", async (req, res) => {
  console.log("🟢 PUBLIC: getting interdenominational meetings geojson");
  try {
    const rows = await InterMeeting.find(
      { "location.coordinates.0": { $exists: true } },
      { name: 1, summary: 1, address: 1, meetingDate: 1, website: 1, location: 1 }
    ).lean();

    const features = (rows || [])
      .filter(m =>
        Array.isArray(m?.location?.coordinates) &&
        m.location.coordinates.length === 2 &&
        Number.isFinite(m.location.coordinates[0]) &&
        Number.isFinite(m.location.coordinates[1])
      )
      .map(m => ({
        type: "Feature",
        properties: {
          id: String(m._id),
          title: m.name,
          description: m.summary || "",
          address: m.address || "",
          website: m.website || "",
          meetingDate: m.meetingDate ? m.meetingDate.toISOString() : null,
          url: `/intermeeting/${m._id}`,
          pinColor: "#FF6600",
        },
        geometry: {
          type: "Point",
          coordinates: m.location.coordinates, // [lng, lat]
        },
      }));

      console.log("found meetings:", rows)

    res.type("application/geo+json").json({
      type: "FeatureCollection",
      features,
    });
  } catch (err) {
    console.error("❌ intermeeting geojson error:", err);
    res.status(500).json({ message: "Erro ao listar reuniões" });
  }
});

// GET /api/intermeeting/intermeetings
router.get("/intermeetings", async (req, res) => {
  try {
    // ajuste os campos que você precisa no select
    const rows = await InterMeeting.find(
      {},
      { name: 1, summary: 1, address: 1, meetingDate: 1, website: 1, location: 1, createdAt: 1, updatedAt: 1 }
    )
      .sort({ meetingDate: 1, createdAt: -1 })
      .lean();

    const meetings = (rows || []).map((m) => {
      const coords = Array.isArray(m?.location?.coordinates)
        ? m.location.coordinates
        : [undefined, undefined];
      const [lng, lat] = coords;

      return {
        _id: String(m._id),
        id: String(m._id),           // ajuda no front
        name: m.name || "",
        title: m.name || "",         // compat UI
        summary: m.summary || "",
        description: m.summary || "",// compat UI
        address: m.address || "",
        website: m.website || "",
        meetingDate: m.meetingDate ? m.meetingDate.toISOString() : null,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        location: m.location || (Number.isFinite(lat) && Number.isFinite(lng)
          ? { type: "Point", coordinates: [lng, lat] }
          : undefined),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    });

    return res.status(200).json({ meetings });
  } catch (err) {
    console.error("❌ intermeetings list error:", err);
    return res.status(500).json({ message: "Erro ao listar reuniões" });
  }
});


// PUT /api/intermeeting
// PUT /api/intermeeting/:id
// routes/interMeetingRoutes.js (trecho)
router.put("/:id", async (req, res) => {
  console.log("route for updating a meeting...");
  try {
    const {
      name,
      summary,
      address,
      website,
      meetingDate,
      location,
      lng,
      lat,
    } = req.body;

    console.log("RAW BODY:", req.body);

    // Monte `loc` de forma tolerante
    let loc = null;

    // 1) Se veio location completo e válido:
    if (
      location?.type === "Point" &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2 &&
      Number.isFinite(Number(location.coordinates[0])) &&
      Number.isFinite(Number(location.coordinates[1]))
    ) {
      const nLng = Number(location.coordinates[0]);
      const nLat = Number(location.coordinates[1]);
      loc = { type: "Point", coordinates: [nLng, nLat] };
    }

    // 2) Senão, tente com lng/lat soltos:
    if (!loc && lng !== undefined && lat !== undefined) {
      const nLng = Number(lng);
      const nLat = Number(lat);
      if (Number.isFinite(nLng) && Number.isFinite(nLat)) {
        loc = { type: "Point", coordinates: [nLng, nLat] };
      }
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (summary !== undefined) update.summary = summary;
    if (address !== undefined) update.address = address;
    if (website !== undefined) update.website = website;

    // só atualiza meetingDate se veio um valor válido
    if (meetingDate) {
      const d = new Date(meetingDate);
      if (!isNaN(d)) update.meetingDate = d;
    }

    if (loc) update.location = loc;

    const updated = await InterMeeting.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Meeting não encontrado" });
    }

    res.json(updated);
  } catch (err) {
    console.error("PUT /intermeeting/:id error:", err);
    res.status(500).json({ message: "Erro ao atualizar reunião" });
  }
});


router.get("/intermeetings/:id", async (req, res) => {
  console.log("busca de dados da reuniao")
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "ID inválido." });
    }

    const doc = await InterMeeting.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ ok: false, message: "Reunião não encontrada." });
    }

    // Retorna cru; o front já normaliza.
    return res.status(200).json({ ok: true, item: doc });
  } catch (err) {
    console.error("GET /intermeetings/:id error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao carregar a reunião." });
  }
});




module.exports = router;

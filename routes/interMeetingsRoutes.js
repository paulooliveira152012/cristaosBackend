const express = require("express");
const router = express.Router();
const InterMeeting = require("../models/InterMeeting");


// CREATE - POST /api/intermeeting
router.post("/", async (req, res) => {
  try {
    const { name, summary, location, lng, lat } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name é obrigatório" });
    }

    // monta location a partir de lng/lat se vierem soltos
    let finalLocation = location;
    if ((!finalLocation || !Array.isArray(finalLocation.coordinates)) && (lng != null && lat != null)) {
      finalLocation = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)], // [lng, lat]
      };
    }

    // valida location
    if (
      !finalLocation ||
      finalLocation.type !== "Point" ||
      !Array.isArray(finalLocation.coordinates) ||
      finalLocation.coordinates.length !== 2 ||
      !Number.isFinite(finalLocation.coordinates[0]) ||
      !Number.isFinite(finalLocation.coordinates[1])
    ) {
      return res.status(400).json({ message: "location inválido. Use { type:'Point', coordinates:[lng,lat] }" });
    }

    const doc = await InterMeeting.create({
      name,
      summary: summary || "",
      location: finalLocation,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error("Erro ao criar intermeeting:", err);
    return res.status(500).json({ message: "internal error" });
  }
});

// GET /api/intermeetings/geojson
router.get("/geojson", async (req, res) => {
  console.log("🟢 PUBLIC: getting interdenominational meetings geojson");
  const meetings = await InterMeeting.find(
    { "location.coordinates.0": { $exists: true } },
    { name: 1, summary: 1, location: 1 }
  );

  const fc = {
    type: "FeatureCollection",
    features: meetings
      .filter(
        (m) =>
          Array.isArray(m.location?.coordinates) &&
          m.location.coordinates.length === 2 &&
          Number.isFinite(m.location.coordinates[0]) &&
          Number.isFinite(m.location.coordinates[1])
      )
      .map((m) => ({
        type: "Feature",
        properties: {
          id: String(m._id),
          title: m.name,
          description: m.summary || "",
          url: `/intermeeting/${m._id}`,
          pinColor: "#ff6600", // cor diferente
        },
        geometry: {
          type: "Point",
          coordinates: m.location.coordinates,
        },
      })),
  };

  res.json(fc);
});

module.exports = router;

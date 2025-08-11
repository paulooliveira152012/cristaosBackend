// routes/publicChurchRoutes.js (ou no seu arquivo atual)
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Church = require("../models/church");
const Membership = require("../models/churchMembers")

/**
 * GET /api/church
 * Lista de igrejas
 */

router.get("/", async (req, res) => {
  console.log("🟢 getting all churches");
  const churches = await Church.find().sort({ createdAt: -1 });
  res.json(churches);
});

// GET público
router.get("/getChurchInfo/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const church = await Church.findById(id).lean();
    if (!church) return res.status(404).json({ message: "church not found" });

    // opcional: cache leve de 60s
    res.set("Cache-Control", "public, max-age=60");
    return res.json(church);
  } catch (err) {
    console.error("Error finding church", err);
    return res.status(500).json({ message: "internal error" });
  }
});

/**
 * GET /api/church/getChurchMembers/:id
 * Query: page, limit, status, role, q
 * Retorna: { members, page, limit, total }
 */
router.get("/getChurchMembers/:id", /* authMiddleware, */ async (req, res) => {
  console.log("getting church members...")
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "churchId inválido" });
    }

    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip  = (page - 1) * limit;

    const status = req.query.status || "active";
    const role   = req.query.role;
    const q      = (req.query.q || "").trim();

    const match = { church: new mongoose.Types.ObjectId(id) };
    if (status) match.status = status;
    if (role)   match.role   = role;

    const pipeline = [
      { $match: match },
      { $sort: { joinedAt: -1, _id: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
    ];

    if (q) {
      const rx = new RegExp(q, "i");
      pipeline.push({
        $match: {
          $or: [
            { "user.username": rx },
            { "user.name": rx },
            { "user.email": rx },
          ],
        },
      });
    }

    pipeline.push(
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                role: 1,
                status: 1,
                joinedAt: 1,
                user: {
                  _id: "$user._id",
                  username: "$user.username",
                  name: "$user.name",
                  email: "$user.email",
                  profileImage: "$user.profileImage",
                },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      }
    );

    const [{ data, total }] = await Membership.aggregate(pipeline);
    const totalCount = total?.[0]?.count || 0;

    return res.json({
      members: data,
      page,
      limit,
      total: totalCount,
    });
  } catch (err) {
    console.error("❌ erro em getChurchMembers:", err);
    return res.status(500).json({ message: "Erro ao listar membros" });
  }
});

module.exports = router;

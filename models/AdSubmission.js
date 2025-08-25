// models/AdSubmission.js
const mongoose = require("mongoose");

const AdSubmissionSchema = new mongoose.Schema(
  {
    // contato
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    company: String,

    // conteúdo do anúncio
    title: { type: String, required: true },
    description: { type: String, required: true, maxlength: 2000 },
    link: { type: String, required: true },
    imageUrl: String,

    // metadados de campanha
    category: String,
    location: String,
    interests: String,
    planId: { type: String, required: true },
    placements: { type: [String], default: [] },

    // agendamento
    startDate: Date,
    endDate: Date,

    // workflow
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },

    // se quiser atrelar ao usuário logado
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdSubmission", AdSubmissionSchema);

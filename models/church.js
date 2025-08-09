const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChurchSchema = new Schema({
  name: { type: String, required: true, trim: true },
  summary: String,
  website: String,
  address: String,
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined } // [lng, lat]
  },
  denomination: String,
  meetingTimes: [String],
  imageUrl: String,
  // opcional: líder(es) oficiais
  leaders: [{ type: Schema.Types.ObjectId, ref: "User" }],
  membersCount: { type: Number, default: 0 }, // cache simples
}, { timestamps: true });

ChurchSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Church", ChurchSchema);

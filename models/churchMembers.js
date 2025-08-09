const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChurchMembershipSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  church: { type: Schema.Types.ObjectId, ref: "Church", required: true },
  role: { type: String, enum: ["member", "leader", "pastor", "admin"], default: "member" },
  status: { type: String, enum: ["active", "pending", "removed"], default: "active" },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

ChurchMembershipSchema.index({ user: 1, church: 1 }, { unique: true });

module.exports = mongoose.model("ChurchMembership", ChurchMembershipSchema);

// models/Report.js
const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const EvidenceSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "url", "text", "file"], required: true },
    url: { type: String, trim: true },
    text: { type: String, trim: true, maxlength: 2000 },
    storageKey: { type: String, trim: true },
    mime: { type: String, trim: true },
    size: { type: Number },
    addedBy: { type: Types.ObjectId, ref: "User" },
    addedAt: { type: Date, default: Date.now },
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ReportSchema = new Schema(
  {
    reportedUser:  { type: Types.ObjectId, ref: "User", required: true, index: true },
    reportingUser: { type: Types.ObjectId, ref: "User", required: true, index: true },

    reason: { type: String, required: true, trim: true, maxlength: 500 },

    category: {
      type: String,
      enum: ["abuse","harassment","spam","nudity","hate","self-harm","impersonation","scam","other"],
      default: "other",
      index: true,
    },

    source: {
      type: String,
      enum: ["profile","listing","comment","message","mural","other"],
      default: "other",
      index: true,
    },

    context: {
      listing: { type: Types.ObjectId, ref: "Listing" },
      comment: { type: Types.ObjectId, ref: "Comment" }, // se existir
      message: { type: Types.ObjectId, ref: "Message" }, // se existir
      url: { type: String, trim: true },
    },

    evidence: [EvidenceSchema],

    status: {
      type: String,
      enum: ["open","reviewing","dismissed","actioned","pending"],
      default: "open",
      index: true,
    },
    assignedTo: { type: Types.ObjectId, ref: "User" },

    action: {
      type: String,
      enum: ["none","warn","strike","ban","other"],
      default: "none",
    },
    actionNotes: { type: String, trim: true, maxlength: 1000 },
    actionBy: { type: Types.ObjectId, ref: "User" },
    actionAt: { type: Date },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* Indexes úteis */
ReportSchema.index({ reportedUser: 1, status: 1, createdAt: -1 });
ReportSchema.index({ reportingUser: 1, createdAt: -1 });
ReportSchema.index({ "context.listing": 1 });
ReportSchema.index({ category: 1, status: 1 });
ReportSchema.index({ status: 1, createdAt: -1 }, { partialFilterExpression: { status: "open" } }); // fila

/* Virtuals para usernames (após populate) */
ReportSchema.virtual("reportedUsername").get(function () {
  return this.reportedUser && this.reportedUser.username ? this.reportedUser.username : null;
});
ReportSchema.virtual("reportingUsername").get(function () {
  return this.reportingUser && this.reportingUser.username ? this.reportingUser.username : null;
});

module.exports = mongoose.model("Report", ReportSchema);

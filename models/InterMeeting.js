const mongoose = require("mongoose");

const interMeetingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    summary: String,
    address: String,
    meetingDate: Date,
    website: String,
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { timestamps: true }
);

interMeetingSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("InterMeeting", interMeetingSchema);

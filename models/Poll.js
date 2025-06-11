const mongoose = require('mongoose');

const PollSchema = new mongoose.Schema({
    question: String,
    options: [String],
    pollResults: {
      type: Map,
      of: Number,
      default: {}
    },
    totalVotes: { type: Number, default: 0 }
  });
  
  module.exports = mongoose.model('Poll', PollSchema);
  
  
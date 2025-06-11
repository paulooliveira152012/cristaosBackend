const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the structure for each comment directly within the Listing schema
const commentSchema = new Schema({
  text: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  replies: [
    {
      text: String,
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      username: String,
      profileImage: String,
      createdAt: { type: Date, default: Date.now },
      likes: [{ type: Schema.Types.ObjectId, ref: 'User' }]
    }
  ],
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }]
});

const listingSchema = new mongoose.Schema({
  type: { type: String, required: true }, // "blog", "image", "poll", or "link"
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blogTitle: String,
  blogContent: String,
  imageUrl: String,
  link: String,
  poll: {
    question: String,
    options: [String],
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Users who liked the listing
  }],
  comments: [commentSchema], // Embed the commentSchema directly in Listing
  createdAt: { type: Date, default: Date.now },
});

// Exporting the Listing model
module.exports = mongoose.model('Listing', listingSchema);

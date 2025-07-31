const express = require("express");
const mongoose = require("mongoose");
const Comment = require("../models/Comment");
const Listing = require("../models/Listing");
const User = require("../models/Usuario");
const createNotificationUtil = require("../utils/notificationUtils");
const router = express.Router();

// Add Top-Level Comment
// Add Top-Level Comment
router.post("/listings/:listingId/comment", async (req, res) => {
  console.log("you've reached the backend route to submit a comment");

  const { listingId } = req.params;
  const { userId, commentText } = req.body;

  console.log("listingId:", listingId);
  console.log("userId:", userId);
  console.log("comment", commentText);

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newComment = listing.comments.create({
      text: commentText,
      user: userId,
      username: user.username,
      profileImage: user.profileImage,
      createdAt: new Date(),
      replies: [],
      likes: [],
    });

    // add comment to listings' comment array
    listing.comments.push(newComment);

    // save the updated listing with the comment
    await listing.save();

    const io = req.app.get("io");

    // send notification
    // ✅ Se for um novo like e o dono do post for diferente do usuário
    if (listing.userId.toString() !== userId.toString()) {
      await createNotificationUtil({
        io,
        recipient: listing.userId,
        fromUser: userId,
        type: "comment",
        content: `${user.username} comentou seu post!`,
        listingId: listing._id,
        commentId: newComment._id,
      });
    }

    // Respond with the updated comments array
    res.status(201).json({ message: "Comment added", comment: newComment });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Error adding comment", error });
  }
});

// comments = the api route prefix defined in index.js
// Test route
// router.post('/listings/:parentCommentId/reply', (req, res) => {
//   console.log("bem vindo ao backend");
//   console.log("rota de teste encontrada!");
//   res.json({ comment: "Test route found" });
//   const { parentCommentId } = req.params
//   console.log("o ID do comentario pai mandado para o backend e:", parentCommentId)
// });

// Add Reply to Comment
// Define the route to handle replies for a specific comment
// Add Reply to Comment
router.post("/listings/:parentCommentId/reply", async (req, res) => {
  console.log("backend reply route found yey");
  const { parentCommentId } = req.params;
  const { listingId, userId, replyText } = req.body;

  console.log("parentCommentId:", parentCommentId);
  console.log("listingId:", listingId);
  console.log("userId:", userId);
  console.log("replyText:", replyText);

  try {
    // (1)
    // Find the listing containing the parent comment
    const listing = await Listing.findById(listingId);

    if (!listing) {
      console.log("No listing found", listing);
      return res.status(404).json({ message: "Listing not found" });
    }
    // (2)
    // Find the parent comment within the listing's comments array
    const parentComment = listing.comments.id(parentCommentId);

    if (!parentComment) {
      return res.status(404).json({ message: "Parent comment not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    console.log("parent comment found", parentComment);

    // Create the reply object

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      text: replyText,
      user: userId,
      username: user.username,
      profileImage: user.profileImage,
      createdAt: new Date(),
      likes: [],
    };

    // Push the reply into the replies array
    parentComment.replies.push(newReply);

    // Save the parent comment with the new reply
    await listing.save();

    const io = req.app.get("io");

    // send notification
    // ✅ Se for um novo like e o dono do post for diferente do usuário
    if (parentComment.user.toString() !== userId.toString()) {
      await createNotificationUtil({
        io,
        recipient: parentComment.user, // autor do comentario original
        fromUser: userId,
        type: "reply",
        content: `${user.username} respondeu seu comentario!`,
        listingId: listing._id,
        commentId: parentComment._id,
      });
    }

    res.status(201).json({ message: "Reply added", reply: newReply });
  } catch (error) {
    console.error("Error adding reply:", error);
    res.status(500).json({ message: "Error adding reply", error });
  }
});

// Fetch comments for a listing, including nested replies
router.get("/listings/:listingId/comments", async (req, res) => {
  console.log("LISTA PARA BUSCAR COMENTARIOS ENCONTRADA");

  const { listingId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "Invalid listing ID" });
  }

  try {
    // Fetch top-level comments (comments with no parentCommentId) and their replies
    const comments = await Comment.find({ listingId, parentCommentId: null })
      .populate("user") // Populate the user who made the comment
      .populate({
        path: "replies",
        populate: {
          path: "user", // Populate the user in each reply
        },
      });

    res.status(200).json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error.message, error.stack);
    res.status(500).json({ message: "Server error" });
  }
});

// router.put('/comment/like/:commentId', (req, res) => {
//   console.log("test route reached")
//   const { commentId } = req.params
//   console.log("o id da comentario curtido e:", commentId)
// })

// Toggle like for a comment
router.put("/comment/like/:commentId", async (req, res) => {
  console.log("You've reached comment like route");
  const { userId } = req.body;
  const { commentId } = req.params;

  console.log("o commentId dos paramentros e:", commentId);

  if (!commentId || commentId === "undefined") {
    return res.status(400).json({ message: "Comment ID is required" });
  }

  try {
    //  Find listing that contains the comment
    const listing = await Listing.findOne({ "comments._id": commentId });
    if (!listing) {
      return res
        .status(404)
        .json({ message: "Listing with comment not found" });
    }

    console.log("Listing containing the comment found");

    // find specific comment within listing's comments array
    const comment = listing.comments.id(commentId);
    console.log("comment liked/disliked is:", comment);
    if (!comment) {
      return res
        .status(404)
        .json({ message: "Comment not found within listing" });
    }

    // Check if the user has already liked the comment
    const isLiked = comment.likes.includes(userId);
    if (isLiked) {
      console.log("comment is liked, removing like");
      // Unlike the comment
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    } else {
      console.log("comment is not liked, liking comment");
      // Like the comment
      comment.likes.push(userId);
    }

    await listing.save();

    // chamar notification util

    const io = req.app.get("io")

    // 🔔 Cria notificação para o usuário solicitado
    await createNotificationUtil({
      io,
      recipient: requested,
      fromUser: requester,
      type: "comment_like", // ou "chat_request" se quiser criar uma nova categoria
      content: `${requesterObject.username} te convidou para uma conversa privada.`,
    });

    console.log("comment like/unlike saved in database");
    res.status(200).json({ likes: comment.likes });
  } catch (error) {
    console.log("An error occured in backend", error);
    res.status(500).json({ message: "Error toggling like", error });
  }
});

// Similar route for liking replies
router.put("/comment/like/:parentCommentId/:replyId", async (req, res) => {
  console.log("voce chegou na rota de like de replies!");
  const { userId } = req.body;
  const { parentCommentId, replyId } = req.params;

  console.log("o userId e:", userId);
  console.log("o parentCommentId e:", parentCommentId);
  console.log("o replyId e:", replyId);

  try {
    // const parentComment = await Comment.findById(parentCommentId);
    // console.log("parentComment:", parentComment)

    // find listing that contains the comment
    const listing = await Listing.findOne({ "comments._id": parentCommentId });
    if (!listing) {
      console.log("Listing not found");
      return res
        .status(404)
        .json({ message: "Listing with comment not found" });
    }

    console.log("Listing found:", listing._id);

    // Find the parent comment within the listing's comments array
    const parentComment = listing.comments.id(parentCommentId);
    if (!parentComment) {
      console.log("parent comment not found");
      return res.status(404).json({ message: "Parent comment not found" });
    }

    console.log("Parent comment found:", parentComment);

    // find the specific reply within the parent comment's replies array
    const reply = parentComment.replies.id(replyId);

    if (!reply) {
      console.log("Reply not found");
      return res.status(404).json({ message: "Reply not found" });
    }

    console.log("Reply found:", reply);

    // Check if the user has already liked the reply
    const isLiked = reply.likes.includes(userId);
    if (isLiked) {
      // Unlike the reply
      console.log("Reply is liked, removing like");
      reply.likes = reply.likes.filter((id) => id.toString() !== userId);
    } else {
      console.log("Reply is not liked, liking reply");
      // Like the reply
      reply.likes.push(userId);
    }

    await listing.save();
    console.log("Reply like/unlike saved in database");

    res.status(200).json({ likes: reply.likes });
  } catch (error) {
    res.status(500).json({ message: "Error toggling like", error });
  }
});

router.get("/testing", (req, res) => {
  res.send("rota de teste encontrada!");
});

// Route for deleting a parent comment
// Route for deleting a parent comment or a reply
// Route for deleting a parent comment or a reply
// Delete comment or reply
router.delete("/:commentId/:parentCommentId?", async (req, res) => {
  console.log("delete route hit");

  const { commentId, parentCommentId } = req.params;

  console.log(`commentId = ${commentId}, parentCommentId = ${parentCommentId}`);

  try {
    if (!parentCommentId) {
      // This is a top-level comment deletion
      console.log("Deleting parent comment:", commentId);

      // find the listing pertaining to the comment
      const listing = await Listing.findOne({ "comments._id": commentId });

      if (!listing) {
        console.log("listing with this comment not found");
        return res
          .status(404)
          .json({ message: "Listing with comment not found" });
      }

      // Remove the comment from the listing's comments array
      listing.comments = listing.comments.filter(
        (comment) => comment._id.toString() !== commentId
      );

      await listing.save();

      return res
        .status(200)
        .json({ message: "Parent comment deleted successfully" });
    } else {
      // This is a reply deletion
      console.log(
        "Deleting reply comment with parentCommentId:",
        parentCommentId
      );

      // Find the listing containing the parent comment
      const listing = await Listing.findOne({
        "comments._id": parentCommentId,
      });

      if (!listing) {
        return res
          .status(404)
          .json({ message: "Listing with parent comment not found" });
      }

      // Find the parent comment within the listing
      const parentComment = listing.comments.id(parentCommentId);

      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Remove the reply from the parent comment's replies array
      parentComment.replies = parentComment.replies.filter(
        (reply) => reply._id.toString() !== commentId
      );

      await listing.save();

      return res.status(200).json({ message: "Reply deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({ message: "Error deleting comment", error });
  }
});

// Route for deleting a reply
router.delete(
  "/comments/:parentCommentId/replies/:replyId",
  async (req, res) => {
    try {
      const { parentCommentId, replyId } = req.params;

      // Find the parent comment
      const parentComment = await Comment.findById(parentCommentId);

      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Find and remove the reply within the parent comment's replies array
      const replyIndex = parentComment.replies.findIndex(
        (reply) => reply._id.toString() === replyId
      );
      if (replyIndex === -1) {
        return res.status(404).json({ message: "Reply not found" });
      }

      // Remove the reply
      parentComment.replies.splice(replyIndex, 1);
      await parentComment.save();

      res
        .status(200)
        .json({ message: "Reply deleted successfully", parentComment });
    } catch (error) {
      res.status(500).json({ message: "Error deleting reply", error });
    }
  }
);

module.exports = router;

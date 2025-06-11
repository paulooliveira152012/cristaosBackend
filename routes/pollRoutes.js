const express = require('express');
const Poll = require('../models/Poll');

const router = express.Router();

// Vote on Poll
router.post("/polls/:pollId/vote", async (req, res) => {
  const { pollId } = req.params;
  const { selectedOption } = req.body;

  try {
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    poll.pollResults[selectedOption] =
      (poll.pollResults[selectedOption] || 0) + 1;
    poll.totalVotes = (poll.totalVotes || 0) + 1;
    await poll.save();

    res.status(200).json({ updatedPoll: poll });
  } catch (error) {
    res.status(500).json({ message: "Error submitting vote", error });
  }
});


module.exports = router;

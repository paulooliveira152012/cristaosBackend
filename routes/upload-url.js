const AWS = require("aws-sdk");
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

AWS.config.update({
  region: "us-east-2",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

router.get("/upload-url", async (req, res) => {
  const fileName = `${uuidv4()}.jpg`;
  const params = {
    Bucket: "cristaos",
    Key: fileName,
    Expires: 60, // 1 minuto
    ContentType: "image/jpeg",
  };

  try {
    const uploadURL = await s3.getSignedUrlPromise("putObject", params);
    res.json({ uploadURL, key: fileName });
  } catch (error) {
    console.error("Error generating signed URL", error);
    res.status(500).json({ message: "Error generating signed URL" });
  }
});

module.exports = router;

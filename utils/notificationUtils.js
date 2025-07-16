// utils/notificationUtils.js
const Notification = require("../models/Notification");

const createNotification = async ({ type, recipient, fromUser, listing = null, comment = null }) => {
    console.log("utils for creating a new notification...")
    console.log("Type:", type, "recipient:", recipient, "sender:", fromUser)

        const newNotification = new Notification({
          type,
          recipient,
          fromUser,
          listing,
          comment,
        });
        
          await newNotification.save();
          return newNotification;
    }

module.exports = { createNotification };

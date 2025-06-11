const Message = require('../models/Message');

// Emit chat history for a specific room
const emitChatHistory = async (socket, roomId) => {
  try {
    // Fetch messages for the specific room, sorted by timestamp
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100).exec();
    console.log(`Sending chat history to client for room ${roomId}`);
    socket.emit('chatHistory', messages); // Emit chat history for the specific room
  } catch (error) {
    console.error(`Error fetching chat history for room ${roomId}:`, error.message);
    socket.emit('errorMessage', `Error fetching chat history: ${error.message}`);
  }
};

// Handle incoming messages for a specific room
const handleSendMessage = async (io, roomId, data) => {
  if (!data || !data.username || !data.message || !data.userId || !data.profileImage) {
    io.to(roomId).emit('errorMessage', 'Invalid message data');
    return;
  }

  try {
    const newMessage = new Message({
      roomId,
      userId: data.userId,
      username: data.username,
      profileImage: data.profileImage,
      message: data.message,
      timestamp: new Date(),
    });

    await newMessage.save(); // Save message to the database

    console.log("Broadcasting message to room:", roomId, newMessage); // Log message for debugging

    // Emit the new message to all clients in the room (including the sender)
    io.to(roomId).emit('receiveMessage', newMessage); // Broadcast to the room

  } catch (error) {
    console.error('Error saving message:', error);
    io.to(roomId).emit('errorMessage', `Error saving message: ${error.message}`);
  }
};

// Handle message deletion for a specific room
const handleDeleteMessage = async (socket, messageId, userId, roomId) => {
  try {
    const message = await Message.findById(messageId);

    if (!message) {
      console.error(`Message with ID ${messageId} not found`);
      socket.emit('errorMessage', 'Message not found');
      return;
    }

    // Ensure the user is authorized to delete the message
    if (message.userId.toString() !== userId.toString()) {
      console.error(`User ${userId} is not authorized to delete message ${messageId}`);
      socket.emit('errorMessage', 'You are not authorized to delete this message');
      return;
    }

    // Delete the message if authorized
    await Message.deleteOne({ _id: messageId });
    console.log(`Message ${messageId} deleted by user ${userId}`);

    // Notify all clients in the room, including the one who deleted the message
    socket.to(roomId).emit('messageDeleted', messageId); // Notify others in the room
    socket.emit('messageDeleted', messageId); // Confirm deletion to the user who deleted the message
  } catch (error) {
    console.error(`Error deleting message in room ${roomId}:`, error.message);
    socket.emit('errorMessage', 'Failed to delete message');
  }
};

// Emit chat history for users when they minimize the room
const emitChatHistoryWhenMinimized = async (socket, roomId) => {
  try {
    const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100).exec();
    console.log(`Sending chat history to minimized client for room ${roomId}`);
    socket.emit('minimizedChatHistory', messages); // Emit minimized chat history for the specific room
  } catch (error) {
    console.error(`Error fetching minimized chat history for room ${roomId}:`, error.message);
    socket.emit('errorMessage', `Error fetching chat history while minimized: ${error.message}`);
  }
};

module.exports = {
  emitChatHistory,
  handleSendMessage,
  handleDeleteMessage,
  emitChatHistoryWhenMinimized, // Add this function for minimized room chat history
};

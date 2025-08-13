const express = require('express');
const userRoutes = require('./userRoutes');
const listingRoutes = require('./listingRoutes');
const commentRoutes = require('./commentRoutes');
const pollRoutes = require('./pollRoutes');
const rooms = require('./rooms')
const adminRoutes = require('./adminRoutes')
const uploadImageRoute = require('./upload-url'); 
const notifications = require('./notifications')
const messagesRoutes = require('./messages')
const reelRoutes = require("./reelRoutes");
const adManagementRoutes = require('./adManagementRoutes');
const admChurchRoutes = require('./adminChurchRoutes')
const churchRoutes = require('./churchRoutes')
const interMeetingRoutes = require('./interMeetingsRoutes')
const muralRoutes = require('./muralRoutes')


const router = express.Router();

router.use('/users', userRoutes); // o nome da colecao que aparece no banco de dados (users)
router.use('/notifications', notifications)
router.use('/listings', listingRoutes);
router.use('/comments', commentRoutes);
router.use('/polls', pollRoutes);
router.use('/rooms', rooms);
router.use('/adm', adminRoutes);
router.use('/dm', messagesRoutes);
router.use('/', uploadImageRoute);
router.use('/reels', reelRoutes);
router.use("/adManagement", adManagementRoutes);
router.use("/admChurch", admChurchRoutes)
router.use("/church", churchRoutes)
router.use("/intermeeting", interMeetingRoutes)
router.use("/mural", muralRoutes)

module.exports = router;


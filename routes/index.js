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

const router = express.Router();

router.use('/users', userRoutes); // o nome da colecao que aparece no banco de dados (users)
router.use('/notifications', notifications)
router.use('/listings', listingRoutes);
router.use('/comments', commentRoutes);
router.use('/polls', pollRoutes);
router.use('/rooms', rooms);
router.use('/adm', adminRoutes);
router.use('/dm', messagesRoutes)
router.use('/', uploadImageRoute)

module.exports = router;


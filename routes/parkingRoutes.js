const express = require('express');
const router = express.Router();
const { 
    addParkingSpace, 
    getAllParkingSpaces, 
    deleteParkingSpace, 
    fetchNearbyParkingSpaces,
    updateSlotAvailability 
} = require('../controllers/parkingController');
const { authenticateToken } = require('../middleware/auth');

// Add new parking space (protected route)
router.post('/add', authenticateToken, addParkingSpace);

// Get all parking spaces
router.get('/all', getAllParkingSpaces);

// Delete parking space (protected route)
router.delete('/:id', authenticateToken, deleteParkingSpace);

// Get nearby parking spaces
router.get('/nearby', fetchNearbyParkingSpaces);

// Update slot availability (protected route)
router.patch('/update-slot', authenticateToken, updateSlotAvailability);
///

module.exports = router;
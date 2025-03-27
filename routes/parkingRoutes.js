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
// PATCH /parking-spaces/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleType, action } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    // Verify token (if you have authentication middleware)
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Find the parking space
    const parkingSpace = await ParkingSpace.findById(id);
    if (!parkingSpace) {
      return res.status(404).json({ error: 'Parking space not found' });
    }

    // Find the vehicle slot
    const vehicleSlot = parkingSpace.vehicleSlots.find(slot => slot.vehicleType === vehicleType);
    if (!vehicleSlot) {
      return res.status(404).json({ error: 'Vehicle type not found in parking space' });
    }

    // Update the slot count
    if (action === 'decrement') {
      if (vehicleSlot.availableSlots > 0) {
        vehicleSlot.availableSlots -= 1;
      } else {
        return res.status(400).json({ error: 'No available slots for this vehicle type' });
      }
    }

    // Save the updated parking space
    await parkingSpace.save();

    res.json(parkingSpace);
  } catch (error) {
    console.error('Error updating parking space:', error);
    res.status(500).json({ error: 'Failed to update parking space' });
  }
});
module.exports = router;

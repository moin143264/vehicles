const ParkingSpace = require('../models/ParkingSpace');
const { createError } = require('../utils/error');

// Add new parking space
exports.addParkingSpace = async (req, res) => {
  try {
    const { 
      name, 
      address, 
      type, 
      vehicleSlots,
      latitude, 
      longitude,
      facilities = []
    } = req.body;

    // Validate required coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required fields'
      });
    }

    // Validate coordinate ranges
    if (Number(latitude) < -90 || Number(latitude) > 90) {
      return res.status(400).json({
        success: false,
        message: 'Latitude must be between -90 and 90 degrees'
      });
    }

    if (Number(longitude) < -180 || Number(longitude) > 180) {
      return res.status(400).json({
        success: false,
        message: 'Longitude must be between -180 and 180 degrees'
      });
    }

    const spaceId = req.body.spaceId || `PS-${Date.now()}`;

    // Validate and transform vehicle slots
    const validatedVehicleSlots = vehicleSlots.map(slot => ({
      ...slot,
      availableSlots: slot.totalSlots,
      pricePerHour: Number(slot.pricePerHour) || 0,
      totalSlots: Number(slot.totalSlots) || 0,
      dimensions: {
        length: Number(slot.dimensions?.length) || 0,
        width: Number(slot.dimensions?.width) || 0,
        height: Number(slot.dimensions?.height) || 0
      }
    }));

    const newParkingSpace = new ParkingSpace({
      name,
      address,
      type,
      vehicleSlots: validatedVehicleSlots,
      location: {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)]
      },
      latitude: Number(latitude),   // Add explicit latitude field
      longitude: Number(longitude), // Add explicit longitude field
      facilities: facilities.filter(f => f && f.trim() !== ''),
      spaceId,
      isActive: true
    });

    const savedParkingSpace = await newParkingSpace.save();

    res.status(201).json({ 
      success: true,
      message: 'Parking space added successfully', 
      parkingSpace: savedParkingSpace 
    });
  } catch (error) {
    console.error('Error adding parking space:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: 'Validation Failed', 
        errors 
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Parking space with this ID already exists' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Failed to add parking space', 
      error: error.message 
    });
  }
};
exports.getAllParkingSpaces = async (req, res) => {
  try {
    const parkingSpaces = await ParkingSpace.find()
      .select('-__v')
      .lean();

    // Transform the data to match the frontend expectations
    const transformedSpaces = parkingSpaces.map(space => ({
      ...space,
      spaceId: space._id.toString(),
      totalCapacity: space.vehicleSlots.reduce((total, slot) => total + slot.totalSlots, 0),
      totalAvailableSlots: space.vehicleSlots.reduce((total, slot) => total + (slot.availableSlots || 0), 0),
      dailyPotentialRevenue: space.vehicleSlots.reduce((total, slot) => 
        total + (slot.totalSlots * slot.pricePerHour * 24), 0
      )
    }));

    res.status(200).json({
      success: true,
      parkingSpaces: transformedSpaces
    });
  } catch (error) {
    console.error('Error fetching parking spaces:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parking spaces',
      error: error.message
    });
  }
};

exports.deleteParkingSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSpace = await ParkingSpace.findByIdAndDelete(id);
    
    if (!deletedSpace) {
      return res.status(404).json({
        success: false,
        message: 'Parking space not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Parking space deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting parking space:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete parking space',
      error: error.message
    });
  }
};


// Fetch nearby parking spaces
exports.fetchNearbyParkingSpaces = async (req, res) => {
  try {
    const { latitude, longitude, radius = 5000 } = req.query;

    const nearbySpaces = await ParkingSpace.find({
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    });

    res.status(200).json({
      success: true,
      parkingSpaces: nearbySpaces
    });
  } catch (error) {
    console.error('Error fetching nearby parking spaces:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby parking spaces',
      error: error.message
    });
  }
};

// Update slot availability
exports.updateSlotAvailability = async (req, res) => {
  try {
    const { spaceId, vehicleType, increment } = req.body;
    
    const parkingSpace = await ParkingSpace.findOne({ spaceId });
    if (!parkingSpace) {
      return res.status(404).json({
        success: false,
        message: 'Parking space not found'
      });
    }

    const slot = parkingSpace.vehicleSlots.find(s => s.vehicleType === vehicleType);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle type slot not found'
      });
    }

    if (increment && slot.availableSlots >= slot.totalSlots) {
      return res.status(400).json({
        success: false,
        message: 'No more slots can be added'
      });
    }

    if (!increment && slot.availableSlots <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No available slots to remove'
      });
    }

    slot.availableSlots += increment ? 1 : -1;
    await parkingSpace.save();

    res.status(200).json({
      success: true,
      message: 'Slot availability updated successfully',
      availableSlots: slot.availableSlots
    });
  } catch (error) {
    console.error('Error updating slot availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update slot availability',
      error: error.message
    });
  }
};
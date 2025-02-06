const mongoose = require('mongoose');

const vehicleSlotSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    required: [true, 'Vehicle type is required'],
    enum: {
      values: ['Car', 'Motorcycle', 'Bus', 'Truck', 'Bicycle', 'Van'],
      message: '{VALUE} is not a valid vehicle type'
    }
  },
  totalSlots: {
    type: Number,
    required: [true, 'Total slots is required'],
    min: [1, 'Total slots must be at least 1']
  },
  availableSlots: {
    type: Number,
    min: [0, 'Available slots cannot be negative']
  },
  pricePerHour: {
    type: Number,
    required: [true, 'Price per hour is required'],
    min: [0, 'Price must be a positive number']
  },
  dimensions: {
    length: {
      type: Number,
      required: [true, 'Length is required'],
      min: [0, 'Length must be positive']
    },
    width: {
      type: Number,
      required: [true, 'Width is required'],
      min: [0, 'Width must be positive']
    },
    height: {
      type: Number,
      required: [true, 'Height is required'],
      min: [0, 'Height must be positive']
    }
  }
});

const parkingSpaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Parking space name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    minlength: [5, 'Address must be at least 5 characters long'],
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  type: {
    type: String,
    required: [true, 'Parking space type is required'],
    enum: {
      values: ['Open', 'Covered', 'Underground', 'Multilevel', 'Indoor', 'Outdoor'],
      message: '{VALUE} is not a valid parking space type'
    },
    set: function(val) {
      return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
    }
  },
  vehicleSlots: [vehicleSlotSchema],
  latitude: {
    type: Number,
    required: [true, 'Latitude is required'],
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required'],
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  facilities: [{
    type: String,
    trim: true,
    maxlength: [50, 'Facility name cannot exceed 50 characters']
  }],
  spaceId: {
    type: String,
    required: [true, 'Space ID is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Space ID cannot exceed 50 characters']
  },
  isOpen: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Virtual for calculating total capacity
parkingSpaceSchema.virtual('totalCapacity').get(function() {
  return this.vehicleSlots.reduce((total, slot) => total + slot.totalSlots, 0);
});

// Virtual for calculating total available slots
parkingSpaceSchema.virtual('totalAvailableSlots').get(function() {
  return this.vehicleSlots.reduce((total, slot) => total + slot.availableSlots, 0);
});

// Virtual for calculating daily potential revenue
parkingSpaceSchema.virtual('dailyPotentialRevenue').get(function() {
  return this.vehicleSlots.reduce((total, slot) => 
    total + (slot.totalSlots * slot.pricePerHour * 24), 0
  );
});

// Geospatial index for efficient nearby queries
parkingSpaceSchema.index({ latitude: 1, longitude: 1 });

// Pre-save middleware to set initial available slots
parkingSpaceSchema.pre('save', function(next) {
  if (this.isNew) {
    this.vehicleSlots.forEach(slot => {
      if (slot.availableSlots === undefined) {
        slot.availableSlots = slot.totalSlots;
      }
    });
  }
  next();
});

module.exports = mongoose.model('ParkingSpace', parkingSpaceSchema);

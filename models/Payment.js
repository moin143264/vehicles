const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  latitude: { 
    type: Number, 
    required: true 
  },
  longitude: { 
    type: Number, 
    required: true 
  },
  userEmail: {
    type: String,
    required: true
  },
  numberPlate: {
    type: String,
    required: true
  },
  vehicleType: {
    type: String,
    required: true
  },
  parkingSpace: {
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'Open'
    }
  },
  bookingDate: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  paymentIntentId: {
    type: String,
    required: true,
    unique: true  // This creates an index automatically
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    default: 'stripe'
  },
  bookingStatus: {
    type: String,
    enum: ['confirmed', 'cancelled', 'completed'],
    default: 'confirmed'
  },
  // In Payment.js, add this field to your existing schema
parkingStatus: {
  type: String,
  enum: ['parked', 'unparked'],
  default: 'parked'
}
  ,
  bookingId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return 'BOOK' + Math.floor(Math.random() * 1000000); // Generate a unique booking ID
    }
  }
}, {
  timestamps: true
});

// Only create the userId index since paymentIntentId already has an index due to unique: true
paymentSchema.index({ userId: 1, createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
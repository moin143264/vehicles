const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }, // Added explicit role
  pushToken: { type: String, default: null },
  deviceInfo: {
    type: {
      deviceType: { type: String, enum: ['ios', 'android'], default: 'android' },
      isEmulator: { type: Boolean, default: false },
      deviceName: { type: String, default: 'unknown' },
      deviceId: { type: String },
      lastUpdated: { type: Date, default: Date.now }
    },
    default: {}
  }
}, { timestamps: true });

// Enhanced pre-save hook for password hashing
UserSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    
    // Hash the password along with the salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    return next(error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
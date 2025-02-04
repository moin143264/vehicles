const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Your User model
const router = express.Router();

// Helper function to generate JWT token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Middleware to authenticate the token
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', ''); // Get token from the Authorization header
  if (!token) return res.status(403).send('Access denied');

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send('Access denied');
    req.user = user;  // Attach user info to the request object
    next(); 
  });
};

// Register a new user
// routes/auth.js
router.post('/register', async (req, res) => {
  const { name, email, password, pushToken, deviceInfo } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      // Update push token if user exists
      if (pushToken) {
        userExists.pushToken = pushToken;
        userExists.deviceInfo = {
          ...deviceInfo,
          lastUpdated: new Date()
        };
        await userExists.save();
      }
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({
      name,
      email,
      password,
      pushToken,
      deviceInfo: {
        ...deviceInfo,
        lastUpdated: new Date()
      }
    });
    await user.save();

    // Log for debugging
    console.log('User registered:', {
      email,
      pushToken,
      deviceInfo
    });

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});
// Login a user
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  try {
    // Admin credentials check
    const adminEmail = 'admin@example.com';
    const adminPassword = 'admin123';

    if (email === adminEmail) {
      // Strict admin login validation
      if (password !== adminPassword) {
        return res.status(400).json({ error: 'Invalid admin credentials' });
      }

      // Ensure role is admin when using admin credentials
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Admin credentials can only be used with admin role' });
      }

      // Generate admin token
      const token = generateToken('admin', 'admin');
      return res.json({
        token,
        name: 'Admin',
        role: 'admin',
        _id: 'admin',
      });
    }

    // Regular user login
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Password validation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Role selection logic
    if (role === 'admin') {
      return res.status(403).json({ error: 'Regular user cannot login as admin' });
    }

    // Generate token for the user
    const token = generateToken(user._id, 'user');

    // Send response
    res.json({
      token,
      name: user.name,
      role: 'user', // Always set as user
      _id: user._id,
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login process failed' });
  }
});



// Admin: Fetch all users (protected)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Check if the user has an admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const users = await User.find(); // Fetch all users from the database
    res.status(200).json(users); // Respond with the list of users
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Admin: Delete a user (protected)
router.delete('/users/:userId', authenticateToken, async (req, res) => {
  try {
    // Check if the user has an admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.status(200).send('User deleted successfully');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).send('Error deleting user');
  }
});

// API endpoint to fetch user profile data
router.get('/user-profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);  // Get user data using the user ID from the token
    if (!user) return res.status(404).send('User not found');

    // Send the user's data (exclude the password)
    res.status(200).send({
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// API endpoint to update user profile data
router.put('/update-profile', authenticateToken, async (req, res) => {
  const { name, email } = req.body;  // Get new data from request body

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send('User not found');

    // Update user profile
    user.name = name || user.name;
    user.email = email || user.email;

    // Save updated user data
    await user.save();

    res.status(200).send({
      message: 'Profile updated successfully',
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).send('Server error');
  }
});

module.exports = router;

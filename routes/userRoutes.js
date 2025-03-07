const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); // Your User model
const router = express.Router();
const nodemailer = require("nodemailer");

// Helper function to generate JWT token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// Middleware to authenticate the token
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", ""); // Get token from the Authorization header
  if (!token) return res.status(403).send("Access denied");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Access denied");
    req.user = user; // Attach user info to the request object
    next();
  });
};

// Register a new user
// routes/auth.js
const otpStore = new Map();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: `"ParkMasterPro" <${process.env.EMAIL_USER}>`, // Custom sender name
    to: email,
    subject: "Registration OTP",
    text: `Your OTP for registration is: ${otp}`,
  };

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    await transporter.sendMail(mailOptions);
    otpStore.set(email, { otp, timestamp: Date.now() });

    setTimeout(() => {
      otpStore.delete(email);
    }, 300000);

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const storedData = otpStore.get(email);

  if (!storedData) {
    return res.status(400).json({ error: "OTP expired or not found" });
  }

  if (storedData.otp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  if (Date.now() - storedData.timestamp > 300000) {
    otpStore.delete(email);
    return res.status(400).json({ error: "OTP expired" });
  }

  otpStore.delete(email);
  res.status(200).json({ success: true });
});

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

router.post("/register", async (req, res) => {
  const { name, email, password, pushToken, deviceInfo } = req.body;

  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "User already exists" });
    }

    // const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password,
      pushToken,
      deviceInfo: {
        ...deviceInfo,
        lastUpdated: new Date(),
      },
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Error registering user" });
  }
});
// Login a user
router.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  try {
    // Admin credentials check
    const adminEmail = "admin@example.com";
    const adminPassword = "admin123";

    if (email === adminEmail) {
      // Strict admin login validation
      if (password !== adminPassword) {
        return res.status(400).json({ error: "Invalid admin credentials" });
      }

      // Ensure role is admin when using admin credentials
      if (role !== "admin") {
        return res.status(403).json({
          error: "Admin credentials can only be used with admin role",
        });
      }

      // Generate admin token
      const token = generateToken("admin", "admin");
      return res.json({
        token,
        name: "Admin",
        role: "admin",
        _id: "admin",
      });
    }

    // Regular user login
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Password validation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Role selection logic
    if (role === "admin") {
      return res
        .status(403)
        .json({ error: "Regular user cannot login as admin" });
    }

    // Generate token for the user
    const token = generateToken(user._id, "user");

    // Send response
    res.json({
      token,
      name: user.name,
      role: "user", // Always set as user
      _id: user._id,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login process failed" });
  }
});

// Admin: Fetch all users (protected)
router.get("/users", authenticateToken, async (req, res) => {
  try {
    // Check if the user has an admin role
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const users = await User.find(); // Fetch all users from the database
    res.status(200).json(users); // Respond with the list of users
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Admin: Delete a user (protected)
router.delete("/users/:userId", authenticateToken, async (req, res) => {
  try {
    // Check if the user has an admin role
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).send("User not found");
    }
    res.status(200).send("User deleted successfully");
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("Error deleting user");
  }
});

// API endpoint to fetch user profile data
router.get("/user-profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id); // Get user data using the user ID from the token
    if (!user) return res.status(404).send("User not found");

    // Send the user's data (exclude the password)
    res.status(200).send({
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// API endpoint to update user profile data
router.put("/update-profile", authenticateToken, async (req, res) => {
  const { name, email } = req.body; // Get new data from request body

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).send("User not found");

    // Update user profile
    user.name = name || user.name;
    user.email = email || user.email;

    // Save updated user data
    await user.save();

    res.status(200).send({
      message: "Profile updated successfully",
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
});
router.post('/forgot', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send('User not found');

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

    // Send OTP to the user's email
    await transporter.sendMail({
        from: `"EV Charging Office" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your OTP for Password Reset',
        html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
    });

    // Set OTP expiration time in Asia/Kolkata timezone
    const expiresAt = moment.tz('Asia/Kolkata').add(5, 'minutes').valueOf(); // Current time in Asia/Kolkata + 5 minutes
    otpStore.set(email, { otp, expiresAt });

    console.log("Generated OTP:", otp);
    console.log("OTP expires at (Asia/Kolkata):", moment.tz(expiresAt, 'Asia/Kolkata').format("YYYY-MM-DD HH:mm:ss")); // Log in Asia/Kolkata time only

    res.send('OTP sent to your email');
});

// Verify the OTP
router.post('/verify-otpp', async (req, res) => {
    const { email, otp } = req.body;

    const storedOtpData = otpStore.get(email);
    if (!storedOtpData) {
        console.log("OTP not found in store for email:", email);
        return res.status(400).json({ error: "OTP not found or expired" });
    }

    console.log("Stored OTP Data:", storedOtpData); // Log stored OTP data
    console.log("Provided OTP:", otp);
    const currentTime = moment.tz('Asia/Kolkata').valueOf(); // Get current time in Asia/Kolkata
    console.log("Current time (Asia/Kolkata):", moment.tz(currentTime, 'Asia/Kolkata').format("YYYY-MM-DD HH:mm:ss"));
    console.log("OTP expires at (Asia/Kolkata):", moment.tz(storedOtpData.expiresAt, 'Asia/Kolkata').format("YYYY-MM-DD HH:mm:ss"));

    if (storedOtpData.otp !== otp) {
        console.log("OTP mismatch for email:", email);
        otpStore.delete(email); // Remove expired OTP
        return res.status(400).json({ error: "Invalid OTP" });
    }

    if (storedOtpData.expiresAt < currentTime) {
        otpStore.delete(email); // Remove expired OTP
        console.log("OTP expired for email:", email);
        return res.status(400).json({ error: "OTP expired" });
    }

    otpStore.delete(email); // Optionally remove OTP after successful verification
    res.json({ message: "OTP verified successfully" });
});
// Reset Password
router.post('/reset', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).send('User not found');

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.findByIdAndUpdate(user._id, { password: hashedPassword });
        res.send('Password has been updated');
    } catch (error) {
        res.status(500).send('Error updating password');
    }
});
module.exports = router;

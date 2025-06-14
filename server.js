require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const cors = require("cors");
const jwt = require("jsonwebtoken"); // Added this import
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const moment = require("moment");
const cron = require("node-cron");
const userRoutes = require("./routes/userRoutes");
const User = require("./models/User"); // Added import for User model
const app = express();
const { authenticateToken } = require("./middleware/auth");
//routes
const parkingRoutes = require("./routes/parkingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const ParkingSpace = require("./models/ParkingSpace");
const Payment = require("./models/Payment");
const nodemailer = require("nodemailer");

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((error) => console.error("MongoDB connection error:", error));

// Routes
app.use("/users", userRoutes);
app.use("/api", userRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/api/payments", paymentRoutes);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use your app password here
  },
});
app.get("/", (req, res) => {
  res.status(200).send({
    success: true,
    msg: "running",
  });
});
// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});
const sendBookingNotifications = async () => {
  try {
    const bookings = await Payment.find({
      status: { $in: ["pending", "confirmed"] },
    });

    for (const booking of bookings) {
      const user = await User.findById(booking.userId); // Get the user associated with the booking
      if (!user || !user.pushToken || !user.timezone) continue; // Skip if user, push token, or timezone is not found

      // Get the current time in the user's local timezone
      const now = moment.tz(user.timezone); // Use moment-timezone to get local time

      const startTime = moment.tz(booking.startTime, user.timezone); // Convert start time to user's local time
      const endTime = moment.tz(booking.endTime, user.timezone); // Convert end time to user's local time

      // Check if the booking is upcoming (within 10 minutes)
      if (
        startTime.diff(now, "minutes") <= 10 &&
        booking.status === "pending"
      ) {
        await sendNotification(
          user.pushToken,
          "Upcoming Booking",
          `Your booking at ${booking.stationName} starts in less than 10 minutes!`,
          { bookingId: booking._id }
        );
      }
      // Check if the booking has expired
      else if (
        endTime.diff(now, "minutes") <= 0 &&
        booking.status !== "expired"
      ) {
        await Payment.findByIdAndUpdate(booking._id, { status: "expired" }); // Update booking status
        await sendNotification(
          user.pushToken,
          "Booking Expired",
          `Your booking at ${booking.stationName} has ended. Thank you for using our service!`,
          { bookingId: booking._id }
        );
      }
    }
  } catch (error) {
    console.error("Error sending booking notifications:", error);
  }
};
cron.schedule("*/5 * * * *", sendBookingNotifications);
const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
const TOKEN_EXPIRATION_TIME = "7d"; // Increase to 7 days for better user experience

app.post("/renew-token", async (req, res) => {
  // Remove authenticateToken middleware since the token is expired
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    // Verify the token but ignore expiration
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });

    // Create new token with the same user info
    const newToken = jwt.sign(
      { id: decoded.id, email: decoded.email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION_TIME }
    );

    res.json({ token: newToken });
  } catch (error) {
    console.error("Token renewal error:", error);
    res.status(403).json({ error: error.message });
  }
});

// Endpoint to validate the token
app.post("/validate-token", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      isValid: false,
      error: "Token is required",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isValid: true });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({
        isValid: false,
        error: "Token expired",
        expired: true, // Add flag to indicate expiration
      });
    }
    res.status(403).json({
      isValid: false,
      error: error.message,
    });
  }
});

// API endpoint to fetch user profile data
app.get("/user-profile", authenticateToken, async (req, res) => {
  console.log("Route /user-profile accessed");
  try {
    const user = await User.findById(req.user.id); // Using the user ID from the token
    if (!user) return res.status(404).send("User not found");

    res.status(200).send(user); // Send user data back to frontend
  } catch (error) {
    res.status(500).send("Server error");
  }
});
//nearbystation
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

app.get("/parking", async (req, res) => {
  const { latitude, longitude, date } = req.query;

  if (!latitude || !longitude) {
    return res
      .status(400)
      .json({ message: "Latitude and longitude are required" });
  }

  try {
    const parkingSpaces = await ParkingSpace.find();
    console.log(`Total parking spaces in database: ${parkingSpaces}`);

    // Format the query date to match booking date format (YYYY-MM-DD)
    const queryDate = new Date(date).toISOString().split("T")[0];

    // Get current time in HH:mm format (ensure it's in the correct timezone)
    const currentTime = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata", // Change to your local timezone if needed
    });

    // Get all bookings for the given date that are still active (not expired)
    const bookings = await Payment.find({
      bookingDate: queryDate,
      paymentStatus: "completed",
      bookingStatus: "confirmed",
      endTime: { $gt: currentTime }, // Only consider bookings that haven't ended yet
    });

    console.log("Found active bookings:", bookings); // Debug log

    // Debug each parking space distance
    parkingSpaces.forEach((space) => {
      const distance = getDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        space.latitude,
        space.longitude
      );
      console.log(`\nParking Space: ${space.name}`);
      console.log(`Location: ${space.latitude}, ${space.longitude}`);
      console.log(`Distance from user: ${distance.toFixed(2)}km`);
      console.log(`Within 10km range: ${distance <= 10 ? "YES" : "NO"}`);
    });

    console.log("Fetched bookings:", bookings); // Debug log

    const nearbyParkingSpaces = parkingSpaces.filter((parkingSpace) => {
      const distance = getDistance(
        parseFloat(latitude),
        parseFloat(longitude),
        parkingSpace.latitude,
        parkingSpace.longitude
      );
      return distance <= 10;
    });

    // Log the nearby parking spaces for debugging
    console.log("Nearby parking spaces:", nearbyParkingSpaces); // Debug log

    const formattedParkingSpaces = nearbyParkingSpaces.map((parkingSpace) => {
      // Log current time for debugging
      console.log("Current Time:", currentTime); // Debug log

      const spaceBookings = bookings.filter((booking) => {
        console.log(`Checking booking for parking space ${parkingSpace._id}:`);
        console.log(
          `Booking Start Time: ${booking.startTime}, End Time: ${booking.endTime}`
        ); // Debug log

        const isCurrentBooking =
          booking.parkingSpace.id === parkingSpace._id.toString() &&
          booking.startTime <= currentTime &&
          booking.endTime > currentTime;

        return isCurrentBooking;
      });

      console.log(
        `Active bookings for space ${parkingSpace._id}:`,
        spaceBookings
      ); // Debug log

      const updatedVehicleSlots = parkingSpace.vehicleSlots.map((slot) => {
        // Count only currently active bookings for this vehicle type
        const bookedSlotsCount = spaceBookings.filter(
          (booking) =>
            booking.vehicleType.toLowerCase() === slot.vehicleType.toLowerCase()
        ).length;

        console.log(
          `Vehicle type ${slot.vehicleType} - Currently booked slots: ${bookedSlotsCount}`
        ); // Debug log

        // Get upcoming bookings for this slot type
        const upcomingBookings = bookings.filter(
          (booking) =>
            booking.parkingSpace.id === parkingSpace._id.toString() &&
            booking.vehicleType.toLowerCase() ===
              slot.vehicleType.toLowerCase() &&
            booking.startTime > currentTime
        );

        return {
          vehicleType: slot.vehicleType,
          availableSlots: Math.max(0, slot.totalSlots - bookedSlotsCount),
          totalSlots: slot.totalSlots,
          pricePerHour: slot.pricePerHour,
          dimensions: slot.dimensions,
          upcomingBookings: upcomingBookings.map((booking) => ({
            startTime: booking.startTime,
            endTime: booking.endTime,
          })),
        };
      });

      const totalAvailableSlots = updatedVehicleSlots.reduce(
        (sum, slot) => sum + slot.availableSlots,
        0
      );

      return {
        id: parkingSpace._id,
        name: parkingSpace.name,
        address: parkingSpace.address,
        type: parkingSpace.type,
        latitude: parkingSpace.latitude,
        longitude: parkingSpace.longitude,
        facilities: parkingSpace.facilities,
        isOpen: parkingSpace.isOpen,
        vehicleSlots: updatedVehicleSlots,
        totalAvailableSlots: totalAvailableSlots,
        totalCapacity: parkingSpace.totalCapacity,
      };
    });

    // Add a scheduled task to automatically update booking status
    const expiredBookings = await Payment.updateMany(
      {
        bookingDate: queryDate,
        bookingStatus: "confirmed",
        endTime: { $lte: currentTime },
      },
      {
        $set: { bookingStatus: "completed" },
      }
    );

    if (expiredBookings.modifiedCount > 0) {
      console.log(
        `Updated ${expiredBookings.modifiedCount} expired bookings to completed status`
      );

      // Now free up the slots for these bookings
      expiredBookings.forEach((booking) => {
        const parkingSpace = parkingSpaces.find(
          (space) => space._id.toString() === booking.parkingSpace.id
        );
        if (parkingSpace) {
          parkingSpace.vehicleSlots.forEach((slot) => {
            if (
              slot.vehicleType.toLowerCase() ===
              booking.vehicleType.toLowerCase()
            ) {
              slot.availableSlots += 1; // Free up one slot
              console.log(
                `Freed up a slot for vehicle type ${slot.vehicleType} in parking space ${parkingSpace.name}`
              );
            }
          });
        }
      });
    }

    return res.json(formattedParkingSpaces);
  } catch (error) {
    console.error("Error fetching parking spaces:", error);
    return res.status(500).json({
      message: "Error fetching parking spaces. Please try again later.",
      error: error.message,
    });
  }
});
// Add this after your MongoDB connection
mongoose.connection.once("open", async () => {
  try {
    const collection = mongoose.connection.collection("payments");

    // Get list of indexes
    const indexes = await collection.indexes();

    // Find and drop the problematic index if it exists
    const problematicIndex = indexes.find(
      (index) => index.name === "paymentID_1"
    );
    if (problematicIndex) {
      await collection.dropIndex("paymentID_1");
      console.log("Dropped problematic index");
    }

    // Ensure our new indexes exist
    await collection.createIndex({ paymentIntentId: 1 }, { unique: true });
    await collection.createIndex({ userId: 1, createdAt: -1 });

    console.log("Indexes updated successfully");
  } catch (error) {
    console.error("Error updating indexes:", error);
  }
});
//admin//paymentmanage
app.get("/payments", async (req, res) => {
  try {
    const currentDate = new Date();
    const { date } = req.query;

    const allPayments = await Payment.find();

    const filteredPayments = allPayments.filter((payment) => {
      try {
        // Ensure bookingDate is a Date object
        const bookingDate =
          payment.bookingDate instanceof Date
            ? payment.bookingDate
            : new Date(payment.bookingDate);

        // Compare dates
        const filterDate = date ? new Date(date) : currentDate;

        return (
          bookingDate.getFullYear() === filterDate.getFullYear() &&
          bookingDate.getMonth() === filterDate.getMonth() &&
          bookingDate.getDate() === filterDate.getDate()
        );
      } catch (parseError) {
        console.error(`Error parsing date for payment: ${parseError.message}`);
        return false;
      }
    });

    res.json(filteredPayments);
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).send("Server Error");
  }
});
// Cron job for alerting based on booking times
app.get("/ap/payments", async (req, res) => {
  try {
    const { userId, userEmail } = req.query;

    console.log("Searching for payments with:", {
      userId: userId || "not provided",
      userEmail: userEmail || "not provided",
    });

    if (!userId && !userEmail) {
      console.log("Error: No userId or userEmail provided");
      return res.status(400).json({
        success: false,
        message: "Either userId or userEmail is required",
      });
    }

    // Create query object based on available parameters
    const query = {};
    if (userId) query.userId = userId;
    if (userEmail) query.userEmail = userEmail;

    console.log("MongoDB query:", JSON.stringify(query, null, 2));

    // First check if any payments exist
    const count = await Payment.countDocuments(query);
    console.log(`Found ${count} payments matching query`);

    const payments = await Payment.find(query)
      .sort({ bookingDate: -1, startTime: -1 })
      .lean();

    console.log(`Successfully retrieved ${payments.length} payments`);

    // Log a sample of the data (first payment if exists)
    if (payments.length > 0) {
      console.log("Sample payment data:", JSON.stringify(payments[0], null, 2));
    }

    res.json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    console.error("Error in /payments route:", error);
    console.error("Stack trace:", error.stack);

    res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
      errorType: error.name,
      errorStack:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});
cron.schedule("* * * * *", async () => {
  const now = moment().utc(); // Current time in UTC
  const startOfDay = moment().startOf("day").utc(); // Start of today in UTC
  const endOfDay = moment().endOf("day").utc(); // End of today in UTC

  try {
    // Fetch today's pending bookings
    const payments = await Payment.find({
      status: "pending",
      selectedDate: { $gte: startOfDay.toDate(), $lte: endOfDay.toDate() },
    });

    payments.forEach(async (payments) => {
      const user = await user.findById(payments.userId); // Fetch user to get push token
      if (!user || !user.pushToken) return; // Ensure user and pushToken exist

      const pushToken = user.pushToken;
      const startTime = moment(
        `${payments.selectedDate.toISOString().split("T")[0]}T${
          payments.startTime
        }:00`
      ).utc();
      const endTime = payments.endTime
        ? moment(
            `${payments.selectedDate.toISOString().split("T")[0]}T${
              payments.endTime
            }:00`
          ).utc()
        : null;

      // Check if the booking is arriving in 10 minutes
      if (
        startTime.diff(now, "minutes") <= 10 &&
        payments.status === "pending"
      ) {
        console.log(`Upcoming Booking Alert for ${payments.stationName}`);
        await Payment.findByIdAndUpdate(payments._id, { status: "arrived" });

        // Send notification for upcoming booking
        await sendNotification(
          pushToken,
          "Upcoming Booking",
          `Your booking at ${payments.stationName} starts in less than 10 minutes!`,
          { bookingId: payments._id } // Optional additional data
        );
      }
      // Check if the booking has expired
      else if (
        endTime &&
        endTime.diff(now, "minutes") <= 0 &&
        payments.status !== "expired"
      ) {
        console.log(`Booking Expired Alert for ${payments.stationName}`);
        await Payment.findByIdAndUpdate(payments._id, { status: "expired" });

        // Send notification for expired booking
        await sendNotification(
          pushToken,
          "Booking Expired",
          `Your booking at ${payments.stationName} has ended. Thank you for using our service!`,
          { bookingId: payments._id }
        );
      }
    });
  } catch (error) {
    console.error("Error processing notifications:", error);
  }
});
//manageparking & panelty
// Get active bookings
app.get("/active-bookings", async (req, res) => {
  try {
    const currentDate = new Date().toISOString().split("T")[0];

    const activeBookings = await Payment.find({
      bookingDate: currentDate,
      bookingStatus: "confirmed",
      parkingStatus: "parked",
      paymentStatus: "completed",
    });

    res.json(activeBookings);
  } catch (error) {
    console.error("Error fetching active bookings:", error);
    res.status(500).json({ message: "Error fetching active bookings" });
  }
});

// Handle vehicle checkout
app.post("/checkout/:bookingId", async (req, res) => {
  try {
    const { overtimeCharges } = req.body;
    const booking = await Payment.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.parkingStatus = "unparked";

    // If there are overtime charges, update the total amount
    if (overtimeCharges > 0) {
      booking.totalAmount += overtimeCharges;
    }

    await booking.save();

    res.json({
      message: "Vehicle checked out successfully",
      booking,
    });
  } catch (error) {
    console.error("Error checking out vehicle:", error);
    res.status(500).json({ message: "Error checking out vehicle" });
  }
});
//panelty

// Get active bookings for a specific user
app.get("/active-bookings/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching bookings for userId:", userId); // Debug log

    const currentDate = new Date().toISOString().split("T")[0];

    // Make sure to match the userId field name exactly as it is in your database
    const activeBookings = await Payment.find({
      userId: userId, // This should match exactly how userId is stored in your Payment model
      bookingDate: currentDate,
      bookingStatus: "confirmed",
      parkingStatus: "parked",
      paymentStatus: "completed",
    }).sort({ createdAt: -1 });

    res.json(activeBookings);
  } catch (error) {
    console.error("Error fetching active bookings:", {
      error: error.message,
      userId: req.params.userId,
    });
    res.status(500).json({
      message: "Error fetching active bookings",
      details: error.message,
    });
  }
});
// Create payment intent for penalty
// In your backend routes
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "inr",
      payment_method_types: ["card"],
    });

    // Send only the client secret
    res.json({
      clientSecret: paymentIntent.client_secret, // This is the important part
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ message: "Error creating payment intent" });
  }
});

// Handle vehicle checkout
app.post("/checkout/:bookingId", async (req, res) => {
  try {
    const { overtimeCharges, paymentIntentId } = req.body;
    const booking = await Payment.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.parkingStatus = "unparked";

    if (overtimeCharges > 0) {
      booking.totalAmount += overtimeCharges;
      if (paymentIntentId) {
        booking.paymentIntentId = paymentIntentId;
      }
    }

    await booking.save();

    res.json({
      message: "Vehicle checked out successfully",
      booking,
    });
  } catch (error) {
    console.error("Error checking out vehicle:", error);
    res.status(500).json({ message: "Error checking out vehicle" });
  }
});
app.get("/parking-spaces", async (req, res) => {
  try {
    const parkingSpaces = await ParkingSpace.find(); // Fetch parking spaces from the database
    res.json(parkingSpaces); // Send the fetched parking spaces as a response
  } catch (error) {
    console.error("Error fetching parking spaces:", error);
    res.status(500).json({
      message: "Error fetching parking spaces. Please try again later.",
      error: error.message,
    });
  }
});
//
app.post("/api/send-email", async (req, res) => {
  try {
    // Validate request
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: to, subject, or html",
      });
    }

    // Verify token
    const token = req.headers.authorization;
    if (!token || !token.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Configure email options
    const mailOptions = {
      from: `"ParkMasterPro" <${process.env.EMAIL_USER}>`, // Custom sender name
      to,
      subject,
      html,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Return success response
    res.json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Email sending error:", error);

    // Return error in JSON format
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send email",
    });
  }
});
   app.post('/api/push-token', (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }

    // Here you can save the token to your database or perform any other logic
    console.log('Received push token:', token);

    // Respond with success
    res.status(200).json({ message: 'Token received successfully' });
});
app.post('/send-notification', async (req, res) => {
  const { token, title, body } = req.body;

  const message = {
    to: token,
    sound: 'default',
    title: title,
    body: body,
  };

  try {
    const response = await axios.post('https://exp.host/--/api/v2/push/send', message);
    
    if (response.data && response.data.errors) {
      console.error('Push notification errors:', response.data.errors);
      return res.status(400).send({ success: false, message: 'Failed to send notification', errors: response.data.errors });
    }

    return res.status(200).send({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending notification:', error.response ? error.response.data : error.message);
    return res.status(500).send({ success: false, message: 'Error sending notification', error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);


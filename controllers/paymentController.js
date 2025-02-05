const Payment = require("../models/Payment");
const ParkingSpace = require("../models/ParkingSpace");
const User = require("../models/User");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createError } = require("../utils/error");

const paymentController = {
  createPaymentIntent: async (req, res, next) => {
    try {
      const { totalAmount, parkingSpace } = req.body;

      if (!parkingSpace || !parkingSpace.id) {
        return next(createError(404, "Parking space not found"));
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Convert to cents
        currency: "inr",
        metadata: {
          parkingSpaceId: parkingSpace.id,
          userId: req.user.id,
        },
      });

      res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      next(createError(500, "Failed to create payment intent"));
    }
  },

  confirmPayment: async (req, res, next) => {
    try {
      const {
        paymentIntentId,
        duration,
        latitude,
        longitude,
        numberPlate,
        parkingSpace,
        bookingDate,
        startTime,
        totalAmount,
        userEmail,
        vehicleType,
        endTime,
      } = req.body;

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );
      if (paymentIntent.status !== "succeeded") {
        return next(createError(400, "Payment not successful"));
      }

      // Create payment record
      const payment = new Payment({
        userId: req.user.id,
        latitude,
        longitude,
        userEmail,
        numberPlate,
        vehicleType,
        parkingSpace: {
          id: parkingSpace.id,
          name: parkingSpace.name,
          address: parkingSpace.address,
          type: parkingSpace.type,
        },
        bookingDate: bookingDate,
        startTime,
        duration,
        totalAmount,
        endTime,
        paymentIntentId,
        paymentStatus: "completed",
      });

      await payment.save();

      // Update parking space bookings
      await ParkingSpace.findByIdAndUpdate(parkingSpace.id, {
        $push: {
          bookings: {
            paymentId: payment._id,
            userId: req.user.id,
            vehicleType,
            numberPlate,
            startTime,
            endTime,
            bookingDate,
            duration,
          },
        },
      });

      // Update user's bookings
      await User.findByIdAndUpdate(req.user.id, {
        $push: {
          bookings: payment._id,
        },
      });

      res.status(200).json({
        success: true,
        payment: {
          _id: payment._id,
          parkingSpace: payment.parkingSpace,
          bookingDate: payment.bookingDate,
          startTime: payment.startTime,
          duration: payment.duration,
          totalAmount: payment.totalAmount,
          numberPlate: payment.numberPlate,
          vehicleType: payment.vehicleType,
          paymentStatus: payment.paymentStatus,
          endTime: payment.endTime,
        },
      });
    } catch (error) {
      console.error("Error confirming payment:", error);
      next(createError(500, "Failed to confirm payment"));
    }
  },

  getPaymentHistory: async (req, res, next) => {
    try {
      const payments = await Payment.find({ userId: req.user.id }).sort({
        createdAt: -1,
      });

      res.status(200).json(payments);
    } catch (error) {
      next(createError(500, "Failed to fetch payment history"));
    }
  },

  getPaymentDetails: async (req, res, next) => {
    try {
      const payment = await Payment.findOne({
        _id: req.params.paymentId,
        userId: req.user.id,
      });

      if (!payment) {
        return next(createError(404, "Payment not found"));
      }

      res.status(200).json(payment);
    } catch (error) {
      next(createError(500, "Failed to fetch payment details"));
    }
  },
};

module.exports = paymentController;

const getAllPayments = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const payments = await Payment.find({ userId: userId }).sort({
      createdAt: -1,
    });

    const formattedPayments = payments.map((payment) => {
      return {
        userId: payment.userId,
        latitude: payment.latitude,
        longitude: payment.longitude,
        userEmail: payment.userEmail,
        numberPlate: payment.numberPlate,
        vehicleType: payment.vehicleType,
        parkingSpace: {
          id: payment.parkingSpace.id,
          name: payment.parkingSpace.name,
          address: payment.parkingSpace.address,
          type: payment.parkingSpace.type,
        },
        bookingDate: payment.bookingDate,
        startTime: payment.startTime.toISOString().slice(11, 16), // Extracting HH:mm for startTime
        duration: payment.duration,
        totalAmount: payment.totalAmount,
        paymentIntentId: payment.paymentIntentId,
        paymentStatus: payment.paymentStatus,
        paymentMethod: payment.paymentMethod,
        bookingStatus: payment.bookingStatus,
        bookingId: payment.bookingId,
        endTime: payment.endTime,

        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
    });

    res.status(200).json({ payments: formattedPayments });
  } catch (error) {
    console.error("Error fetching payments:", error.message);
    res
      .status(500)
      .json({ message: "Error fetching payments", error: error.message });
  }
};

module.exports = {
  getAllPayments,
};

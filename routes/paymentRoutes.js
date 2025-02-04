const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('../middleware/auth');

router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    // Destructure with all possible parameter names
    const { 
      totalAmount, 
      amount, // fallback to amount if totalAmount not present
      parkingSpace 
    } = req.body;

    // Log incoming data for debugging
    console.log('Received payment request:', {
      body: req.body,
      totalAmount,
      amount,
      parkingSpace
    });

    // Use totalAmount or fallback to amount
    let paymentAmount = totalAmount || amount;

    // Convert string to number if needed
    if (typeof paymentAmount === 'string') {
      paymentAmount = parseFloat(paymentAmount);
    }
    
    // Convert to paise (smallest currency unit)
    const amountInPaise = Math.round(paymentAmount * 100);

    // Validate the amount
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      console.error('Invalid amount:', { 
        originalAmount: paymentAmount, 
        amountInPaise,
        body: req.body 
      });
      return res.status(400).json({
        error: 'Invalid amount',
        details: 'Amount must be a valid positive number'
      });
    }

    console.log('Creating payment intent with amount:', {
      originalAmount: paymentAmount,
      amountInPaise,
      timestamp: new Date().toISOString()
    });

    // Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaise,
      currency: 'inr',
      payment_method_types: ['card'],
      metadata: {
        parkingSpaceName: typeof parkingSpace === 'string' ? parkingSpace : parkingSpace?.name,
        parkingSpaceId: parkingSpace?.id || ''
      }
    });

    console.log('Payment intent created successfully:', paymentIntent.id);

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      merchantName: "Smart Parking",
      amount: amountInPaise,
      originalAmount: paymentAmount
    });

  } catch (error) {
    console.error('Payment Intent Creation Error:', {
      message: error.message,
      stack: error.stack,
      type: error.type,
      requestBody: req.body
    });

    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        error: 'Payment Failed',
        details: error.message
      });
    }
    return res.status(500).json({
      error: 'Failed to create payment intent',
      details: error.message || 'An unexpected error occurred',
      receivedData: req.body
    });
  }
});

// Confirm payment
router.post('/confirm-payment', authenticateToken, async (req, res) => {
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
      endTime
    } = req.body;

    console.log('Received confirmation request:', req.body);

    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'Missing payment intent ID'
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment not successful',
        status: paymentIntent.status
      });
    }

    let existingPayment = await Payment.findOne({ paymentIntentId });
    
    if (existingPayment) {
      return res.json({
        success: true,
        payment: existingPayment
      });
    }

    // Create new payment with validated data
    const payment = new Payment({
      userId: req.user.id,
      latitude: Number(latitude),
      longitude: Number(longitude),
      userEmail,
      numberPlate,
      vehicleType,
      endTime,         // Add this
      parkingSpace: {
        id: parkingSpace.id,
        name: parkingSpace.name,
        address: parkingSpace.address,
        type: parkingSpace.type || 'Open'
      },
      bookingDate,
      startTime,
      duration: Number(duration),
      totalAmount: parseFloat(totalAmount),
      paymentIntentId,
      paymentStatus: 'completed',
      paymentMethod: 'stripe',
      bookingStatus: 'confirmed'
    });

    try {
      const savedPayment = await payment.save();
      console.log('Payment saved successfully:', savedPayment._id);

      return res.json({
        success: true,
        payment: savedPayment
      });
    } catch (saveError) {
      console.error('Save error:', saveError);
      throw saveError;
    }
  } catch (error) {
    console.error('Payment confirmation error:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    
    res.status(500).json({ 
      error: 'Failed to confirm payment',
      details: error.message,
      receivedData: req.body
    });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment history',
      details: error.message 
    });
  }
});

// Get payment details
router.get('/:paymentId', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      userId: req.user.id
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Payment details fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment details',
      details: error.message 
    });
  }
});
const { getAllPayments } = require('../controllers/paymentController');

// Route to get all payments for a user
router.get('/', getAllPayments);
//

module.exports = router;
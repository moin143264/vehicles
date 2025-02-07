const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error('Token verification error:', err);
        return res.status(403).json({ 
          error: 'Invalid or expired token',
          details: err.message 
        });
      }
      req.user = {
        id: decoded.id,
        email: decoded.email,
        ...decoded
      };
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message 
    });
  }
};

module.exports = {
  authenticateToken
}; 

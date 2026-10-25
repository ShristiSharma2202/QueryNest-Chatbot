const jwt = require('jsonwebtoken');

module.exports = function auth(requiredRole = null) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No authentication token provided' 
      });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE
      });

      // Check if token is expired
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < currentTimestamp) {
        return res.status(401).json({ 
          success: false,
          message: 'Token has expired' 
        });
      }

      req.user = payload;

      // Role-based access control
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ 
          success: false,
          message: 'Insufficient permissions' 
        });
      }

      next();
    } catch (err) {
      console.error('Auth Error:', err.message);
      return res.status(401).json({ 
        success: false,
        message: err.message === 'jwt expired' ? 'Token has expired' : 'Invalid authentication token'
      });
    }
  };
};
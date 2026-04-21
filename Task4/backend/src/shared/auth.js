const jwt = require("jsonwebtoken");
const { jwtSecret, jwtExpiresIn } = require("./config");

function signToken(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      email: user.email,
      role: user.role
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role
  };
}

module.exports = {
  signToken,
  sanitizeUser
};

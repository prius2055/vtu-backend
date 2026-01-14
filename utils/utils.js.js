const crypto = require("crypto");

const generateReferralCode = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
};

module.exports = generateReferralCode;

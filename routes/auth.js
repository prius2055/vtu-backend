const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  verify,
  requestPasswordReset,
  resetPassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.route("/register").post(register);

router.route("/login").post(login);

router.route("/me").get(protect, getMe);

router.route("/verify").get(protect, verify);

router.route("/password/reset").post(requestPasswordReset);
router.route("/password/reset/:token").post(resetPassword);

module.exports = router;

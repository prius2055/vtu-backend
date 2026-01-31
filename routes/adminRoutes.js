const express = require("express");
const router = express.Router();

const { protect, restrictTo } = require("../middleware/auth");
const {
  syncDataPlans,
  updateDataPlanPrice,
} = require("../controllers/adminController");

// /* ------------------------------------
//  * 🔒 ADMIN ONLY ROUTES
//  * ----------------------------------- */

router.get("/data", protect, restrictTo("admin"), syncDataPlans);

router.patch("/data/:id", protect, restrictTo("admin"), updateDataPlanPrice);

module.exports = router;

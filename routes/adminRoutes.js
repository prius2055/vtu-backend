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

router.get("/services", protect, restrictTo("admin"), syncDataPlans);
router.patch(
  "/services/:id",
  protect,
  restrictTo("admin"),
  updateDataPlanPrice
);

module.exports = router;

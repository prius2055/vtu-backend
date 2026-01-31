const express = require("express");
const router = express.Router();
const {
  getAllTransactions,
  getTransaction,
  getUserTransactions,
} = require("../controllers/transactionController");
const { protect, restrictTo } = require("../middleware/auth");

router.use(protect);

router.get("/transactions", protect, restrictTo("admin"), getAllTransactions);

router.get("/", protect, getUserTransactions);

module.exports = router;

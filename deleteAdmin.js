const mongoose = require("mongoose");
const User = require("./models/userModel"); // adjust path if needed

async function deleteAdmin() {
  try {
    await mongoose.connect(process.env.DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await User.deleteOne({ role: "admin" });

    console.log("🗑 Admin delete result:", result);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error deleting admin:", error);
    process.exit(1);
  }
}

deleteAdmin();

const dotenv = require('dotenv');
const mongoose = require('mongoose');
const app = require('./app');

const cron = require("node-cron");
const { syncDataPlansJob } = require("./controllers/vtuController");

dotenv.config({ path: './.env' });

mongoose.connect(process.env.DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.error(err));


const port = process.env.PORT || 4000;

app.get("/api/test", (req, res) => {
  res.json({ message: "Server is running well. Thank you. ✅" });
});


// Runs every day at 2am
cron.schedule("0 2 * * *", async () => {
  console.log("⏰ Auto-syncing data plans...");
  await syncDataPlansJob(); // same logic, no req/res
});

app.listen(port, () => {
  console.log(`Hello App running on port ${port}...`);
});
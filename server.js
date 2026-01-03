const dotenv = require('dotenv');
const mongoose = require('mongoose');
const app = require('./app');


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

app.listen(port, () => {
  console.log(`Hello App running on port ${port}...`);
});
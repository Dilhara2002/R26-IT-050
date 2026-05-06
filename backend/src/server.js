require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;

// 👉 DNS fix

const dns = require('dns').promises;
dns.setServers(['1.1.1.1']);

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB successfully!");
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err.message);
    });
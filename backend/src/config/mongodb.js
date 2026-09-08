const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kisan360';

    // Fail fast instead of letting mongoose buffer queries for ~30s when the
    // database is unreachable (important for live demos).
    mongoose.set('bufferCommands', false);

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log('✅ MongoDB connected successfully to', mongoose.connection.host);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.warn('⚠️ Server will continue without database. Some features may not work.');
  }
};

module.exports = connectDB;

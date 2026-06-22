require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,

  dialectOptions: {
    ...(process.env.DB_SSL === 'true' && {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }),
  },
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Enable pgvector extension (Optional: fails if not installed on system)
    try {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (e) {
      console.warn('⚠️ pgvector extension not available on this system. Vector features will be disabled.');
    }

    // Ensure all required location and contact fields exist in the user table
    try {
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "cityName" VARCHAR(255)');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "placeId" VARCHAR(255)');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "state" VARCHAR(255)');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "country" VARCHAR(255)');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "countryCode" VARCHAR(255)');
      await sequelize.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(255)');
    } catch (e) {
      console.warn('⚠️ Error adding user columns:', e);
    }

    await sequelize.sync({ force: false });
    console.log('✅ Database synced');
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
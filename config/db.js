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

    await sequelize.sync({ force: true });
    console.log('✅ Database synced');
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
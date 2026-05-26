const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');
const { models } = require('../../config/models');

const TravelPlan = sequelize.define(
  'TravelPlan',
  {
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'user',
        key: 'id',
      },
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    destination: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    budget: {
      type: DataTypes.DECIMAL,
      allowNull: false,
    },
    days: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    weatherSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    itinerary: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    bookingLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    hotels: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    travel: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    budgetBreakdown: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    packages: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ...models.defaultAttributes,
  },
  {
    tableName: 'travel_plan',
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = TravelPlan;

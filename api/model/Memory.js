const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');
const { models } = require('../../config/models');

const Memory = sequelize.define(
  'Memory',
  {
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'user',
        key: 'id',
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    embedding: {
      type: DataTypes.TEXT, // Will be cast to vector(1536) in raw SQL or handled via raw query
      allowNull: true,
    },
    ...models.defaultAttributes,
  },
  {
    tableName: 'memory',
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = Memory;

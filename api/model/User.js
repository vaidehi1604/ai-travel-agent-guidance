const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');
const { models } = require('../../config/models');

const User = sequelize.define(
  'User',
  {
    email: {
      type: DataTypes.STRING,
      unique: true,
    },
    name:{
        type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ...models.defaultAttributes,
  },
  {
    tableName: 'user',
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = User;

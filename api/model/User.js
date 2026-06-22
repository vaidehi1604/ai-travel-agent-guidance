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
    cityName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    placeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DOUBLE,
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

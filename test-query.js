const Memory = require('./api/model/Memory');
const { Op } = require('sequelize');
const db = require('./config/db');

(async () => {
  try {
    await db.sequelize.authenticate();
    const history = await Memory.findAll({
      where: {
        metadata: {
          planId: 'some-id'
        }
      }
    });
    console.log("Success");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();

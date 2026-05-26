const { User } = require('./api/model/User');
const db = require('./config/db');
(async () => {
  await db.sync();
  await User.findOrCreate({ where: { email: 'test@example.com' }, defaults: { name: 'Test User', password: 'password', city: 'Ahmedabad' } });
})();

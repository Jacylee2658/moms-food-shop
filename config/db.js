const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'moms_food_shop',
    password: '2008', // CHANGE THIS to your PostgreSQL password
    port: 1234,
});

module.exports = pool;
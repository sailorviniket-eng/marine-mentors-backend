const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'marine_mentors_secret_2025';

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Marine Mentors Backend is running!' });
});

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, classLevel, password } = req.body;
    
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, phone, class_level, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email',
      [fullName, email, phone, classLevel, passwordHash]
    );
    
    const token = jwt.sign({ userId: newUser.rows[0].id }, JWT_SECRET);
    res.json({ success: true, token, user: newUser.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.rows[0].id, fullName: user.rows[0].full_name, email: user.rows[0].email } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get courses
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await pool.query('SELECT * FROM courses WHERE is_active = true ORDER BY id');
    res.json({ success: true, courses: courses.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

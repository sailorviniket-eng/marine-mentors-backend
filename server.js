const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'marine_mentors_secret_2025';

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Marine Mentors Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Test database route
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      success: true, 
      message: 'Database connection successful',
      timestamp: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, classLevel, password } = req.body;
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (full_name, email, phone, class_level, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email',
      [fullName, email, phone, classLevel, passwordHash]
    );
    
    // Generate token
    const token = jwt.sign({ userId: newUser.rows[0].id }, JWT_SECRET);
    
    res.json({
      success: true,
      token,
      user: newUser.rows[0],
      message: 'Registration successful!'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      details: error.message 
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.rows[0].id,
        fullName: user.rows[0].full_name,
        email: user.rows[0].email,
        classLevel: user.rows[0].class_level
      },
      message: 'Login successful!'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      details: error.message 
    });
  }
});

// Get courses
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await pool.query('SELECT * FROM courses WHERE is_active = true ORDER BY id');
    res.json({ 
      success: true, 
      courses: courses.rows 
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch courses',
      details: error.message 
    });
  }
});

// Catch all route
app.get('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    availableRoutes: [
      'GET /health',
      'GET /api/test-db',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/courses'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Marine Mentors Backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;


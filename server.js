const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://marine-mentors-website.netlify.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'marine_mentors_secret_2025';

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Marine Mentors Backend is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test database route
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    
    // Also test if users table exists
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    
    res.json({ 
      success: true, 
      message: 'Database connection successful',
      timestamp: result.rows[0].current_time,
      usersTableExists: tableCheck.rows.length > 0
    });
  } catch (error) {
    console.error('❌ Database test error:', error.message);
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
    
    console.log('📝 Registration attempt for:', email);
    console.log('📋 Request data:', { fullName, email, phone, classLevel, password: '***' });
    
    // Validate required fields
    if (!fullName || !email || !phone || !classLevel || !password) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required (fullName, email, phone, classLevel, password)' 
      });
    }
    
    // Check if user exists
    console.log('🔍 Checking if user exists...');
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({ 
        success: false,
        error: 'User already exists with this email' 
      });
    }
    
    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    console.log('💾 Creating user in database...');
    const newUser = await pool.query(
      `INSERT INTO users (full_name, email, phone, class_level, password_hash, registration_date, is_active, trial_used) 
       VALUES ($1, $2, $3, $4, $5, NOW(), true, false) 
       RETURNING id, full_name, email, class_level, registration_date`,
      [fullName, email, phone, classLevel, passwordHash]
    );
    
    if (newUser.rows.length === 0) {
      throw new Error('Failed to create user - no rows returned');
    }
    
    console.log('✅ User created successfully:', newUser.rows[0]);
    
    // Generate token
    const token = jwt.sign(
      { userId: newUser.rows[0].id, email: newUser.rows[0].email }, 
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Success response
    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token: token,
      user: {
        id: newUser.rows[0].id,
        fullName: newUser.rows[0].full_name,
        email: newUser.rows[0].email,
        classLevel: newUser.rows[0].class_level,
        registrationDate: newUser.rows[0].registration_date
      }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    console.error('📊 Error details:', error);
    res.status(500).json({ 
      success: false,
      error: 'Registration failed: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt for:', email);
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required' 
      });
    }
    
    // Find user
    const user = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (user.rows.length === 0) {
      console.log('❌ User not found or inactive:', email);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!validPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user.rows[0].id, email: user.rows[0].email }, 
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ Login successful for:', email);
    
    res.json({
      success: true,
      message: 'Login successful!',
      token: token,
      user: {
        id: user.rows[0].id,
        fullName: user.rows[0].full_name,
        email: user.rows[0].email,
        classLevel: user.rows[0].class_level
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Login failed: ' + error.message
    });
  }
});

// Get courses
app.get('/api/courses', async (req, res) => {
  try {
    console.log('📚 Fetching courses...');
    const courses = await pool.query('SELECT * FROM courses WHERE is_active = true ORDER BY id');
    
    console.log('✅ Found', courses.rows.length, 'courses');
    
    res.json({ 
      success: true, 
      courses: courses.rows 
    });
  } catch (error) {
    console.error('❌ Get courses error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch courses: ' + error.message
    });
  }
});

// Get user profile (protected route)
app.get('/api/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No valid token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await pool.query(
      'SELECT id, full_name, email, phone, class_level, registration_date FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: user.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Profile error:', error.message);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// Get all users (admin endpoint)
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT id, full_name, email, phone, class_level, registration_date, is_active 
      FROM users 
      ORDER BY registration_date DESC
    `);
    
    res.json({
      success: true,
      users: users.rows,
      total: users.rows.length
    });
  } catch (error) {
    console.error('❌ Get users error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users: ' + error.message
    });
  }
});

// Catch all route
app.get('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    requestedPath: req.originalUrl,
    availableRoutes: [
      'GET /health',
      'GET /api/test-db',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/courses',
      'GET /api/user/profile',
      'GET /api/admin/users'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Marine Mentors Backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Database URL configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  pool.end(() => {
    console.log('📦 Database pool closed');
    process.exit(0);
  });
});

module.exports = app;

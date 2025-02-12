const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const PORT = 3000;
const path = require('path');
const session = require('express-session');

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.static('public')); // Serve static files
app.use(session({
  secret: 'your-secret-key',
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: false, // set to true if using https
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// In-memory recipes storage
const recipes = {
  AppleJuice: {
    title: 'Apple Juice',
    ingredients: ['apples', 'sugar', 'water'],
    steps: ['Wash the apples.', 'Peel and core the apples.', 'Blend the apples with sugar and water.', 'Strain the juice and serve.']
  },
  OrangeJuice: {
    title: 'Orange Juice',
    ingredients: ['oranges', 'sugar', 'water'],
    steps: ['Peel the oranges.', 'Blend the oranges with sugar and water.', 'Strain the juice and serve.']
  },
  GrapeJuice: {
    title: 'Grape Juice',
    ingredients: ['grapes', 'sugar', 'water'],
    steps: ['Wash the grapes.', 'Blend the grapes with sugar and water.', 'Strain the juice and serve.']
  }
};

const db = new Database('./juices.db');

// Create `recipes` table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
        name TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        steps TEXT NOT NULL
    )
`);

// Simple user storage (in a real app, use a database and hash passwords)
const users = {
  'admin': 'password123',
  'user': 'userpass'
};

// Auth routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username });
  
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (users[username] && users[username] === password) {
    req.session.user = username;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
      console.log('Login successful for:', username);
      console.log('Session data:', req.session);
      res.json({ success: true, message: 'Login successful' });
    });
  } else {
    console.log('Invalid credentials for:', username);
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

app.get('/api/auth-status', (req, res) => {
  console.log('Auth status check - Session:', req.session);
  console.log('User in session:', req.session.user);
  res.json({ 
    isAuthenticated: !!req.session.user,
    username: req.session.user 
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve login.html
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// GET a recipe
app.get('/api/:juiceName', (req, res) => {
  const { juiceName } = req.params;

  try {
      const stmt = db.prepare(`SELECT * FROM recipes WHERE name = ?`);
      const recipe = stmt.get(juiceName);

      if (!recipe) {
        console.log(`Recipe not found in database. Checking local recipes...`);
        const fallbackRecipe = recipes[juiceName];
        if (!fallbackRecipe) {
          return res.status(404).json({ error: `Recipe for ${juiceName} not found anywhere!` });
        }
    
        // Return the recipe from the const object
        return res.json({
          name: juiceName,
          title: fallbackRecipe.title,
          ingredients: fallbackRecipe.ingredients,
          steps: fallbackRecipe.steps,
        });
      }
      // If recipe exists in the database, return it
      res.json({
          name: recipe.name,
          title: recipe.title,
          ingredients: recipe.ingredients.split(','),
          steps: recipe.steps.split(',')
      });
  } catch (err) {
      res.status(500).json({ error: 'Failed to fetch recipe!' });
  }
});

// POST a new recipe
app.post('/api/:juiceName', requireAuth, (req, res) => {
  const { juiceName } = req.params;
  const { title, ingredients, steps } = req.body;

  try {
      const stmt = db.prepare(`
          INSERT INTO recipes (name, title, ingredients, steps)
          VALUES (?, ?, ?, ?)
      `);
      stmt.run(juiceName, title, ingredients.join(','), steps.join(','));

      res.status(201).json({ message: `Recipe for ${juiceName} added successfully!` });
  } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
          res.status(409).json({ error: `Recipe for ${juiceName} already exists!` });
      } else {
          res.status(500).json({ error: 'Failed to add recipe!' });
      }
  }
});

// PUT (Update) a recipe
app.put('/api/:juiceName', requireAuth, (req, res) => {
  const { juiceName } = req.params;
  const { title, ingredients, steps } = req.body;

  try {
      const stmt = db.prepare(`
          UPDATE recipes
          SET title = ?, ingredients = ?, steps = ?
          WHERE name = ?
      `);
      const result = stmt.run(title, ingredients.join(','), steps.join(','), juiceName);

      if (result.changes === 0) {
          return res.status(404).json({ error: `Recipe for ${juiceName} not found!` });
      }

      res.json({ message: `Recipe for ${juiceName} updated successfully!` });
  } catch (err) {
      res.status(500).json({ error: 'Failed to update recipe!' });
  }
});

// DELETE a recipe
app.delete('/api/:juiceName', requireAuth, (req, res) => {
    const { juiceName } = req.params;

    try {
        const stmt = db.prepare(`DELETE FROM recipes WHERE name = ?`);
        const result = stmt.run(juiceName);

        if (result.changes === 0) {
            return res.status(404).json({ error: `Recipe for ${juiceName} not found!` });
        }

        res.json({ message: `Recipe for ${juiceName} deleted successfully!` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete recipe!' });
    }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

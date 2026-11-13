const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at', dbPath);
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#4772fa',
        icon TEXT DEFAULT '📚',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        list_id TEXT,
        title TEXT NOT NULL,
        notes TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        priority INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0,
        pomodoros_completed INTEGER DEFAULT 0,
        pomodoros_target INTEGER DEFAULT 2,
        subtasks TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
      )
    `);

    // Seed initial academic data if empty
    db.get('SELECT COUNT(*) AS count FROM lists', (err, row) => {
      if (!err && row.count === 0) {
        const csId = 'list-cs301';
        const mathId = 'list-math204';
        const lifeId = 'list-comeback';

        const stmtList = db.prepare('INSERT INTO lists (id, name, color, icon) VALUES (?, ?, ?, ?)');
        stmtList.run(csId, 'CS 301: Algorithms', '#4772fa', '💻');
        stmtList.run(mathId, 'MATH 204: Linear Algebra', '#f59e0b', '📐');
        stmtList.run(lifeId, 'Academic Comeback Plan', '#10b981', '🔥');
        stmtList.finalize();

        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];

        const stmtTask = db.prepare(`
          INSERT INTO tasks (id, list_id, title, notes, due_date, priority, completed, deleted, pomodoros_completed, pomodoros_target, subtasks)
          VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
        `);

        stmtTask.run(
          uuidv4(),
          csId,
          'Master Dynamic Programming & Memoization',
          'Focus on knapsack, longest common subsequence, and state transitions before Friday quiz.',
          today,
          3,
          1,
          4,
          JSON.stringify([
            { id: uuidv4(), title: 'Watch lecture recording on DP', done: true },
            { id: uuidv4(), title: 'Solve 5 LeetCode medium DP problems', done: false },
            { id: uuidv4(), title: 'Write cheat-sheet recurrence formulas', done: false }
          ])
        );

        stmtTask.run(
          uuidv4(),
          mathId,
          'Problem Set 4: Eigenvalues & Eigenvectors',
          'Show all determinant steps clearly. Check solutions with study group.',
          tomorrow,
          2,
          0,
          3,
          JSON.stringify([
            { id: uuidv4(), title: 'Complete questions 1-4', done: true },
            { id: uuidv4(), title: 'Complete questions 5-8', done: false }
          ])
        );

        stmtTask.run(
          uuidv4(),
          lifeId,
          'Clean desk, block distracting sites & set 4.0 GPA tracker',
          'No more cramming the night before. 2 Pomodoros every evening minimum.',
          today,
          3,
          0,
          1,
          JSON.stringify([])
        );

        stmtTask.run(
          uuidv4(),
          null,
          'Email Professor about Office Hours',
          'Ask about midterm grading rubric and extra credit project.',
          nextWeek,
          1,
          0,
          1,
          JSON.stringify([])
        );

        stmtTask.finalize();
      }
    });
  });
}

// --- LISTS API ---
app.get('/api/lists', (req, res) => {
  db.all('SELECT * FROM lists ORDER BY created_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/lists', (req, res) => {
  const { name, color = '#4772fa', icon = '📚' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'List name is required' });
  const id = uuidv4();
  db.run(
    'INSERT INTO lists (id, name, color, icon) VALUES (?, ?, ?, ?)',
    [id, name.trim(), color, icon],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id, name: name.trim(), color, icon });
    }
  );
});

app.delete('/api/lists/:id', (req, res) => {
  const { id } = req.params;
  db.run('UPDATE tasks SET list_id = NULL WHERE list_id = ?', [id], () => {
    db.run('DELETE FROM lists WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: true });
    });
  });
});

// --- TASKS API ---
app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY completed ASC, priority DESC, created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = rows.map((r) => ({
      ...r,
      completed: Boolean(r.completed),
      deleted: Boolean(r.deleted),
      subtasks: JSON.parse(r.subtasks || '[]')
    }));
    res.json(parsed);
  });
});

app.post('/api/tasks', (req, res) => {
  const {
    title,
    list_id = null,
    notes = '',
    due_date = '',
    priority = 0,
    pomodoros_target = 1,
    subtasks = []
  } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  const id = uuidv4();
  db.run(
    `INSERT INTO tasks (id, list_id, title, notes, due_date, priority, completed, deleted, pomodoros_completed, pomodoros_target, subtasks)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    [id, list_id || null, title.trim(), notes, due_date, priority, pomodoros_target, JSON.stringify(subtasks)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        id,
        list_id: list_id || null,
        title: title.trim(),
        notes,
        due_date,
        priority,
        completed: false,
        deleted: false,
        pomodoros_completed: 0,
        pomodoros_target,
        subtasks
      });
    }
  );
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const updated = {
      list_id: req.body.list_id !== undefined ? req.body.list_id : existing.list_id,
      title: req.body.title !== undefined ? req.body.title : existing.title,
      notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
      due_date: req.body.due_date !== undefined ? req.body.due_date : existing.due_date,
      priority: req.body.priority !== undefined ? req.body.priority : existing.priority,
      completed: req.body.completed !== undefined ? (req.body.completed ? 1 : 0) : existing.completed,
      deleted: req.body.deleted !== undefined ? (req.body.deleted ? 1 : 0) : existing.deleted,
      pomodoros_completed:
        req.body.pomodoros_completed !== undefined ? req.body.pomodoros_completed : existing.pomodoros_completed,
      pomodoros_target:
        req.body.pomodoros_target !== undefined ? req.body.pomodoros_target : existing.pomodoros_target,
      subtasks:
        req.body.subtasks !== undefined ? JSON.stringify(req.body.subtasks) : existing.subtasks
    };

    db.run(
      `UPDATE tasks
       SET list_id = ?, title = ?, notes = ?, due_date = ?, priority = ?, completed = ?, deleted = ?,
           pomodoros_completed = ?, pomodoros_target = ?, subtasks = ?
       WHERE id = ?`,
      [
        updated.list_id,
        updated.title,
        updated.notes,
        updated.due_date,
        updated.priority,
        updated.completed,
        updated.deleted,
        updated.pomodoros_completed,
        updated.pomodoros_target,
        updated.subtasks,
        id
      ],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        res.json({
          id,
          ...updated,
          completed: Boolean(updated.completed),
          deleted: Boolean(updated.deleted),
          subtasks: JSON.parse(updated.subtasks)
        });
      }
    );
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: true });
  });
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Comeback Next Semester server running at http://localhost:${PORT}`);
});

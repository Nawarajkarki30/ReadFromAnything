const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('✅ Connected to local SQLite database (database.db)');
    db.run(`CREATE TABLE IF NOT EXISTS study_sets (
            id TEXT PRIMARY KEY,
            title TEXT,
            mode TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
  }
});

// Helper functions for easy DB access
const dbHelpers = {
  saveSet: (id, title, mode, content) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO study_sets (id, title, mode, content) VALUES (?, ?, ?, ?)`,
        [id, title, mode, content],
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  getAllSets: () => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT id, title, mode, created_at FROM study_sets ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  getSetById: (id) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM study_sets WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  deleteSet: (id) => {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM study_sets WHERE id = ?`, [id], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }
};

module.exports = dbHelpers;

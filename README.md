# Comeback Next Semester

A full-stack academic task manager and Pomodoro focus suite inspired by **TickTick**, built for students aiming for an academic comeback.

## Tech Stack
- **Backend:** Node.js + Express + SQLite3 (Zero external DB setup required; auto-creates `database.sqlite`)
- **Frontend:** Vanilla HTML5, CSS3 (Custom Properties / Dark & Light Theme), JavaScript (ES6+), Web Audio API (built-in focus chimes & completion sounds)

## Features
- **Three-Pane TickTick Layout:**
  - **Left Sidebar:** Smart Views (`Inbox`, `Today`, `Next 7 Days`, `All Tasks`, `Completed`, `Trash`), Custom Course/Subject Lists with color badges, and an embedded **Pomodoro Focus Timer** (25m Focus / 5m Short Break / 15m Long Break) linked to active tasks.
  - **Middle Task List:** Quick-add task bar with priority flags (`High`, `Medium`, `Low`, `None`), due dates, subject assignment, search, sorting, and instant completion toggles.
  - **Right Detail Inspector:** Full task editor with Markdown-style notes, interactive **Subtasks / Checklists**, Pomodoro session counter, priority picker, due date picker, and course list reassignment.
- **Persistent SQLite Storage:** All courses, tasks, subtasks, and Pomodoro stats are saved to a local SQLite database via RESTful API endpoints.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in your browser:**
   Navigate to `http://localhost:3000`

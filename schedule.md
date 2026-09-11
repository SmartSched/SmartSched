# SmartSched — Schedule & Progress

## Progress Log

### 2026-07-21

Summer scaffolding phase (Jun 19 – Jul 3 target) is fully closed out, and some Sep 4–18 items
got pulled forward early:

- Finalized tech stack, repo set up (from before this session)
- Supabase project configured, 5-table schema designed and migrated via versioned SQL
  migrations (Supabase CLI): `profiles`, `tasks`, `time_blocks`, `habits`, `reflections`
- Basic frontend pages built and connected to a live backend
- Backend (Node + Express) GET routes built and tested locally
- Code connected to Supabase end-to-end (frontend and backend both talk to real Supabase data,
  not mock data)
- Row Level Security enabled on all tables (owner-only access via `auth.uid()`)
- **Pulled forward from Sep 4–18:**
  - Task input front + back — add tasks, mark complete/incomplete (edit/delete not built yet)
  - Auth — email/password signup & login via Supabase Auth (not on the original roadmap as a
    named line item, but required for the rest of this to make sense per-user)
  - End-of-day review screen — day reflection with 1–5 ratings (Productivity, Mood, Energy,
    Sleep), saved to Supabase, one entry per day
- Trimmed scope per direct instruction: removed the Progress and Habits pages, the calendar
  view and Pomodoro timer, and all decorative emoji styling from the original Figma mockup

Still outstanding from Sep 4–18 (not started): edit/delete tasks, schedule view as a daily/
weekly calendar with time blocks, AI-powered scheduling, smart rescheduling logic, adaptive
learning, daily motivation quote, burnout flag logic.

---

## Original Plan

# SmartSched: Personalized Scheduler

## Overview

SmartSched is an intelligent study planning application that helps students generate and
manage personalized schedules based on their academic workload, deadlines, and daily
availability.

## Core Idea

Students input their academic and personal commitments (assignments, exams, work hours, study
sessions, social interactions, etc.), and SmartSched generates an optimized study schedule. The
schedule adapts over time based on task completion, priorities, and changes in workload.

## Goal of SmartSched

To reduce academic stress and last-minute cramming by giving students a smart, adaptive, and
realistic study plan that evolves with them.

## Low Fidelity Prototype

https://canva.link/iwprpgod55cy42w

## Key Features

1. **Task Management System** - Users can input and manage all tasks in one place, including:
   1. Task name/description
   2. Type (homework, exam, project, work, study session, etc.)
   3. Priority level (high, medium, low)
   4. Due date
   5. Estimated time required
   6. Completion status (done / not done)
   7. Time spent on task
   8. Completion timestamp
2. **AI-Powered Scheduling**
   1. Automatically generates a study schedule based on:
      1. Task deadlines
      2. Priority levels
      3. Available time slots
      4. Estimated time required
   2. Optimizes study order to reduce stress and improve productivity
   3. Balances workload across days instead of cramming
3. **Smart Rescheduling**
   1. If a task is not completed, the system automatically:
      1. Reschedules it into the next available time slot
      2. Adjusts the estimated time if the user consistently over/underestimates
   2. Dynamically updates the schedule whenever tasks or deadlines change
4. **Progress Tracking**
   1. Tracks completed vs. incomplete tasks
   2. Logs:
      1. Time spent per task
      2. Completion time
   3. Helps students understand productivity patterns over time
5. **Adaptive Learning (AI Improvement)**
   1. Learns from user behavior over time:
      1. How long tasks actually take
      2. At what times of day is the user most productive
   2. Improves future scheduling accuracy

## Competitors

One of the popular tools we explored is [Reclaim.ai](http://reclaim.ai), an AI-powered
scheduling assistant that automatically plans work, meetings, and personal time. While it is
designed for a broad audience, our primary users are students. Unlike Reclaim.ai, which focuses
on optimizing workplace productivity, our goal with SmartSched is specifically to reduce
academic stress by helping students manage coursework, deadlines, and study time in a more
balanced and sustainable way.

## Planned tech stack

- Frontend: React + Vite
- Backend: Node + Express
- Database: Supabase (PostgreSQL)
- Hosting: Render/Vercel
- AI: Anthropic Claude

## Broad week-wise plan, June - November

**June 1st - June 5th:**

- Finalize tech stack
- Set up repos
- Configure Supabase and DB schema

**June 5th - June 12th:**

- N/A Finals week

**June 12th - June 19th:**

- N/A Moveout/Travel

**June 19th - July 3rd:**

- Basic front-end just pages, not much (no interactive functionality)
- Some get methods for testing
- Test locally
- Create and connect code to Supabase
- Make some tables (users, login, etc)

**July 3rd - Sep 4:**

- Buffer/Summer

**Sep 4 - Sep 18:**

- Build task input front + back
  - Users can add, edit, and delete tasks with all fields
  - name, type, priority, due date, estimated time
- Build the schedule view
  - daily/weekly calendar layout
  - display tasks as time blocks
- Progress tracking
  - timestamps per task
- Rescheduling logic
  - If the task is marked incomplete, auto-shift it to the next available slot as long as it's
    before the due date
- Build an end-of-day review screen
- Feed daily ratings back into the AI prompt context
- Adaptive learning
  - actual vs. estimated task time
  - factor into future scheduling
- Daily motivation quote feature
- Burnout flag logic
  - Detect overloaded weeks and surface a warning
- Test
- UI/UX
  - clean up layouts
  - make the app feel intentional

**Sep 18 - Sep 25:**

- buffer

**Sep 25 - Oct 9:**

- Deploy frontend to Vercel, backend + database fully live on Render + Supabase
- Everything tested live, not just locally

**Oct 2 - Oct 16:**

- Peer testing
  - Maybe go to CSC 101 sections and plead with students to try it out at least for a day

**Oct 16 - Oct 23:**

- buffer

**Oct 23 onwards:**

- Address feedback
- Improve everything
- Prepare for the end of semester Sr Proj. presentation

---

## Discussion Points for Next Meeting

1. LoRA vs API call
2. Heuristic?

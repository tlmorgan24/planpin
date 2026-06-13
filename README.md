## Overview

PlanPin is an iOS app designed for professionals carrying out site inspection work (such as in the construction industry). It allows the user to annotate site plans, track inspection data, and automatically generate reports.

App Store link: [https://apps.apple.com/us/app/planpin/id6749440381](https://apps.apple.com/us/app/planpin/id6749440381).

![Demo](assets/demo.gif)

## How professionals use PlanPin

1. Upload a PDF of the site plan.
2. Use the custom PDF viewer to navigate the site plan and tap anywhere to pin an item (e.g. a construction defect that’s been spotted).
3. Add descriptions, categories and photos (snap them in-app or upload existing) to document the item.
4. Automatically generate an editable .docx inspection report. The report shows all documented items along with their locations, descriptions and photos, and highlights those with high priority.

Steps 1-3 work locally and only sync to cloud when online. So users can always collect the data they need, even in remote conditions, and generate a report when back in the office!

## Features
- Interactive PDF viewer with tap-to-pin markers, zoom and scroll controls.
- Offline-first design: local SQLite store with sync to Supabase when online.
- Sync model uses a local meta table and soft-deletes to avoid conflicts.
- Server-side `.docx` inspection report generation with plan snapshots and embedded images.

## Architecture
- Frontend: React + Capacitor (web + native), PDF.js viewer and a marker layer for interactive annotations.
- Local persistence: SQLite on native via `@capacitor-community/sqlite`; local schema and sync logic in `frontend/src/database.js`.
- Cloud: Supabase for Auth, Postgres tables and object storage (PDFs & images). Cloud helpers are in `backend/get_cloud_data.py` and `frontend/src/supabase.js`.
- Backend: FastAPI app exposing endpoints for report generation and admin tasks in `backend/app.py`. Heavy work (PDF rasterisation, image overlay and `.docx` creation) happens in `backend/generate_report.py`.

## Tech stack
- Frontend: React 19, Vite, Capacitor plugins (Camera, Filesystem, Network, Preferences), `pdfjs-dist`.
- Backend: Python, FastAPI, python-docx, PyMuPDF (fitz), Pillow.
- Dev tools: Vite, ESLint, Uvicorn for local backend serving.

## How to run (as a developer)
Backend (Python):
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
``` 

Environment variables (backend `.env`):
- `SUPABASE_URL`
- `SUPABASE_API_KEY`
- `SUPABASE_SERVICE_KEY` (for admin operations)
- `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_EMAIL`

Run backend locally:
```bash
cd backend
uvicorn app:app --reload --port 8000
```

Frontend (web):
```bash
cd frontend
npm install
# create a .env with VITE_SUPABASE_URL and VITE_SUPABASE_API_KEY
npm run dev
```

Native iOS (outline):
- Build web assets: `npm run build` (in `frontend/`)
- Sync Capacitor: `npx cap sync ios`
- Open Xcode workspace: `npx cap open ios`

### Key files
- `backend/app.py` — FastAPI entrypoints (generate report, delete user, forward message).
- `backend/generate_report.py` — report builder using PyMuPDF, Pillow, and python-docx.
- `backend/get_cloud_data.py` — Supabase helpers to fetch markers, images and PDFs.
- `frontend/src/App.jsx` — app initialization and routing.
- `frontend/src/pages/Plan.jsx` — PDF viewer, interactive page and marker layer flow.
- `frontend/src/database.js` — local SQLite schema and table creation logic.
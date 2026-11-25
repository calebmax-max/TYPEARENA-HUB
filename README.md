# TYPEARENA HUB

## Project layout

- `frontend/` — React/Vite site for Vercel or another static frontend host.
- `backend/` — Flask API, production Gunicorn config, Python dependencies, environment files, and data storage.

## Local development

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

For separate deployment, set `frontend/.env` or the frontend host environment to `VITE_API_URL=https://your-backend.example.com`.

Backend:

```powershell
cd backend
pip install -r requirements.txt
$env:TONIE_REQUIRE_MYSQL = '0'
python server.py
```

For the Render backend, use `backend/render-build.sh` as the build command (with
the service root directory set to `backend`). It installs LibreOffice so
PowerPoint, Word and Excel previews retain their visual layout.

## Production backend

Run from `backend/` with a real MySQL database, object storage, production secrets, and `TONIE_ADMIN_TOKEN_SECRET` configured:

```bash
gunicorn -c gunicorn.conf.py server:app
```

Set the backend `TONIE_ALLOWED_ORIGIN` to the deployed frontend origin, for example `https://your-frontend.example.com`.

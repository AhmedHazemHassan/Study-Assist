from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
import os, shutil, requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

jobs = {}

N8N_WORKFLOW_URL = "http://localhost:5678/webhook/ai-workflow"
N8N_JUDGE_URL = "http://localhost:5678/webhook/judge-feedback"

# ---------------- JOB ROUTES ----------------

@app.post("/jobs/create")
def create_job():
    job_id = str(uuid4())
    jobs[job_id] = {
        "status": "created",
        "files": [],
        "tasks": {},
        "result": None
    }
    return {"job_id": job_id}

@app.post("/jobs/{job_id}/upload")
def upload(job_id: str, file: UploadFile = File(...)):
    path = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(path, exist_ok=True)

    file_path = os.path.join(path, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    jobs[job_id]["files"].append(file_path)
    return {"uploaded": file.filename}

@app.post("/jobs/{job_id}/run")
async def run_job(job_id: str, req: Request, bg: BackgroundTasks):
    body = await req.json()
    jobs[job_id]["tasks"] = body["tasks"]
    jobs[job_id]["status"] = "running"

    bg.add_task(run_pipeline, job_id)
    return {"started": True}

@app.get("/jobs/{job_id}/status")
def status(job_id: str):
    return jobs[job_id]

# ---------------- PIPELINE ----------------

def run_pipeline(job_id: str):
    payload = {
        "job_id": job_id,
        "files": jobs[job_id]["files"],
        "tasks": jobs[job_id]["tasks"]
    }

    r = requests.post(N8N_WORKFLOW_URL, json=payload)
    jobs[job_id]["result"] = r.text
    jobs[job_id]["status"] = "completed"

# ---------------- FEEDBACK ----------------

@app.post("/feedback")
async def feedback(req: Request):
    data = await req.json()
    requests.post(N8N_JUDGE_URL, json=data)
    return {"ok": True}

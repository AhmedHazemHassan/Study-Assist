import requests
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import json
import uuid
import logging
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS for the frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    # Replace these with your actual n8n test Webhook URLs
    N8N_WEBHOOK_1_URL = "http://localhost:5678/webhook-test/25a29697-278d-460d-a23a-b3577a7d025f"
    N8N_WEBHOOK_2_URL = "http://localhost:5678/webhook-test/afe76a43-00c6-4152-ac82-b3947899f029"
    logger.info("N8N_WEBHOOK URLs set to Test mode.")
except:
    # # Replace these with your actual n8n Production Webhook URLs
    N8N_WEBHOOK_1_URL = "http://localhost:5678/webhook/25a29697-278d-460d-a23a-b3577a7d025f"
    N8N_WEBHOOK_2_URL = "https://your-n8n-instance.com/webhook/2fb60e97-8848-48c4-82d8-309adeefdc54"
finally:
    logger.info(f"N8N_WEBHOOK URLs set to Production mode.")
    

# In-memory storage for results
results_storage: Dict[str, Any] = {}

# Flexible model that accepts any structure from n8n
class StudyResults(BaseModel):
    summary: Optional[Any] = None
    quiz: Optional[Any] = None
    flashcards: Optional[Any] = None
    
    class Config:
        extra = "allow"  # Allow any extra fields from n8n

@app.get("/")
async def root():
    return {"status": "ok", "message": "Study Assist Backend is running"}

@app.post("/upload")
async def process_initial_request(
    file: UploadFile = File(...),
    summary: bool = Form(...),
    quiz: bool = Form(...),
    flashcards: bool = Form(...)
):
    """
    Receives PDF from Dashboard, assigns a job ID, and forwards to n8n.
    n8n responds synchronously with the results, which we store for the frontend to poll.
    """
    job_id = str(uuid.uuid4())
    logger.info(f"[UPLOAD] Starting upload with job_id: {job_id}")
    
    try:
        # Prepare binary data and parameters for n8n
        file_content = await file.read()
        files = {'data': (file.filename, file_content, file.content_type)}
        
        payload_data = {
            'preferences': json.dumps({
                'summary': summary,
                'quiz': quiz,
                'flashcards': flashcards
            }),
            'job_id': job_id
        }
        
        logger.info(f"[UPLOAD] Sending to n8n webhook...")
        
        # Forward to n8n and wait for response
        response = requests.post(N8N_WEBHOOK_1_URL, files=files, data=payload_data, timeout=300)
        response.raise_for_status()
        
        # Get the response from n8n
        n8n_result = response.json()
        logger.info(f"[UPLOAD] Received RAW response from n8n: {json.dumps(n8n_result, indent=2)}")
        
        # Extract the study materials from n8n's response
        # Handle different possible response structures from n8n
        study_data = {}
        
        if 'study_pack' in n8n_result:
            logger.info("[UPLOAD] Detected 'study_pack' structure")
            sp = n8n_result.get('study_pack', {})
            
            # Extract summary
            summary_obj = sp.get('summary', {})
            if isinstance(summary_obj, dict):
                study_data['summary'] = summary_obj.get('content', '')
            else:
                study_data['summary'] = str(summary_obj) if summary_obj else ''
            
            # Extract quiz - only if it's a real array with quiz objects
            quiz_obj = sp.get('quiz', {})
            if isinstance(quiz_obj, dict):
                quiz_content = quiz_obj.get('content', [])
                # Only include if it's an array of quiz items (not a string message)
                if isinstance(quiz_content, list) and len(quiz_content) > 0 and isinstance(quiz_content[0], dict):
                    study_data['quiz'] = quiz_content
                else:
                    study_data['quiz'] = []  # Empty if not valid quiz array
            else:
                study_data['quiz'] = []
            
            # Extract flashcards - only if it's a real array with flashcard objects
            fc_obj = sp.get('flashcards', {})
            if isinstance(fc_obj, dict):
                fc_content = fc_obj.get('content', [])
                # Only include if it's an array of flashcard items (not a string message)
                if isinstance(fc_content, list) and len(fc_content) > 0 and isinstance(fc_content[0], dict):
                    study_data['flashcards'] = fc_content
                else:
                    study_data['flashcards'] = []  # Empty if not valid flashcard array
            else:
                study_data['flashcards'] = []
                
        elif 'summary' in n8n_result or 'quiz' in n8n_result or 'flashcards' in n8n_result:
            logger.info("[UPLOAD] Detected flat structure")
            study_data['summary'] = n8n_result.get('summary', '') if isinstance(n8n_result.get('summary'), str) else ''
            study_data['quiz'] = n8n_result.get('quiz', []) if isinstance(n8n_result.get('quiz'), list) else []
            study_data['flashcards'] = n8n_result.get('flashcards', []) if isinstance(n8n_result.get('flashcards'), list) else []
        else:
            logger.info("[UPLOAD] Unknown structure, storing as-is")
            study_data = n8n_result
        
        logger.info(f"[UPLOAD] Processed study_data: {json.dumps(study_data, indent=2)}")
        
        # Store the results for the frontend to poll
        results_storage[job_id] = study_data
        logger.info(f"[UPLOAD] ✅ Results STORED for job_id: {job_id}")
        logger.info(f"[UPLOAD] Storage keys: {list(results_storage.keys())}")
        
        return {"job_id": job_id, "message": "Processing complete"}
        
    except requests.exceptions.Timeout:
        logger.error(f"[UPLOAD] ❌ Request to n8n timed out for job_id: {job_id}")
        return {"error": "n8n processing timed out", "job_id": job_id}
    except requests.exceptions.RequestException as e:
        logger.error(f"[UPLOAD] ❌ Failed to connect to n8n: {str(e)}")
        return {"error": f"Failed to connect to n8n: {str(e)}", "n8n_status": "failed"}
    except Exception as e:
        logger.error(f"[UPLOAD] ❌ Internal error: {str(e)}")
        return {"error": f"Internal server error: {str(e)}"}

@app.post("/results")
async def receive_results(job_id: str = Query(...), results: StudyResults = None):
    """
    Endpoint for n8n to post the final generated study materials.
    Accepts job_id as query param: POST /results?job_id=xxx
    """
    logger.info(f"[RESULTS] Received POST request for job_id: {job_id}")
    logger.info(f"[RESULTS] Data received: {results}")
    
    if results:
        results_storage[job_id] = results.dict()
        logger.info(f"[RESULTS] ✅ Data SAVED successfully for job_id: {job_id}")
        logger.info(f"[RESULTS] Current storage keys: {list(results_storage.keys())}")
        return {"status": "success", "job_id": job_id, "message": "Results received and stored."}
    else:
        logger.error(f"[RESULTS] ❌ No data received for job_id: {job_id}")
        return {"status": "error", "message": "No data received"}

# Alternative endpoint that accepts raw JSON body (more flexible for n8n)
@app.post("/results/raw")
async def receive_results_raw(payload: dict, job_id: str = Query(...)):
    """
    More flexible endpoint that accepts any JSON structure.
    Use this if the strict endpoint doesn't work.
    """
    logger.info(f"[RESULTS-RAW] Received POST request for job_id: {job_id}")
    logger.info(f"[RESULTS-RAW] Raw payload: {payload}")
    
    results_storage[job_id] = payload
    logger.info(f"[RESULTS-RAW] ✅ Data SAVED successfully for job_id: {job_id}")
    logger.info(f"[RESULTS-RAW] Current storage keys: {list(results_storage.keys())}")
    return {"status": "success", "job_id": job_id, "message": "Results received and stored."}

@app.get("/results/{job_id}")
async def get_results(job_id: str):
    """
    Endpoint for the frontend to poll for results.
    """
    logger.info(f"[GET-RESULTS] Polling for job_id: {job_id}")
    logger.info(f"[GET-RESULTS] Current storage keys: {list(results_storage.keys())}")
    
    if job_id in results_storage:
        data = results_storage.pop(job_id)
        logger.info(f"[GET-RESULTS] ✅ Found and returning data for job_id: {job_id}")
        return {"status": "complete", "data": data}
    else:
        logger.info(f"[GET-RESULTS] ⏳ No data yet for job_id: {job_id} (pending)")
        return {"status": "pending"}

@app.post("/feedback")
async def process_feedback(payload: dict):
    """
    Receives text feedback from Dashboard and forwards it to n8n Webhook 2 (Chat Trigger).
    """
    try:
        # Expected payload: {"chatInput": "add emojis to the summary"}
        response = requests.post(N8N_WEBHOOK_2_URL, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to connect to n8n: {str(e)}", "n8n_status": "failed"}

@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify backend is running.
    """
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
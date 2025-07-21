from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from generate_report import generate_report
from delete_user import delete_user
from forward_message import forward_message

app = FastAPI()

# To allow CORS:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # allow all origins (FOR TESTING ONLY)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReportRequest(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    plan_id: str
    priority_limit: int
    include_caption: bool

class DeleteUserRequest(BaseModel):
    user_id: str

class ContactForm(BaseModel):
    name: str
    email: str
    message: str

@app.post("/generate_report")
def generate_report_server(data: ReportRequest):
    server_filepath = "/tmp/generated-report.docx" # filename for report to generate (use special temporary folder)
    doc = generate_report(data.access_token, data.refresh_token, data.user_id, data.plan_id, data.priority_limit, data.include_caption)
    doc.save(server_filepath)
    return FileResponse(server_filepath, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename="generated-report.docx")

@app.post("/delete_user")
def delete_user_server(data: DeleteUserRequest):
    try:
        delete_user(data.user_id)
        return {"status": "success", "message": "User deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting user: {str(e)}")
    
@app.post("/forward_message")
def forward_message_server(data: ContactForm):
    try:
        forward_message(data.name, data.email, data.message)
        return {"status": "success", "message": "Message forwarded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error forwarding message: {str(e)}")
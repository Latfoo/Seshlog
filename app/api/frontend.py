from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(tags=["frontend"])


@router.get("/")
def root():
    return FileResponse("static/index.html")

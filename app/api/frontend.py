from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(tags=["frontend"])


@router.get("/")
def root():
    return FileResponse("frontend/static/index.html")


@router.get("/imprint")
def imprint():
    return FileResponse("frontend/static/imprint.html")


@router.get("/privacy")
def privacy():
    return FileResponse("frontend/static/privacy.html")

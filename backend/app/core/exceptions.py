from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    def __init__(self, status_code: int, detail: str, code: str = "ERROR"):
        self.status_code = status_code
        self.detail = detail
        self.code = code


class NotFoundError(AppException):
    def __init__(self, resource: str = "Resource"):
        super().__init__(404, f"{resource} not found", "NOT_FOUND")


class UnauthorizedError(AppException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(401, detail, "UNAUTHORIZED")


class ForbiddenError(AppException):
    def __init__(self, detail: str = "Permission denied"):
        super().__init__(403, detail, "FORBIDDEN")


class ConflictError(AppException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(409, detail, "CONFLICT")


class ValidationError(AppException):
    def __init__(self, detail: str):
        super().__init__(422, detail, "VALIDATION_ERROR")


async def app_exception_handler(request: Request, exc: AppException):
    # The frontend's error handlers everywhere (20+ places, including the
    # inventory Add/Deduct buttons) read err.response.data.detail — that's
    # the FastAPI-standard field name. This handler was only sending
    # "message", so every one of those business-rule errors (e.g. "Only 5
    # on hand — can't remove 10") arrived with no "detail" field at all,
    # and the frontend silently fell back to a generic "failed" toast
    # instead of showing the real reason. Sending both keys fixes every
    # one of those call sites at once, and keeps "message" for anything
    # still reading the old field.
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "code": exc.code, "detail": exc.detail, "message": exc.detail},
    )

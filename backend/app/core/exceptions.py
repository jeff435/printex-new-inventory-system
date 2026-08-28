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


async def request_validation_error_handler(request: Request, exc):
    # FastAPI's own built-in validation (every Pydantic Field(ge=..., gt=...,
    # min_length=...) constraint — e.g. the new "price can't be negative" /
    # "quantity must be positive" / "name can't be blank" guards added across
    # products, orders, purchases, proforma) raises this automatically and,
    # left unhandled, its default 422 body puts `detail` as a LIST of
    # {"loc": [...], "msg": ..., "type": ...} objects, not a string.
    #
    # Every frontend error handler in this app (toast.error(err.response?.data?.detail
    # || err.response?.data?.message)) expects `detail` to be a plain string —
    # that convention comes from app_exception_handler above. Without this
    # handler, a garbage-in submission (negative price, blank name, empty
    # order) would come back with `detail` as an array, and toast.error()
    # would render it as "[object Object]" instead of a message a member of
    # staff can actually act on. This normalizes FastAPI's validation errors
    # into that same {detail: str, message: str} shape, joining every field
    # error into one readable line.
    errors = exc.errors()
    parts = []
    for err in errors:
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = ".".join(loc) if loc else "value"
        parts.append(f"{field}: {err.get('msg', 'invalid value')}")
    detail = "; ".join(parts) or "Invalid request"
    return JSONResponse(
        status_code=422,
        content={"success": False, "code": "VALIDATION_ERROR", "detail": detail, "message": detail},
    )

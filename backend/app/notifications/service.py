import httpx
import random
import string
from datetime import datetime, timedelta, timezone

from app.config import settings


def generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def otp_expiry(minutes: int = 10) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


async def send_sms(phone: str, message: str) -> bool:
    if not phone.startswith("+"):
        phone = "+254" + phone.lstrip("0")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.africastalking.com/version1/messaging",
                headers={
                    "apiKey": settings.AT_API_KEY,
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "username": settings.AT_USERNAME,
                    "to": phone,
                    "message": message,
                    "from": settings.AT_SENDER_ID,
                },
                timeout=15,
            )
            return resp.status_code == 201
    except Exception as e:
        print(f"[SMS] Failed to send to {phone}: {e}")
        return False


async def send_otp_sms(phone: str, otp: str, purpose: str = "verification") -> bool:
    if settings.DEBUG and not settings.AT_API_KEY:
        # No SMS provider configured in dev — print so staff/admin logins
        # (which still go through OTP) are testable locally.
        print(f"[DEV OTP] {purpose} code for {phone}: {otp}")
        return True
    message = f"Your Printex {purpose} code is: {otp}. Valid for 10 minutes. Do not share this code."
    return await send_sms(phone, message)


async def send_email(to: str, subject: str, html: str) -> bool:
    if not settings.RESEND_API_KEY:
        print(f"[EMAIL] Skipped (no API key) — To: {to} | Subject: {subject}")
        return True
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=15,
            )
            return resp.status_code == 200
    except Exception as e:
        print(f"[EMAIL] Failed to send to {to}: {e}")
        return False


async def send_otp_email(email: str, otp: str) -> bool:
    if settings.DEBUG and not settings.RESEND_API_KEY:
        print(f"[DEV OTP] verification code for {email}: {otp}")
        return True
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:24px">
      <h2 style="color:#1B6CA8">Your Printex verification code</h2>
      <p>Use the code below to verify your account. It expires in 10 minutes.</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1B6CA8;
                  background:#EBF4FB;padding:16px;border-radius:8px;text-align:center">
        {otp}
      </div>
      <p style="color:#888;font-size:12px;margin-top:16px">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
    """
    return await send_email(email, "Your Printex verification code", html)


async def send_order_confirmation_email(email: str, order_number: str, total_kes: int) -> bool:
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h2 style="color:#1B6CA8">Order Confirmed! 🎉</h2>
      <p>Thank you for your order. We're getting it ready.</p>
      <div style="background:#EBF4FB;padding:16px;border-radius:8px">
        <p><strong>Order Number:</strong> {order_number}</p>
        <p><strong>Total:</strong> KES {total_kes / 100:,.2f}</p>
      </div>
      <p>We'll send you an SMS when your order is on its way.</p>
    </div>
    """
    return await send_email(email, f"Order Confirmed — {order_number}", html)

"""Core ASGI entrypoint with the opt-in Zoho email intake worker.

The normal Core application, existing routes, authentication and lifecycle are
preserved. Railway activates only this entrypoint and the explicit worker flag.
"""
from main import app
from mck_email_bridge import email_worker

hooks = list(getattr(app, 'service_background_tasks', []))
if email_worker not in hooks:
    hooks.append(email_worker)
app.service_background_tasks = hooks

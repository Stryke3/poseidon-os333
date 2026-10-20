"""Opt-in mailbox listener attached to the existing Intake service lifespan."""
from main import app
from mck_mail_listener import worker

hooks = list(getattr(app, "service_background_tasks", []))
if worker not in hooks:
    hooks.append(worker)
app.service_background_tasks = hooks

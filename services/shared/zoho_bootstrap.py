"""One-time Zoho authorization inside the service runtime.

The administrator supplies client credentials and a short-lived grant through
Railway Variables. The refresh token is encrypted before database storage, never
returned to callers or logs, and injected only into the child service process.
This helper sends no mail, reads no patient records, and changes no workflow flags.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import json
import os
import re
import sys
from typing import Any, MutableMapping
import uuid

import httpx
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class SetupError(RuntimeError):
    """Only fixed, non-sensitive error codes are exposed."""


@dataclass(frozen=True, repr=False)
class Config:
    client_id: str
    client_secret: str
    org_id: str
    email: str
    region: str
    resource_id: str
    patient_sheet: str
    cover_sheet: str

    @classmethod
    def read(cls, env: MutableMapping[str, str]) -> "Config":
        required = ("ZOHO_OAUTH_CLIENT_ID", "ZOHO_OAUTH_CLIENT_SECRET", "MCK_ORG_ID", "EMAIL_INTAKE_USERNAME")
        if any(not env.get(k, "").strip() for k in required):
            raise SetupError("client_configuration_missing")
        try:
            org = str(uuid.UUID(env["MCK_ORG_ID"]))
        except ValueError:
            raise SetupError("organization_mapping_invalid") from None
        email = env["EMAIL_INTAKE_USERNAME"].strip().lower()
        if not re.fullmatch(r"[^\s@]+@strykefox\.com", email):
            raise SetupError("mailbox_mapping_invalid")
        region = env.get("ZOHO_REGION", "com").strip()
        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:
            raise SetupError("region_invalid")
        resource = env.get("MCK_ZOHO_SHEET_RESOURCE_ID", "").strip()
        if resource and not re.fullmatch(r"[A-Za-z0-9_-]+", resource):
            raise SetupError("workbook_mapping_invalid")
        return cls(env[required[0]].strip(), env[required[1]].strip(), org, email, region,
                   resource, env.get("MCK_ZOHO_PATIENT_DETAILS_SHEET", "Patient Details").strip(),
                   env.get("MCK_ZOHO_HEATHER_COVER_SHEET", "Heather Cover").strip())

    def origin(self, service: str) -> str:
        suffix = "zohocloud.ca" if self.region == "ca" else "zoho." + self.region
        return f"https://{service}.{suffix}"

    @property
    def slot(self) -> str:
        context = "|".join((self.org_id, self.client_id, self.email, self.region))
        return hashlib.sha256(context.encode()).hexdigest()

    def cipher(self) -> Fernet:
        key = HKDF(algorithm=hashes.SHA256(), length=32,
                   salt=bytes.fromhex(self.slot), info=b"SFM/Zoho/refresh-token/v1").derive(self.client_secret.encode())
        return Fernet(base64.urlsafe_b64encode(key))


class PgVault:
    """A dedicated credential table, separate from patient/claim/payment tables."""
    def __init__(self, dsn: str, slot: str):
        self.dsn, self.slot = dsn, slot
        self.conn = None

    def __enter__(self):
        import psycopg
        from psycopg.rows import dict_row
        self.conn = psycopg.connect(self.dsn, autocommit=True, connect_timeout=8, row_factory=dict_row)
        try:
            self.conn.execute("SET statement_timeout='10000ms'")
            self.conn.execute("SET lock_timeout='3000ms'")
            lock = self.conn.execute("SELECT pg_try_advisory_lock(hashtextextended(%s,0)) AS locked",
                                     ("sfm-zoho-bootstrap:" + self.slot,)).fetchone()
            if not lock or not lock["locked"]:
                raise SetupError("setup_in_progress")
            self.conn.execute("""CREATE TABLE IF NOT EXISTS public.sfm_zoho_oauth_vault (
                credential_key TEXT PRIMARY KEY,
                grant_digest TEXT,
                encrypted_token TEXT,
                state TEXT NOT NULL DEFAULT 'empty',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )""")
            self.conn.execute("REVOKE ALL ON TABLE public.sfm_zoho_oauth_vault FROM PUBLIC")
            self.conn.execute("INSERT INTO public.sfm_zoho_oauth_vault (credential_key) VALUES (%s) ON CONFLICT DO NOTHING", (self.slot,))
            return self
        except Exception:
            self.conn.close()
            raise

    def __exit__(self, *args):
        if self.conn:
            self.conn.close()

    def read(self) -> dict[str, Any]:
        return dict(self.conn.execute("SELECT grant_digest,encrypted_token,state FROM public.sfm_zoho_oauth_vault WHERE credential_key=%s", (self.slot,)).fetchone())

    def reserve(self, digest: str) -> None:
        self.conn.execute("UPDATE public.sfm_zoho_oauth_vault SET grant_digest=%s,state='exchange_pending',updated_at=NOW() WHERE credential_key=%s", (digest, self.slot))

    def save(self, encrypted: str) -> None:
        self.conn.execute("UPDATE public.sfm_zoho_oauth_vault SET encrypted_token=%s,state='token_saved',updated_at=NOW() WHERE credential_key=%s", (encrypted, self.slot))

    def state(self, value: str) -> None:
        self.conn.execute("UPDATE public.sfm_zoho_oauth_vault SET state=%s,updated_at=NOW() WHERE credential_key=%s", (value, self.slot))


def response_json(response: httpx.Response, code: str) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        raise SetupError(code) from None
    if not 200 <= response.status_code < 300 or not isinstance(data, dict):
        raise SetupError(code)
    return data


def token_request(client: httpx.Client, config: Config, **grant: str) -> dict[str, Any]:
    try:
        response = client.post(config.origin("accounts") + "/oauth/v2/token", data={
            "client_id": config.client_id, "client_secret": config.client_secret, **grant,
        })
        data = response_json(response, "oauth_request_failed")
    except httpx.HTTPError:
        raise SetupError("oauth_response_uncertain") from None
    if data.get("error") or not isinstance(data.get("access_token"), str) or not data["access_token"]:
        raise SetupError("oauth_request_rejected")
    return data


def mail_read(client: httpx.Client, config: Config, access: str, path: str) -> list[dict[str, Any]]:
    response = client.get(config.origin("mail") + path, headers={"Authorization": "Zoho-oauthtoken " + access})
    data = response_json(response, "mail_access_unverified")
    status = data.get("status")
    code = status.get("code") if isinstance(status, dict) else None
    if not isinstance(code, int) or not 200 <= code < 300 or not isinstance(data.get("data"), list):
        raise SetupError("mail_access_unverified")
    if not all(isinstance(row, dict) for row in data["data"]):
        raise SetupError("mail_metadata_invalid")
    return data["data"]


def discover_mail(client: httpx.Client, config: Config, access: str) -> tuple[str, str]:
    accounts = mail_read(client, config, access, "/api/accounts")
    matches = []
    for account in accounts:
        addresses = {str(account.get(k) or "").strip().lower() for k in ("primaryEmailAddress", "mailboxAddress", "incomingUserName")}
        addresses.update(str(a.get("mailId") or "").strip().lower()
                         for a in (account.get("emailAddress") or [])
                         if isinstance(a, dict) and a.get("isConfirmed") is True)
        if config.email in addresses:
            matches.append(account)
    if len(matches) != 1:
        raise SetupError("expected_mailbox_not_uniquely_verified")
    account_id = str(matches[0].get("accountId") or "")
    if not account_id.isdecimal():
        raise SetupError("mail_account_id_invalid")
    folders = mail_read(client, config, access, f"/api/accounts/{account_id}/folders")
    inbox = [f for f in folders if str(f.get("folderType") or "").lower() == "inbox"]
    if len(inbox) != 1:
        raise SetupError("inbox_not_uniquely_verified")
    folder_id = str(inbox[0].get("folderId") or "")
    if not folder_id.isdecimal():
        raise SetupError("mail_folder_id_invalid")
    return account_id, folder_id


def verify_sheet(client: httpx.Client, config: Config, access: str) -> None:
    if not config.resource_id:
        raise SetupError("workbook_mapping_missing")
    response = client.post(config.origin("sheet") + "/api/v2/" + config.resource_id,
                           headers={"Authorization": "Zoho-oauthtoken " + access},
                           data={"method": "worksheet.list"})
    data = response_json(response, "sheet_access_unverified")
    rows = data.get("worksheet_names")
    if data.get("status") != "success" or data.get("error_code") or not isinstance(rows, list):
        raise SetupError("sheet_access_unverified")
    names = {row.get("worksheet_name") for row in rows if isinstance(row, dict)}
    if not {config.patient_sheet, config.cover_sheet} <= names:
        raise SetupError("worksheet_names_need_mapping")


def bootstrap(env: MutableMapping[str, str], *, vault_factory=PgVault, client_factory=httpx.Client) -> dict[str, Any]:
    grant = env.pop("ZOHO_OAUTH_GRANT_CODE", "").strip()
    if env.get("ZOHO_BOOTSTRAP_ENABLED", "false").lower() != "true":
        return {"status": "disabled"}
    try:
        config = Config.read(env)
        if not env.get("DATABASE_URL", "").strip():
            raise SetupError("credential_database_missing")
        with vault_factory(env["DATABASE_URL"], config.slot) as vault:
            stored = vault.read()
            fingerprint = hashlib.sha256(grant.encode()).hexdigest() if grant else None
            if fingerprint and fingerprint == stored.get("grant_digest") and stored.get("state") in {"exchange_pending", "exchange_failed"}:
                raise SetupError("new_authorization_code_required")
            access = None
            refresh = env.get("ZOHO_OAUTH_REFRESH_TOKEN", "").strip()
            with client_factory(timeout=15.0, follow_redirects=False) as client:
                if fingerprint and fingerprint != stored.get("grant_digest"):
                    if refresh or stored.get("encrypted_token"):
                        raise SetupError("existing_grant_preserved_rotation_required")
                    vault.reserve(fingerprint)
                    try:
                        tokens = token_request(client, config, grant_type="authorization_code", code=grant)
                        refresh = tokens.get("refresh_token")
                        if not isinstance(refresh, str) or not refresh:
                            raise SetupError("refresh_token_not_returned")
                        vault.save(config.cipher().encrypt(refresh.encode()).decode())
                        access = tokens["access_token"]
                    except Exception:
                        vault.state("exchange_failed")
                        raise
                elif not refresh and stored.get("encrypted_token"):
                    try:
                        refresh = config.cipher().decrypt(stored["encrypted_token"].encode()).decode()
                    except Exception:
                        raise SetupError("stored_credential_cannot_be_unlocked") from None
                if not refresh:
                    return {"status": "waiting_for_authorization_code"}
                if not access:
                    access = token_request(client, config, grant_type="refresh_token", refresh_token=refresh)["access_token"]
                account_id, folder_id = discover_mail(client, config, access)
                for name, value in (("ZOHO_MAIL_ACCOUNT_ID", account_id), ("ZOHO_MAIL_FOLDER_ID", folder_id)):
                    if env.get(name, "").strip() and env[name].strip() != value:
                        raise SetupError("existing_mail_mapping_conflicts")
                env["ZOHO_OAUTH_REFRESH_TOKEN"] = refresh
                env["ZOHO_MAIL_ACCOUNT_ID"] = account_id
                env["ZOHO_MAIL_FOLDER_ID"] = folder_id
                env["EMAIL_INTAKE_MAILBOX"] = "INBOX"
                try:
                    verify_sheet(client, config, access)
                except (SetupError, httpx.HTTPError) as exc:
                    return {"status": "mail_verified_sheet_pending", "reason": str(exc) if isinstance(exc, SetupError) else "sheet_request_failed"}
                vault.state("verified")
                return {"status": "mail_and_sheet_verified", "account_id": account_id, "folder_id": folder_id}
    except SetupError as exc:
        return {"status": str(exc)}
    except Exception:
        return {"status": "setup_failed_check_configuration"}


def main() -> None:
    command = sys.argv[1:]
    if command[:1] == ["--"]:
        command = command[1:]
    if not command:
        raise SystemExit("A child service command is required")
    result = bootstrap(os.environ)
    print("zoho_bootstrap " + json.dumps(result, separators=(",", ":")), flush=True)
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()

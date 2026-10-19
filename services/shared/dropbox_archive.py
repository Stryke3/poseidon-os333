"""Verified Dropbox attachment storage; deterministic paths and no overwrite/retry."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
from typing import Mapping

import httpx

from business_mail import BusinessMailError


def content_hash(content: bytes) -> str:
    blocks = (content[i:i + 4 * 1024 * 1024] for i in range(0, len(content), 4 * 1024 * 1024))
    return hashlib.sha256(b"".join(hashlib.sha256(block).digest() for block in blocks)).hexdigest()


@dataclass(frozen=True, repr=False)
class DropboxConfig:
    app_key: str
    app_secret: str
    refresh_token: str
    namespace_id: str
    intake_path: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "DropboxConfig":
        env = os.environ if env is None else env
        keys = ("DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN",
                "DROPBOX_ROOT_NAMESPACE_ID", "DROPBOX_INTAKE_PATH")
        missing = [key for key in keys if not env.get(key, "").strip()]
        if missing:
            raise BusinessMailError("Missing Dropbox intake configuration: " + ", ".join(missing), 503)
        values = [env[key].strip() for key in keys]
        path = values[-1].rstrip("/")
        if not values[3].isdecimal() or not path.startswith("/2. SFM/") or any(
                part in {".", ".."} for part in path.split("/")) or "//" in path:
            raise BusinessMailError("Dropbox intake requires a verified namespace and StrykeFox folder path.", 503)
        return cls(*values[:-1], path)


class DropboxArchive:
    def __init__(self, client: httpx.AsyncClient, config: DropboxConfig):
        self.client, self.config = client, config
        self.headers: dict[str, str] = {}

    async def _rpc(self, route: str, payload: dict | None):
        try:
            return await self.client.post("https://api.dropboxapi.com/2/" + route,
                                          json=payload, headers=self.headers)
        except httpx.HTTPError as exc:
            raise BusinessMailError("Dropbox request could not be confirmed; reconcile before retrying.") from exc

    @staticmethod
    def _json(response: httpx.Response) -> dict:
        try:
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except ValueError as exc:
            raise BusinessMailError("Dropbox returned an incomplete response.") from exc

    async def authenticate(self):
        try:
            response = await self.client.post("https://api.dropboxapi.com/oauth2/token", data={
                "grant_type": "refresh_token", "client_id": self.config.app_key,
                "client_secret": self.config.app_secret, "refresh_token": self.config.refresh_token})
        except httpx.HTTPError as exc:
            raise BusinessMailError("Dropbox authentication could not be confirmed.") from exc
        data = self._json(response)
        if response.is_error or not isinstance(data.get("access_token"), str):
            raise BusinessMailError("Dropbox authentication failed; reconnect the configured account.")
        self.headers = {"Authorization": "Bearer " + data["access_token"]}
        response = await self._rpc("users/get_current_account", None)
        data = self._json(response)
        if response.is_error or str((data.get("root_info") or {}).get("root_namespace_id")) != self.config.namespace_id:
            raise BusinessMailError("Dropbox root namespace does not match the configured StrykeFox destination.", 503)
        self.headers["Dropbox-API-Path-Root"] = json.dumps({".tag": "root", "root": self.config.namespace_id})
        folder = await self._metadata(self.config.intake_path)
        if not folder or folder.get(".tag") != "folder":
            raise BusinessMailError("Configured Dropbox intake folder is missing or inaccessible.", 503)

    async def _metadata(self, path: str) -> dict | None:
        response = await self._rpc("files/get_metadata", {"path": path})
        data = self._json(response)
        if response.status_code == 409 and str(data.get("error_summary", "")).startswith("path/not_found/"):
            return None
        if response.is_error:
            raise BusinessMailError("Dropbox file metadata could not be verified.")
        return data

    @staticmethod
    def _verified(metadata: dict, digest: str) -> dict:
        if not metadata.get("id") or not metadata.get("rev") or metadata.get("content_hash") != digest:
            raise BusinessMailError("Dropbox file identity, revision or content hash did not verify.")
        return {key: metadata[key] for key in ("id", "rev", "content_hash")}

    async def save_attachment(self, source_identity: str, filename: str, content: bytes) -> dict:
        if not self.headers:
            raise BusinessMailError("Dropbox connection must be verified before saving attachments.", 503)
        digest = content_hash(content)
        identity = hashlib.sha256((source_identity + "\0" + filename).encode()).hexdigest()[:32]
        extension = PurePosixPath(filename).suffix.lower()
        if not re.fullmatch(r"\.[a-z0-9]{1,10}", extension):
            extension = ".bin"
        path = f"{self.config.intake_path}/{identity}_{digest}{extension}"
        metadata = await self._metadata(path)
        if metadata is not None:
            return {**self._verified(metadata, digest), "path": path, "already_archived": True}
        # No automatic upload retry. A later attempt reconciles this exact path first.
        try:
            response = await self.client.post("https://content.dropboxapi.com/2/files/upload", content=content,
                headers={**self.headers, "Content-Type": "application/octet-stream", "Dropbox-API-Arg": json.dumps({
                    "path": path, "mode": "add", "autorename": False, "mute": True, "content_hash": digest})})
        except httpx.HTTPError as exc:
            raise BusinessMailError("Dropbox upload result is unknown; reconcile the deterministic path before retrying.") from exc
        if response.is_error:
            raise BusinessMailError("Dropbox upload was not confirmed; no message was marked complete.")
        self._verified(self._json(response), digest)
        saved = await self._metadata(path)
        if saved is None:
            raise BusinessMailError("Dropbox upload could not be read back.")
        return {**self._verified(saved, digest), "path": path, "already_archived": False}

"""
POSEIDON EDI Service — Availity SFTP Client
Handles file-based EDI submission and retrieval via Availity's MFT platform.

Production: files.availity.com:22
QA/Test:    qa-files.availity.com:22

Workflow:
  837P OUT: Generate X12 → upload to /SendFiles/ → Availity routes to payer
  835 IN:   Poll mailbox → download new 835 files → parse → auto-post
  999/277:  Download acknowledgment/status files from mailbox

Reference: Availity Batch EDI Standard Companion Guide v.20251124
"""
import asyncio
import io
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger("edi.availity_sftp")

# Connection config
SFTP_HOST_PROD = os.getenv("AVAILITY_SFTP_HOST", "files.availity.com")
SFTP_HOST_QA   = os.getenv("AVAILITY_SFTP_HOST_QA", "qa-files.availity.com")
SFTP_PORT      = int(os.getenv("AVAILITY_SFTP_PORT", "22"))
SFTP_USER      = os.environ.get("AVAILITY_SFTP_USER", "")
SFTP_PASS      = os.environ.get("AVAILITY_SFTP_PASS", "")
USE_QA         = os.getenv("AVAILITY_USE_QA", "false").lower() == "true"

# Directories on Availity's SFTP server
SEND_DIR       = "/SendFiles"        # Upload 837P files here
RECEIVE_DIR    = "/"                  # Response/835 files appear in root or subfolders


class AvailitySFTPClient:
    """
    Async SFTP client for Availity's managed file transfer (MFT) platform.
    Uses asyncssh for non-blocking SFTP operations.
    """

    def __init__(self):
        self.host = SFTP_HOST_QA if USE_QA else SFTP_HOST_PROD
        self.port = SFTP_PORT
        self.user = SFTP_USER
        self.password = SFTP_PASS

    async def _connect(self):
        """Create SFTP connection. Caller must close."""
        import asyncssh

        conn = await asyncssh.connect(
            self.host,
            port=self.port,
            username=self.user,
            password=self.password,
            known_hosts=None,  # Availity's host key — accept on first connect
            connect_timeout=30,
        )
        sftp = await conn.start_sftp_client()
        return conn, sftp

    # ─── 837P SUBMISSION ─────────────────────────────────────────────────

    async def submit_837p(self, x12_content: str, filename: Optional[str] = None) -> dict:
        """
        Upload an 837P X12 file to Availity's SendFiles folder.
        Availity picks it up, validates, and routes to the appropriate payer.

        Returns: {filename, uploaded_at, size_bytes, host, folder}
        """
        if not filename:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            filename = f"837P_STRYKEFOX_{ts}.edi"

        import asyncssh

        try:
            conn, sftp = await self._connect()
            try:
                remote_path = f"{SEND_DIR}/{filename}"

                # Upload as bytes
                content_bytes = x12_content.encode("utf-8")
                file_obj = io.BytesIO(content_bytes)

                await sftp.putfo(file_obj, remote_path)

                log.info(f"837P uploaded to {self.host}:{remote_path} ({len(content_bytes)} bytes)")

                return {
                    "status": "uploaded",
                    "filename": filename,
                    "remote_path": remote_path,
                    "host": self.host,
                    "size_bytes": len(content_bytes),
                    "uploaded_at": datetime.utcnow().isoformat(),
                }
            finally:
                conn.close()

        except asyncssh.Error as e:
            log.error(f"SFTP upload failed: {e}")
            raise ValueError(f"Availity SFTP upload failed: {str(e)[:300]}")

    # ─── 835 / RESPONSE FILE RETRIEVAL ───────────────────────────────────

    async def list_mailbox(self, folder: str = "/") -> list:
        """List all files in Availity mailbox (response files, 835s, 999s)."""
        import asyncssh

        try:
            conn, sftp = await self._connect()
            try:
                entries = await sftp.readdir(folder)
                files = []
                for entry in entries:
                    if entry.filename.startswith("."):
                        continue
                    files.append({
                        "filename": entry.filename,
                        "size": entry.attrs.size,
                        "modified": datetime.fromtimestamp(entry.attrs.mtime).isoformat() if entry.attrs.mtime else None,
                        "is_dir": entry.attrs.type == asyncssh.FILEXFER_TYPE_DIRECTORY if hasattr(entry.attrs, 'type') else False,
                    })
                return files
            finally:
                conn.close()

        except asyncssh.Error as e:
            log.error(f"SFTP list failed: {e}")
            return []

    async def download_file(self, remote_path: str) -> str:
        """Download a file from Availity mailbox and return its content as string."""
        import asyncssh

        try:
            conn, sftp = await self._connect()
            try:
                file_obj = io.BytesIO()
                await sftp.getfo(remote_path, file_obj)
                file_obj.seek(0)
                content = file_obj.read().decode("utf-8", errors="replace")
                log.info(f"Downloaded {remote_path} ({len(content)} chars)")
                return content
            finally:
                conn.close()

        except asyncssh.Error as e:
            log.error(f"SFTP download failed for {remote_path}: {e}")
            raise ValueError(f"Download failed: {str(e)[:300]}")

    async def download_new_835s(self) -> list:
        """
        Scan mailbox for 835 ERA files and download any new ones.
        Returns list of {filename, content} dicts.
        """
        files = await self.list_mailbox()
        era_files = []

        for f in files:
            name = f["filename"].lower()
            # 835 files typically have .835, .era, or .edi extension
            # or contain "835" or "ERA" in the filename
            if any(ext in name for ext in [".835", ".era", "835", "remit"]):
                try:
                    content = await self.download_file(f"/{f['filename']}")
                    era_files.append({
                        "filename": f["filename"],
                        "content": content,
                        "size": f["size"],
                        "modified": f["modified"],
                    })
                except Exception as e:
                    log.warning(f"Failed to download {f['filename']}: {e}")

        return era_files

    async def download_acknowledgments(self) -> list:
        """
        Download 999/277 acknowledgment and status response files.
        """
        files = await self.list_mailbox()
        ack_files = []

        for f in files:
            name = f["filename"].lower()
            if any(ext in name for ext in [".999", ".277", "ack", "response", "ibr"]):
                try:
                    content = await self.download_file(f"/{f['filename']}")
                    ack_files.append({
                        "filename": f["filename"],
                        "content": content,
                        "size": f["size"],
                    })
                except Exception as e:
                    log.warning(f"Failed to download {f['filename']}: {e}")

        return ack_files

    # ─── HEALTH CHECK ────────────────────────────────────────────────────

    async def health_check(self) -> bool:
        """Verify SFTP connectivity to Availity."""
        if not self.user or not self.password:
            return False
        try:
            conn, sftp = await self._connect()
            await sftp.readdir("/")
            conn.close()
            return True
        except Exception:
            return False


availity_sftp = AvailitySFTPClient()

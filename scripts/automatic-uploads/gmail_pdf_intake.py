#!/usr/bin/env python3
"""Poll Gmail for auction PDF emails and reply with TasteMatcher import JSON.

This script uses the Gmail API directly because the Codex Gmail connector cannot
attach local files by path. Credentials are supplied outside the repository.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import getaddresses, parseaddr
from pathlib import Path
from typing import Any, Protocol


PROCESSED_LABEL = "Alfred/Auction PDF Processed"
DEFAULT_ALLOWED_SENDERS = ("galrubin15@gmail.com", "jaclynlavy@gmail.com")
DEFAULT_INTERVAL_MINUTES = 30
DEFAULT_CONVERTER = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "automatic-uploads"
    / "pdf_price_list_to_import_json.py"
)


class GmailService(Protocol):
    def users(self) -> Any:
        ...


@dataclass(frozen=True)
class PdfAttachment:
    filename: str
    attachment_id: str
    mime_type: str
    size: int


@dataclass(frozen=True)
class GmailMessage:
    message_id: str
    rfc_message_id: str | None
    thread_id: str
    sender: str
    subject: str
    snippet: str
    pdfs: tuple[PdfAttachment, ...]


@dataclass(frozen=True)
class ConverterResult:
    output_path: Path
    summary: dict[str, Any]


def main() -> int:
    args = parse_args()
    service = build_gmail_service(args.credentials, args.token, args.scopes)
    allowed_senders = normalize_email_set(args.allowed_sender)

    def run_once() -> int:
        return process_mailbox(
            service=service,
            allowed_senders=allowed_senders,
            converter=args.converter,
            temp_dir=args.temp_dir,
            dry_run=args.dry_run,
        )

    if not args.loop:
        return run_once()

    while True:
        try:
            run_once()
        except Exception as exc:  # pragma: no cover - operational guard
            print(f"[Alfred] Gmail PDF intake failed: {exc}", file=sys.stderr)
        time.sleep(args.interval_minutes * 60)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Poll Gmail for allowlisted auction PDFs and reply with import JSON.",
    )
    parser.add_argument(
        "--credentials",
        type=Path,
        default=env_path("GMAIL_CLIENT_SECRET_JSON"),
        help="OAuth client secret JSON. Defaults to GMAIL_CLIENT_SECRET_JSON.",
    )
    parser.add_argument(
        "--token",
        type=Path,
        default=env_path("GMAIL_TOKEN_JSON"),
        help="OAuth token cache JSON. Defaults to GMAIL_TOKEN_JSON.",
    )
    parser.add_argument(
        "--allowed-sender",
        action="append",
        default=list(DEFAULT_ALLOWED_SENDERS),
        help="Allowed sender email. Can be supplied more than once.",
    )
    parser.add_argument(
        "--converter",
        type=Path,
        default=DEFAULT_CONVERTER,
        help="Path to pdf_price_list_to_import_json.py.",
    )
    parser.add_argument(
        "--temp-dir",
        type=Path,
        default=Path("/private/tmp"),
        help="Directory for downloaded PDFs and generated JSON files.",
    )
    parser.add_argument(
        "--interval-minutes",
        type=int,
        default=DEFAULT_INTERVAL_MINUTES,
        help="Polling interval when --loop is used.",
    )
    parser.add_argument("--loop", action="store_true", help="Poll forever.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and log work without sending replies or labeling messages.",
    )
    parser.add_argument(
        "--scopes",
        nargs="*",
        default=[
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.send",
        ],
        help="Gmail OAuth scopes.",
    )
    return parser.parse_args()


def env_path(name: str) -> Path | None:
    value = os.environ.get(name)
    return Path(value).expanduser() if value else None


def build_gmail_service(
    credentials_path: Path | None,
    token_path: Path | None,
    scopes: list[str],
) -> GmailService:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise SystemExit(
            "Missing Gmail dependencies. Install with: "
            "python3 -m pip install google-api-python-client "
            "google-auth-oauthlib google-auth-httplib2",
        ) from exc

    if token_path is None:
        raise SystemExit("GMAIL_TOKEN_JSON or --token is required.")
    token_path.parent.mkdir(parents=True, exist_ok=True)

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if credentials_path is None:
            raise SystemExit("GMAIL_CLIENT_SECRET_JSON or --credentials is required.")
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), scopes)
        creds = flow.run_local_server(port=0)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds)


def process_mailbox(
    *,
    service: GmailService,
    allowed_senders: set[str],
    converter: Path,
    temp_dir: Path,
    dry_run: bool = False,
) -> int:
    label_id = ensure_label(service, PROCESSED_LABEL)
    messages = list_unprocessed_pdf_messages(
        service=service,
        allowed_senders=allowed_senders,
        processed_label=PROCESSED_LABEL,
    )
    processed = 0
    for message in messages:
        if message.sender not in allowed_senders:
            continue
        for attachment in message.pdfs:
            if not looks_like_auction_pdf(message, attachment):
                continue
            try:
                result = process_attachment(
                    service=service,
                    message=message,
                    attachment=attachment,
                    converter=converter,
                    temp_dir=temp_dir,
                )
                html = build_success_html(attachment.filename, result.summary)
                attachment_path = result.output_path
            except Exception as exc:
                html = build_failure_html(attachment.filename, str(exc))
                attachment_path = None
            if dry_run:
                print(
                    json.dumps(
                        {
                            "messageId": message.message_id,
                            "attachment": attachment.filename,
                            "status": "parsed" if attachment_path else "failed",
                        },
                    ),
                )
                continue
            send_reply(
                service=service,
                to=message.sender,
                subject=reply_subject(message.subject),
                thread_id=message.thread_id,
                in_reply_to=message.rfc_message_id,
                html=html,
                attachment=attachment_path,
            )
            add_label(service, message.message_id, label_id)
            processed += 1
    return processed


def ensure_label(service: GmailService, label_name: str) -> str:
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label.get("name") == label_name:
            return str(label["id"])
    created = (
        service.users()
        .labels()
        .create(
            userId="me",
            body={
                "name": label_name,
                "labelListVisibility": "labelShow",
                "messageListVisibility": "show",
            },
        )
        .execute()
    )
    return str(created["id"])


def list_unprocessed_pdf_messages(
    *,
    service: GmailService,
    allowed_senders: set[str],
    processed_label: str,
) -> list[GmailMessage]:
    sender_query = " OR ".join(f"from:{sender}" for sender in sorted(allowed_senders))
    query = (
        f"({sender_query}) has:attachment filename:pdf -in:spam -in:trash "
        f'-label:"{processed_label}"'
    )
    response = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=25)
        .execute()
    )
    messages = []
    for item in response.get("messages", []):
        raw = (
            service.users()
            .messages()
            .get(userId="me", id=item["id"], format="full")
            .execute()
        )
        parsed = parse_message(raw)
        if parsed and parsed.sender in allowed_senders:
            messages.append(parsed)
    return messages


def parse_message(raw: dict[str, Any]) -> GmailMessage | None:
    payload = raw.get("payload", {})
    headers = {
        header.get("name", "").lower(): header.get("value", "")
        for header in payload.get("headers", [])
    }
    sender = normalize_email(parseaddr(headers.get("from", ""))[1])
    subject = headers.get("subject", "")
    pdfs = tuple(extract_pdf_attachments(payload))
    if not sender or not pdfs:
        return None
    return GmailMessage(
        message_id=str(raw["id"]),
        rfc_message_id=headers.get("message-id") or None,
        thread_id=str(raw.get("threadId", "")),
        sender=sender,
        subject=subject,
        snippet=str(raw.get("snippet", "")),
        pdfs=pdfs,
    )


def extract_pdf_attachments(payload: dict[str, Any]) -> list[PdfAttachment]:
    attachments = []
    stack = [payload]
    while stack:
        part = stack.pop()
        stack.extend(part.get("parts", []))
        filename = part.get("filename") or ""
        body = part.get("body", {})
        attachment_id = body.get("attachmentId")
        mime_type = part.get("mimeType") or mimetypes.guess_type(filename)[0] or ""
        if (
            filename.lower().endswith(".pdf")
            and attachment_id
            and mime_type in {"application/pdf", "application/octet-stream"}
        ):
            attachments.append(
                PdfAttachment(
                    filename=filename,
                    attachment_id=str(attachment_id),
                    mime_type=mime_type,
                    size=int(body.get("size") or 0),
                ),
            )
    return attachments


def process_attachment(
    *,
    service: GmailService,
    message: GmailMessage,
    attachment: PdfAttachment,
    converter: Path,
    temp_dir: Path,
) -> ConverterResult:
    temp_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = temp_dir / f"alfred-auction-pdf-{message.message_id}-{safe_name(attachment.filename)}"
    output_path = temp_dir / f"alfred-auction-import-{message.message_id}-{Path(attachment.filename).stem}.json"
    data = (
        service.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message.message_id, id=attachment.attachment_id)
        .execute()
        .get("data", "")
    )
    pdf_path.write_bytes(base64.urlsafe_b64decode(pad_base64(data)))
    summary = run_converter(
        converter=converter,
        pdf_path=pdf_path,
        output_path=output_path,
        source_id=f"gmail:{message.message_id}:{attachment.filename}",
    )
    if not output_path.exists() or summary.get("includedCount", 0) < 1:
        raise RuntimeError(f"PDF did not produce a usable import file: {attachment.filename}")
    return ConverterResult(output_path=output_path, summary=summary)


def run_converter(
    *,
    converter: Path,
    pdf_path: Path,
    output_path: Path,
    source_id: str,
) -> dict[str, Any]:
    completed = subprocess.run(
        [
            sys.executable,
            str(converter),
            str(pdf_path),
            "--output",
            str(output_path),
            "--source-id",
            source_id,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def build_success_html(filename: str, summary: dict[str, Any]) -> str:
    missing = summary.get("missing", {})
    return (
        "<strong>[Alfred]</strong><br><br>"
        "Alfred, Gal's AI agent, processed the attached auction PDF on Gal's behalf "
        "and generated an Automatic Uploads import file for TasteMatcher.<br><br>"
        "<strong>Process summary</strong><br>"
        "<ul>"
        f"<li>PDF: {html_escape(filename)}</li>"
        f"<li>Artworks parsed: {summary.get('artworkCount', 0)}</li>"
        f"<li>Included in import file: {summary.get('includedCount', 0)}</li>"
        f"<li>Excluded from import file: {summary.get('excludedCount', 0)}</li>"
        f"<li>Missing title: {missing.get('title', 0)}</li>"
        f"<li>Missing artist: {missing.get('artist', 0)}</li>"
        f"<li>Missing price: {missing.get('price', 0)}</li>"
        f"<li>Missing end date: {missing.get('endDate', 0)}</li>"
        f"<li>Missing image: {missing.get('image', 0)}</li>"
        f"<li>Warnings: {summary.get('warningCount', 0)}</li>"
        "</ul>"
        "The attached JSON file can be uploaded from the Automatic Uploads Import file tab. "
        "Please review the generated drafts before approving them."
    )


def build_failure_html(filename: str, reason: str) -> str:
    return (
        "<strong>[Alfred]</strong><br><br>"
        "Alfred, Gal's AI agent, tried to process the attached auction PDF on Gal's behalf, "
        "but could not generate a usable Automatic Uploads import file.<br><br>"
        "<strong>Failure summary</strong><br>"
        "<ul>"
        f"<li>PDF: {html_escape(filename)}</li>"
        f"<li>Reason: {html_escape(reason)}</li>"
        "</ul>"
        "No upload was performed."
    )


def send_reply(
    *,
    service: GmailService,
    to: str,
    subject: str,
    thread_id: str,
    in_reply_to: str | None,
    html: str,
    attachment: Path | None,
) -> str:
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
        message["References"] = in_reply_to
    message.set_content(strip_html(html))
    message.add_alternative(html, subtype="html")
    if attachment:
        message.add_attachment(
            attachment.read_bytes(),
            maintype="application",
            subtype="json",
            filename=attachment.name,
        )
    encoded = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    sent = (
        service.users()
        .messages()
        .send(userId="me", body={"raw": encoded, "threadId": thread_id})
        .execute()
    )
    return str(sent["id"])


def add_label(service: GmailService, message_id: str, label_id: str) -> None:
    service.users().messages().modify(
        userId="me",
        id=message_id,
        body={"addLabelIds": [label_id]},
    ).execute()


def looks_like_auction_pdf(message: GmailMessage, attachment: PdfAttachment) -> bool:
    haystack = " ".join(
        [
            message.subject,
            message.snippet,
            attachment.filename,
        ],
    ).lower()
    signals = [
        "auction",
        "price list",
        "price-list",
        "selling exhibition",
        "phillips",
        "sotheby",
        "christie",
    ]
    return any(signal in haystack for signal in signals)


def normalize_email_set(values: list[str]) -> set[str]:
    return {normalize_email(value) for value in values if normalize_email(value)}


def normalize_email(value: str) -> str:
    return value.strip().lower()


def reply_subject(subject: str) -> str:
    return subject if subject.lower().startswith("re:") else f"Re: {subject or 'Auction PDF'}"


def pad_base64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return (value + padding).encode("ascii")


def safe_name(value: str) -> str:
    safe = "".join(char if char.isalnum() or char in ".-_" else "-" for char in value)
    return safe.strip("-") or "attachment.pdf"


def strip_html(value: str) -> str:
    return (
        value.replace("<br>", "\n")
        .replace("<br />", "\n")
        .replace("<strong>", "")
        .replace("</strong>", "")
        .replace("<ul>", "")
        .replace("</ul>", "")
        .replace("<li>", "- ")
        .replace("</li>", "\n")
    )


def html_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


if __name__ == "__main__":
    raise SystemExit(main())

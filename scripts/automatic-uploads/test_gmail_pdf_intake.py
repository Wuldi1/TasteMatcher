import base64
import email
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("gmail_pdf_intake.py")
SPEC = importlib.util.spec_from_file_location("gmail_pdf_intake", MODULE_PATH)
gmail_pdf_intake = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["gmail_pdf_intake"] = gmail_pdf_intake
SPEC.loader.exec_module(gmail_pdf_intake)


class Request:
    def __init__(self, value=None, callback=None):
        self.value = value
        self.callback = callback

    def execute(self):
        if self.callback:
            return self.callback()
        return self.value


class FakeLabels:
    def __init__(self):
        self.labels = [{"id": "Label_6", "name": gmail_pdf_intake.PROCESSED_LABEL}]

    def list(self, userId):
        return Request({"labels": self.labels})

    def create(self, userId, body):
        created = {"id": "Label_new", "name": body["name"]}
        self.labels.append(created)
        return Request(created)


class FakeAttachments:
    def __init__(self, pdf_bytes):
        self.pdf_bytes = pdf_bytes

    def get(self, userId, messageId, id):
        data = base64.urlsafe_b64encode(self.pdf_bytes).decode("ascii").rstrip("=")
        return Request({"data": data})


class FakeMessages:
    def __init__(self, raw_message, pdf_bytes=b"%PDF-1.4"):
        self.raw_message = raw_message
        self.sent = []
        self.modified = []
        self._attachments = FakeAttachments(pdf_bytes)

    def list(self, userId, q, maxResults):
        self.last_query = q
        return Request({"messages": [{"id": self.raw_message["id"]}]})

    def get(self, userId, id, format):
        return Request(self.raw_message)

    def send(self, userId, body):
        self.sent.append(body)
        return Request({"id": "sent-message-id"})

    def modify(self, userId, id, body):
        self.modified.append({"id": id, "body": body})
        return Request({})

    def attachments(self):
        return self._attachments


class FakeUsers:
    def __init__(self, labels, messages):
        self._labels = labels
        self._messages = messages

    def labels(self):
        return self._labels

    def messages(self):
        return self._messages


class FakeService:
    def __init__(self, raw_message, pdf_bytes=b"%PDF-1.4"):
        self.labels = FakeLabels()
        self.messages = FakeMessages(raw_message, pdf_bytes)
        self._users = FakeUsers(self.labels, self.messages)

    def users(self):
        return self._users


def raw_gmail_message(
    *,
    sender="Gal Rubin <galrubin15@gmail.com>",
    subject="TasteMatcher - Auction",
    filename="EX010926_Summer Wave_Price List.pdf",
):
    return {
        "id": "msg-1",
        "threadId": "thread-1",
        "snippet": "Can you process this auction PDF?",
        "payload": {
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Message-ID", "value": "<source-message@example.com>"},
            ],
            "parts": [
                {
                    "filename": filename,
                    "mimeType": "application/pdf",
                    "body": {"attachmentId": "att-1", "size": 1234},
                }
            ],
        },
    }


class GmailPdfIntakeTests(unittest.TestCase):
    def test_main_returns_success_after_processing_messages(self):
        args = mock.Mock(
            credentials=None,
            token=None,
            scopes=[],
            allowed_sender=["galrubin15@gmail.com"],
            converter=Path("converter.py"),
            temp_dir=Path("/private/tmp"),
            api_url="https://api.tastematcher.art",
            api_key="secret",
            dry_run=False,
            loop=False,
        )
        with mock.patch.object(gmail_pdf_intake, "parse_args", return_value=args):
            with mock.patch.object(
                gmail_pdf_intake,
                "build_gmail_service",
                return_value=mock.Mock(),
            ):
                with mock.patch.object(
                    gmail_pdf_intake,
                    "process_mailbox",
                    return_value=1,
                ):
                    with mock.patch("builtins.print") as print_output:
                        exit_code = gmail_pdf_intake.main()

        self.assertEqual(exit_code, 0)
        print_output.assert_called_once_with(json.dumps({"processed": 1}))

    def test_default_allowlist_includes_gal_and_jaclyn(self):
        self.assertEqual(
            set(gmail_pdf_intake.DEFAULT_ALLOWED_SENDERS),
            {"galrubin15@gmail.com", "jaclynlavy@gmail.com"},
        )

    def test_operational_replies_use_premium_shell_and_escape_content(self):
        success = gmail_pdf_intake.build_success_html(
            "auction & notes.pdf",
            {
                "artworkCount": 2,
                "includedCount": 1,
                "excludedCount": 1,
                "missing": {},
                "warningCount": 0,
            },
        )
        failure = gmail_pdf_intake.build_failure_html(
            "<auction>.pdf", "Invalid <script>"
        )

        for html in (success, failure):
            self.assertTrue(html.startswith("<strong>[Alfred]</strong>"))
            self.assertIn("background:#f6f4ef", html)
            self.assertIn("background:#23372d", html)
            self.assertIn("/privacy-policy", html)
            self.assertIn("/terms-of-service", html)
        self.assertIn("auction &amp; notes.pdf", success)
        self.assertIn("&lt;auction&gt;.pdf", failure)
        self.assertNotIn("<script>", failure)

    def test_parse_message_extracts_sender_rfc_id_and_pdf_attachments(self):
        parsed = gmail_pdf_intake.parse_message(raw_gmail_message())

        self.assertEqual(parsed.sender, "galrubin15@gmail.com")
        self.assertEqual(parsed.rfc_message_id, "<source-message@example.com>")
        self.assertEqual(parsed.thread_id, "thread-1")
        self.assertEqual(len(parsed.pdfs), 1)
        self.assertEqual(parsed.pdfs[0].attachment_id, "att-1")

    def test_auction_filter_skips_unrelated_personal_pdfs(self):
        message = gmail_pdf_intake.GmailMessage(
            message_id="msg-1",
            rfc_message_id=None,
            thread_id="thread-1",
            sender="galrubin15@gmail.com",
            subject="medical documents",
            snippet="forms for the clinic",
            pdfs=(),
        )
        attachment = gmail_pdf_intake.PdfAttachment(
            filename="Reef.pdf",
            attachment_id="att-1",
            mime_type="application/pdf",
            size=10,
        )

        self.assertFalse(gmail_pdf_intake.looks_like_auction_pdf(message, attachment))

    def test_send_reply_builds_mime_message_without_attachment(self):
        service = FakeService(raw_gmail_message())
        sent_id = gmail_pdf_intake.send_reply(
            service=service,
            to="galrubin15@gmail.com",
            subject="Re: TasteMatcher - Auction",
            thread_id="thread-1",
            in_reply_to="<source-message@example.com>",
            html="<strong>[Alfred]</strong><br>Processed.",
        )

        self.assertEqual(sent_id, "sent-message-id")
        self.assertEqual(service.messages.sent[0]["threadId"], "thread-1")
        raw = base64.urlsafe_b64decode(service.messages.sent[0]["raw"])
        parsed = email.message_from_bytes(raw)
        filenames = [part.get_filename() for part in parsed.walk()]
        self.assertEqual([name for name in filenames if name], [])
        self.assertEqual(parsed["In-Reply-To"], "<source-message@example.com>")

    def test_multipart_intake_contains_source_import_and_metadata(self):
        body = gmail_pdf_intake.build_multipart_body(
            "boundary",
            {"senderEmail": "jaclynlavy@gmail.com", "gmailMessageId": "msg-1"},
            {
                "pdf": ("auction.pdf", "application/pdf", b"%PDF"),
                "importFile": ("auction.json", "application/json", b'{"version":1}'),
            },
        )

        self.assertIn(b'name="senderEmail"', body)
        self.assertIn(b"jaclynlavy@gmail.com", body)
        self.assertIn(b'name="pdf"; filename="auction.pdf"', body)
        self.assertIn(b'name="importFile"; filename="auction.json"', body)

    def test_process_mailbox_sends_reply_and_labels_after_success(self):
        service = FakeService(raw_gmail_message())
        with tempfile.TemporaryDirectory() as tmp:
            temp_dir = Path(tmp)
            output_path = temp_dir / "generated.json"
            output_path.write_text(json.dumps({"version": 1}), encoding="utf-8")
            pdf_path = temp_dir / "source.pdf"
            pdf_path.write_bytes(b"%PDF-1.4")
            summary = {
                "artworkCount": 2,
                "includedCount": 2,
                "excludedCount": 0,
                "missing": {
                    "title": 0,
                    "artist": 0,
                    "price": 0,
                    "endDate": 0,
                    "image": 0,
                },
                "warningCount": 0,
            }

            with mock.patch.object(
                gmail_pdf_intake,
                "run_converter",
                return_value=summary,
            ):
                with mock.patch.object(
                    gmail_pdf_intake,
                    "process_attachment",
                    return_value=gmail_pdf_intake.ConverterResult(
                        pdf_path, output_path, summary
                    ),
                ):
                    with mock.patch.object(
                        gmail_pdf_intake,
                        "upload_pdf_intake",
                        return_value={"intakeId": "pdf-intake-1"},
                    ) as upload:
                        processed = gmail_pdf_intake.process_mailbox(
                            service=service,
                            allowed_senders={
                                "galrubin15@gmail.com",
                                "jaclynlavy@gmail.com",
                            },
                            converter=Path("converter.py"),
                            temp_dir=temp_dir,
                            api_url="https://api.tastematcher.art",
                            api_key="secret",
                        )

        self.assertEqual(processed, 1)
        upload.assert_called_once()
        self.assertEqual(len(service.messages.sent), 1)
        self.assertEqual(
            service.messages.modified,
            [{"id": "msg-1", "body": {"addLabelIds": ["Label_6"]}}],
        )


if __name__ == "__main__":
    unittest.main()

# Automatic Upload PDF Intake

`gmail_pdf_intake.py` polls Gmail for allowlisted auction PDFs, converts each PDF
to the existing import JSON format, sends both artifacts to the private Web API
intake endpoint, and replies to the original thread with a processing summary.
It does not attach JSON files and does not create artworks automatically.

## Required environment

```sh
export GMAIL_CLIENT_SECRET_JSON=/absolute/path/to/client-secret.json
export GMAIL_TOKEN_JSON=/absolute/path/to/gmail-token.json
export TASTEMATCHER_API_URL=https://api.tastematcher.art
export AUTOMATIC_UPLOAD_INTAKE_API_KEY='same-secret-configured-on-the-web-api'
```

The Web API also requires:

```sh
AUTOMATIC_UPLOAD_INTAKE_API_KEY=
AUTOMATIC_UPLOAD_INTAKE_DOMAIN_ID=
AUTOMATIC_UPLOAD_INTAKE_SENDER=galrubin15@gmail.com,jaclynlavy@gmail.com
```

The API key should be a high-entropy secret. The configured domain and
comma-separated sender allowlist are authoritative: the Gmail worker cannot
select another domain through form fields. Source PDFs and generated artifacts are stored in the private
`automatic-upload-pdf-intakes` container under the domain prefix.

## Run once

```sh
python3 scripts/automatic-uploads/gmail_pdf_intake.py
```

Use `--dry-run` to download and parse matching PDFs without uploading, replying,
or labeling messages. The scheduled Codex automation should execute one run every
30 minutes instead of using `--loop`.

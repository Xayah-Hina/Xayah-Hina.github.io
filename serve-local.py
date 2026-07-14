from __future__ import annotations

import base64
import binascii
import json
import os
import re
import secrets
import tempfile
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
JOURNALS = ROOT / "journals"
CATALOG = JOURNALS / "catalog.js"
HOST = "127.0.0.1"
PORT = 8765
TOKEN = secrets.token_urlsafe(32)
MAX_REQUEST_BYTES = 128 * 1024 * 1024
MAX_IMAGE_BYTES = 32 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": {"jpg", "jpeg"},
    "image/png": {"png"},
    "image/webp": {"webp"},
    "image/gif": {"gif"},
    "image/avif": {"avif"},
}
ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$")
IMAGE_PATH_PATTERN = re.compile(
    r"^journals/images/(?P<year>\d{4})/(?P<name>[A-Za-z0-9._-]+)$"
)


class JournalError(Exception):
    pass


def module_data(path: Path, expected_type: type):
    try:
        source = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError as error:
        raise JournalError(f"Missing {path.name}.") from error

    prefix = "export default "
    if not source.startswith(prefix) or not source.endswith(";"):
        raise JournalError(f"{path.name} is not a JSON-compatible ES module.")

    try:
        value = json.loads(source[len(prefix) : -1])
    except json.JSONDecodeError as error:
        raise JournalError(f"{path.name} contains invalid JSON data.") from error

    if not isinstance(value, expected_type):
        raise JournalError(f"{path.name} has an invalid top-level value.")
    return value


def module_source(value) -> bytes:
    text = "export default " + json.dumps(value, ensure_ascii=False, indent=2) + ";\n"
    return text.encode("utf-8")


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def restore_file(path: Path, previous: bytes | None) -> None:
    if previous is None:
        path.unlink(missing_ok=True)
    else:
        atomic_write(path, previous)


def catalog_years() -> list[str]:
    catalog = module_data(CATALOG, dict)
    raw_years = catalog.get("years")
    if not isinstance(raw_years, list):
        raise JournalError("catalog.js must contain a years array.")
    years = {str(year) for year in raw_years if re.fullmatch(r"\d{4}", str(year))}
    return sorted(years, reverse=True)


def read_year(year: str, required: bool = True) -> list[dict]:
    path = JOURNALS / f"{year}.js"
    if not path.exists() and not required:
        return []
    entries = module_data(path, list)
    for entry in entries:
        if not isinstance(entry, dict) or str(entry.get("publishedAt", ""))[:4] != year:
            raise JournalError(f"{year}.js contains an entry from another year.")
    return entries


def normalize_years(years) -> list[str]:
    normalized = {str(year) for year in years if re.fullmatch(r"\d{4}", str(year))}
    return sorted(normalized, reverse=True)


def singapore_timestamp() -> str:
    value = datetime.now(ZoneInfo("Asia/Singapore"))
    return value.isoformat(timespec="seconds")


def validate_related(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise JournalError("Related Writing is invalid.")
    label = value.get("label")
    url = value.get("url")
    if not isinstance(label, str) or not label.strip() or not isinstance(url, str) or not url.strip():
        raise JournalError("Related Writing requires both a label and a URL.")
    parsed = urlsplit(url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        raise JournalError("Related URL must be an HTTP, HTTPS, or local page link.")
    return {"label": label.strip(), "url": url.strip()}


def validate_content(value) -> list[dict]:
    if not isinstance(value, list):
        raise JournalError("Journal content is invalid.")
    result = []
    for part in value:
        if not isinstance(part, dict) or part.get("lang") not in {"en", "zh-CN"}:
            raise JournalError("Journal content has an unsupported language.")
        text = part.get("text")
        if not isinstance(text, str) or not text.strip():
            raise JournalError("Journal content contains an empty text block.")
        if len(text) > 100_000:
            raise JournalError("Journal content is too long.")
        result.append({"lang": part["lang"], "text": text.strip()})
    return result


def image_bytes(upload: dict) -> tuple[bytes, str]:
    media_type = upload.get("type")
    original_name = upload.get("name")
    encoded = upload.get("data")
    if media_type not in ALLOWED_IMAGE_TYPES or not isinstance(original_name, str) or not isinstance(encoded, str):
        raise JournalError("An uploaded image is invalid.")

    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension not in ALLOWED_IMAGE_TYPES[media_type]:
        extension = sorted(ALLOWED_IMAGE_TYPES[media_type])[0]
    try:
        content = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise JournalError("An uploaded image could not be decoded.") from error
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise JournalError("Each image must be between 1 byte and 32 MiB.")

    signatures = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
        "image/gif": content.startswith((b"GIF87a", b"GIF89a")),
        "image/avif": len(content) >= 16 and content[4:8] == b"ftyp" and content[8:12] in {b"avif", b"avis"},
    }
    if not signatures[media_type]:
        raise JournalError("An uploaded file does not match its image format.")
    return content, extension


def safe_image_path(src: str, year: str, journal_id: str) -> Path:
    match = IMAGE_PATH_PATTERN.fullmatch(src)
    if not match or match.group("year") != year:
        raise JournalError("A Journal image path is invalid.")
    name = match.group("name")
    if not name.startswith(f"{journal_id}-") or name == ".gitkeep":
        raise JournalError("A Journal image does not belong to this entry.")
    path = JOURNALS / "images" / year / name
    if JOURNALS not in path.resolve().parents:
        raise JournalError("A Journal image path escapes the journals directory.")
    return path


def journal_without_updated_at(entry: dict) -> dict:
    value = json.loads(json.dumps(entry, ensure_ascii=False))
    value.pop("updatedAt", None)
    return value


def write_journal_state(year: str, entries: list[dict], years: list[str]) -> None:
    year_path = JOURNALS / f"{year}.js"
    previous_year = year_path.read_bytes() if year_path.exists() else None
    previous_catalog = CATALOG.read_bytes() if CATALOG.exists() else None
    try:
        if entries:
            atomic_write(year_path, module_source(entries))
        else:
            year_path.unlink(missing_ok=True)
        atomic_write(CATALOG, module_source({"years": [int(value) for value in years]}))
    except Exception:
        try:
            restore_file(year_path, previous_year)
            restore_file(CATALOG, previous_catalog)
        except Exception as rollback_error:
            print(f"Journal rollback failed: {rollback_error}")
        raise


def prepare_images(payload: dict, candidate: dict, original: dict | None, year: str, journal_id: str):
    image_specs = payload.get("images")
    uploads = payload.get("uploads")
    if not isinstance(image_specs, list) or not isinstance(uploads, list):
        raise JournalError("Journal images are invalid.")

    original_images = {
        image.get("src"): image
        for image in (original or {}).get("images", [])
        if isinstance(image, dict) and isinstance(image.get("src"), str)
    }
    uploads_by_key = {}
    for upload in uploads:
        if not isinstance(upload, dict) or not isinstance(upload.get("key"), str):
            raise JournalError("An uploaded image is invalid.")
        if upload["key"] in uploads_by_key:
            raise JournalError("An uploaded image key is duplicated.")
        uploads_by_key[upload["key"]] = upload

    image_directory = JOURNALS / "images" / year
    image_directory.mkdir(parents=True, exist_ok=True)
    (image_directory / ".gitkeep").touch(exist_ok=True)
    used_indices = set()
    for src in original_images:
        match = re.search(r"-(\d+)\.[A-Za-z0-9]+$", src)
        if match:
            used_indices.add(int(match.group(1)))

    next_index = 1
    prepared = []
    new_files = []
    used_upload_keys = set()
    for spec in image_specs:
        if not isinstance(spec, dict) or spec.get("kind") not in {"existing", "new"}:
            raise JournalError("A Journal image descriptor is invalid.")
        alt = spec.get("alt", "")
        if not isinstance(alt, str):
            raise JournalError("Image alternative text is invalid.")

        if spec["kind"] == "existing":
            src = spec.get("src")
            if src not in original_images:
                raise JournalError("An existing image is not part of this Journal entry.")
            path = safe_image_path(src, year, journal_id)
            if not path.exists():
                raise JournalError(f"Existing image {path.name} is missing.")
            prepared.append({"src": src, "alt": alt.strip()})
            continue

        key = spec.get("key")
        if key not in uploads_by_key or key in used_upload_keys:
            raise JournalError("An uploaded image does not match its descriptor.")
        used_upload_keys.add(key)
        content, extension = image_bytes(uploads_by_key[key])
        while next_index in used_indices:
            next_index += 1
        name = f"{journal_id}-{next_index:02d}.{extension}"
        used_indices.add(next_index)
        next_index += 1
        path = image_directory / name
        prepared.append({"src": f"journals/images/{year}/{name}", "alt": alt.strip()})
        new_files.append((path, content))

    if used_upload_keys != set(uploads_by_key):
        raise JournalError("The request contains an unused image upload.")
    candidate["images"] = prepared
    return new_files, original_images


def save_journal(payload: dict) -> dict:
    mode = payload.get("mode")
    if mode not in {"create", "edit"}:
        raise JournalError("Journal save mode is invalid.")
    candidate = payload.get("entry")
    if not isinstance(candidate, dict):
        raise JournalError("Journal entry is invalid.")

    candidate = {
        "id": candidate.get("id"),
        "publishedAt": candidate.get("publishedAt"),
        "content": validate_content(candidate.get("content")),
        "images": [],
        "relatedWriting": validate_related(candidate.get("relatedWriting")),
    }
    journal_id = candidate["id"]
    published_at = candidate["publishedAt"]
    if not isinstance(journal_id, str) or not ID_PATTERN.fullmatch(journal_id):
        raise JournalError("Journal id is invalid.")
    if not isinstance(published_at, str) or not re.match(r"^\d{4}-\d{2}-\d{2}T", published_at):
        raise JournalError("Journal publication time is invalid.")
    year = published_at[:4]
    try:
        datetime.fromisoformat(published_at)
    except ValueError as error:
        raise JournalError("Journal publication time is invalid.") from error

    years = catalog_years()
    previous_entries = read_year(year, required=year in years)
    original = next((entry for entry in previous_entries if entry.get("id") == journal_id), None)
    if mode == "create" and original is not None:
        raise JournalError("Journal id already exists.")
    if mode == "edit" and original is None:
        raise JournalError("The Journal entry is no longer available.")
    if original and original.get("publishedAt") != published_at:
        raise JournalError("The Journal publication time cannot be changed.")

    new_files, original_images = prepare_images(payload, candidate, original, year, journal_id)
    if not candidate["content"] and not candidate["images"]:
        raise JournalError("Add content or at least one image.")

    if original and journal_without_updated_at(candidate) == journal_without_updated_at(original):
        return {"year": year, "years": years, "entries": previous_entries, "status": "unchanged", "cleanupFailures": []}
    if original:
        candidate["updatedAt"] = singapore_timestamp()

    next_entries = [candidate if entry.get("id") == journal_id else entry for entry in previous_entries]
    if mode == "create":
        next_entries.append(candidate)
    next_entries.sort(key=lambda entry: str(entry.get("publishedAt", "")), reverse=True)
    next_years = normalize_years([*years, year])

    written = []
    try:
        for path, content in new_files:
            if path.exists():
                raise JournalError(f"Image {path.name} already exists.")
            atomic_write(path, content)
            written.append(path)
        write_journal_state(year, next_entries, next_years)
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise

    retained = {image["src"] for image in candidate["images"]}
    cleanup_failures = []
    for src in original_images:
        if src in retained:
            continue
        path = safe_image_path(src, year, journal_id)
        try:
            path.unlink(missing_ok=True)
        except OSError:
            cleanup_failures.append(path.name)

    return {
        "year": year,
        "years": next_years,
        "entries": next_entries,
        "status": "updated" if original else "created",
        "cleanupFailures": cleanup_failures,
    }


def delete_journal(payload: dict) -> dict:
    year = str(payload.get("year", ""))
    journal_id = payload.get("id")
    if not re.fullmatch(r"\d{4}", year) or not isinstance(journal_id, str):
        raise JournalError("Journal deletion request is invalid.")
    years = catalog_years()
    if year not in years:
        raise JournalError("The Journal year is no longer available.")
    previous_entries = read_year(year)
    original = next((entry for entry in previous_entries if entry.get("id") == journal_id), None)
    if original is None:
        raise JournalError("The Journal entry is no longer available.")

    next_entries = [entry for entry in previous_entries if entry.get("id") != journal_id]
    next_years = years if next_entries else [value for value in years if value != year]
    write_journal_state(year, next_entries, next_years)

    cleanup_failures = []
    for image in original.get("images", []):
        try:
            path = safe_image_path(image.get("src", ""), year, journal_id)
            path.unlink(missing_ok=True)
        except (JournalError, OSError):
            cleanup_failures.append(str(image.get("src", "")))

    image_directory = JOURNALS / "images" / year
    image_directory.mkdir(parents=True, exist_ok=True)
    (image_directory / ".gitkeep").touch(exist_ok=True)
    return {
        "year": year,
        "years": next_years,
        "entries": next_entries,
        "status": "deleted",
        "cleanupFailures": cleanup_failures,
    }


class LocalJournalHandler(SimpleHTTPRequestHandler):
    server_version = "XayahJournal/1.0"

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def api_json(self, status: HTTPStatus, value: dict) -> None:
        content = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def allowed_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlsplit(origin)
        return parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"} and parsed.port == PORT

    def do_GET(self):
        if urlsplit(self.path).path == "/api/journal/status":
            if not self.allowed_origin():
                self.api_json(HTTPStatus.FORBIDDEN, {"error": "Local editor origin rejected."})
                return
            try:
                years = catalog_years()
                self.api_json(HTTPStatus.OK, {"authoring": True, "token": TOKEN, "years": years})
            except (JournalError, OSError) as error:
                self.api_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
            return
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in {"/api/journal/save", "/api/journal/delete"}:
            self.api_json(HTTPStatus.NOT_FOUND, {"error": "Unknown local editor endpoint."})
            return
        if not self.allowed_origin() or self.headers.get("X-Journal-Token") != TOKEN:
            self.api_json(HTTPStatus.FORBIDDEN, {"error": "Local editor authorization failed."})
            return
        if self.headers.get_content_type() != "application/json":
            self.api_json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "Expected an application/json request."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self.api_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Journal request is empty or too large."})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise JournalError("Journal request is invalid.")
            result = save_journal(payload) if path.endswith("/save") else delete_journal(payload)
            self.api_json(HTTPStatus.OK, result)
        except (JournalError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self.api_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except OSError as error:
            self.api_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Local write failed: {error}"})
        except Exception as error:
            print(f"Unexpected local editor error: {error}")
            self.api_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "The local editor encountered an unexpected error."})

    def do_OPTIONS(self):
        self.api_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Cross-origin requests are not supported."})


def main() -> None:
    if not (ROOT / "index.html").is_file() or not CATALOG.is_file():
        raise SystemExit("serve-local.py must be run from the xayah-hina.github.io repository.")
    handler = partial(LocalJournalHandler, directory=str(ROOT))
    with ThreadingHTTPServer((HOST, PORT), handler) as server:
        print(f"Writing local editor: http://localhost:{PORT}/#journal")
        print("Writes are restricted to the journals directory. Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nLocal editor stopped.")


if __name__ == "__main__":
    main()

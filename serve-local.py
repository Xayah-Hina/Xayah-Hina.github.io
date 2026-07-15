from __future__ import annotations

import base64
import binascii
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
JOURNALS = ROOT / "journals"
JOURNAL_CATALOG = JOURNALS / "catalog.js"
WRITING = ROOT / "writing"
WRITING_CATALOG = WRITING / "catalog.js"
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
WRITING_ID_PATTERN = re.compile(r"^\d{8}-\d{6}$")
WRITING_MUTATION_LOCK = threading.RLock()


class LocalEditorError(Exception):
    pass


class JournalError(LocalEditorError):
    pass


class WritingError(LocalEditorError):
    pass


def module_data(path: Path, expected_type: type):
    try:
        source = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError as error:
        raise LocalEditorError(f"Missing {path.name}.") from error

    prefix = "export default "
    if not source.startswith(prefix) or not source.endswith(";"):
        raise LocalEditorError(f"{path.name} is not a JSON-compatible ES module.")

    try:
        value = json.loads(source[len(prefix) : -1])
    except json.JSONDecodeError as error:
        raise LocalEditorError(f"{path.name} contains invalid JSON data.") from error

    if not isinstance(value, expected_type):
        raise LocalEditorError(f"{path.name} has an invalid top-level value.")
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
    catalog = module_data(JOURNAL_CATALOG, dict)
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
    previous_catalog = JOURNAL_CATALOG.read_bytes() if JOURNAL_CATALOG.exists() else None
    try:
        if entries:
            atomic_write(year_path, module_source(entries))
        else:
            year_path.unlink(missing_ok=True)
        atomic_write(JOURNAL_CATALOG, module_source({"years": [int(value) for value in years]}))
    except Exception:
        try:
            restore_file(year_path, previous_year)
            restore_file(JOURNAL_CATALOG, previous_catalog)
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


def writing_catalog_years() -> list[str]:
    catalog = module_data(WRITING_CATALOG, dict)
    raw_years = catalog.get("years")
    if not isinstance(raw_years, list):
        raise WritingError("writing/catalog.js must contain a years array.")
    return normalize_years(raw_years)


def validate_writing_id(value) -> str:
    if not isinstance(value, str) or not WRITING_ID_PATTERN.fullmatch(value):
        raise WritingError("Writing id must use YYYYMMDD-HHMMSS.")
    try:
        parsed = datetime.strptime(value, "%Y%m%d-%H%M%S")
    except ValueError as error:
        raise WritingError("Writing id contains an invalid date or time.") from error
    if parsed.strftime("%Y%m%d-%H%M%S") != value:
        raise WritingError("Writing id contains an invalid date or time.")
    return value


def writing_document_paths(writing_id: str) -> tuple[Path, Path, str]:
    writing_id = validate_writing_id(writing_id)
    directory = WRITING / writing_id
    source = directory / f"{writing_id}.tex"
    pdf = directory / f"{writing_id}.pdf"
    if WRITING not in source.resolve().parents or WRITING not in pdf.resolve().parents:
        raise WritingError("Writing path escapes the writing directory.")
    url = f"writing/{writing_id}/{writing_id}.pdf"
    return source, pdf, url


def validate_writing_text(value, label: str, maximum: int, required: bool = True) -> str:
    if not isinstance(value, str):
        raise WritingError(f"Writing {label} is invalid.")
    result = value.strip()
    if required and not result:
        raise WritingError(f"Writing {label} is required.")
    if len(result) > maximum:
        raise WritingError(f"Writing {label} is too long.")
    return result


def validate_writing_entry(entry: dict, year: str) -> dict:
    if not isinstance(entry, dict):
        raise WritingError(f"Writing {year} contains an invalid entry.")
    writing_id = validate_writing_id(entry.get("id"))
    if writing_id[:4] != year:
        raise WritingError(f"Writing {writing_id} does not belong to {year}.")
    title = validate_writing_text(entry.get("title"), "title", 200)
    summary = validate_writing_text(entry.get("summary", ""), "summary", 5000, required=False)
    normalized = {"id": writing_id, "title": title}
    if summary:
        normalized["summary"] = summary
    return normalized


def read_writing_year(year: str, required: bool = True) -> list[dict]:
    if not re.fullmatch(r"\d{4}", year):
        raise WritingError("Writing year is invalid.")
    path = WRITING / f"{year}.js"
    if not path.exists() and not required:
        return []
    entries = module_data(path, list)
    normalized = [validate_writing_entry(entry, year) for entry in entries]
    ids = [entry["id"] for entry in normalized]
    if len(ids) != len(set(ids)):
        raise WritingError(f"Writing {year} contains duplicate ids.")
    return sorted(normalized, key=lambda entry: entry["id"], reverse=True)


def find_writing(year: str, writing_id: str) -> tuple[list[dict], dict]:
    years = writing_catalog_years()
    if year not in years:
        raise WritingError("The Writing year is no longer available.")
    writing_id = validate_writing_id(writing_id)
    if writing_id[:4] != year:
        raise WritingError("The Writing entry does not belong to this year.")
    entries = read_writing_year(year)
    entry = next((item for item in entries if item["id"] == writing_id), None)
    if entry is None:
        raise WritingError("The Writing entry is no longer available.")
    return entries, entry


def apply_writing_changes(changes: dict[Path, bytes | None]) -> None:
    previous = {path: path.read_bytes() if path.exists() else None for path in changes}
    try:
        for path, content in changes.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content)
    except Exception:
        for path, content in previous.items():
            try:
                restore_file(path, content)
            except Exception as rollback_error:
                print(f"Writing rollback failed for {path}: {rollback_error}")
        raise


def tex_escape(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "{": r"\{",
        "}": r"\}",
        "$": r"\$",
        "&": r"\&",
        "#": r"\#",
        "_": r"\_",
        "%": r"\%",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(character, character) for character in value)


def writing_source_template(writing_id: str, title: str, summary: str) -> str:
    writing_id = validate_writing_id(writing_id)
    title_tex = tex_escape(title)
    summary_tex = tex_escape(summary)
    date_value = datetime.strptime(writing_id, "%Y%m%d-%H%M%S").strftime("%Y-%m-%d")
    summary_block = (
        f"\\begin{{abstract}}\n{summary_tex}\n\\end{{abstract}}\n"
        if summary_tex
        else ""
    )
    template = r"""\documentclass[11pt,twoside,fontset=none,scheme=plain]{ctexart}

\usepackage[
  paperwidth=176mm,
  paperheight=250mm,
  top=21mm,
  bottom=22mm,
  inner=23mm,
  outer=19mm,
  headheight=14pt,
  headsep=7mm,
  footskip=13mm
]{geometry}
\usepackage[nomath,semibold]{libertinus}
\usepackage{microtype}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{fancyhdr}

\newcommand{\writingfontpath}{assets/fonts/}
\IfFileExists{assets/fonts/LXGWWenKaiGB-Regular.ttf}{}{%
  \renewcommand{\writingfontpath}{../../assets/fonts/}%
}
\setCJKmainfont[
  Path=\writingfontpath,
  BoldFont=LXGWWenKaiGB-Medium.ttf,
  AutoFakeSlant=0.2
]{LXGWWenKaiGB-Regular.ttf}
\setCJKsansfont[
  Path=\writingfontpath,
  BoldFont=SourceHanSansCN-Medium.otf
]{SourceHanSansCN-Medium.otf}
\setCJKmonofont[
  Path=\writingfontpath
]{SourceHanSansCN-Medium.otf}
\xeCJKsetup{PunctStyle=kaiming}

\definecolor{bookink}{HTML}{222222}
\definecolor{mutedink}{HTML}{6B6964}
\definecolor{accent}{HTML}{315F86}
\hypersetup{
  unicode=true,
  pdftitle={__TITLE__},
  pdfauthor={Xayah Hina},
  pdfdisplaydoctitle=true,
  colorlinks=true,
  linkcolor=accent,
  urlcolor=accent,
  citecolor=accent
}
\urlstyle{same}

\setlength{\parindent}{2em}
\setlength{\parskip}{0pt}
\linespread{1.28}
\emergencystretch=1.5em
\clubpenalty=10000
\widowpenalty=10000
\displaywidowpenalty=10000
\setcounter{secnumdepth}{3}
\raggedbottom

\ctexset{
  section={
    name={},
    number=\arabic{section},
    format=\Large\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.8em},
    beforeskip=2.6ex plus 0.5ex minus 0.2ex,
    afterskip=1.3ex plus 0.2ex,
    indent=0pt
  },
  subsection={
    name={},
    number=\thesection.\arabic{subsection},
    format=\large\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.75em},
    beforeskip=2.2ex plus 0.4ex minus 0.2ex,
    afterskip=1ex plus 0.2ex,
    indent=0pt
  },
  subsubsection={
    name={},
    number=\thesubsection.\arabic{subsubsection},
    format=\normalsize\sffamily\bfseries\color{bookink},
    aftername=\hspace{0.7em},
    beforeskip=1.8ex plus 0.3ex minus 0.2ex,
    afterskip=0.8ex plus 0.2ex,
    indent=0pt
  }
}

\renewcommand{\abstractname}{摘要}
\renewenvironment{abstract}{%
  \begin{center}
    \small\sffamily\bfseries\color{bookink}\abstractname
  \end{center}
  \begin{list}{}{\leftmargin=2em\rightmargin=2em}
    \item\relax\small\color{mutedink}\noindent\ignorespaces
}{%
  \end{list}
  \vspace{1.2em}
}

\makeatletter
\renewcommand{\maketitle}{%
  \thispagestyle{plain}%
  \begin{center}
    \vspace*{0.6em}
    {\LARGE\sffamily\bfseries\color{bookink}\@title\par}
    \vspace{1em}
    {\small\color{mutedink}\@author\quad\textperiodcentered\quad\@date\par}
  \end{center}
  \vspace{1.8em}
}
\makeatother

\pagestyle{fancy}
\fancyhf{}
\fancyhead[LE]{\footnotesize\color{mutedink}Xayah Hina}
\fancyhead[RO]{\footnotesize\color{mutedink}__TITLE__}
\fancyfoot[LE,RO]{\footnotesize\color{mutedink}\thepage}
\renewcommand{\headrulewidth}{0pt}
\fancypagestyle{plain}{%
  \fancyhf{}
  \fancyfoot[C]{\footnotesize\color{mutedink}\thepage}
  \renewcommand{\headrulewidth}{0pt}
}
\AtBeginDocument{\color{bookink}}

\title{__TITLE__}
\author{Xayah Hina}
\date{__DATE__}

\begin{document}
\maketitle

__SUMMARY__
% Begin writing here.

\end{document}
"""
    return (
        template.replace("__TITLE__", title_tex)
        .replace("__DATE__", date_value)
        .replace("__SUMMARY__", summary_block.rstrip())
    )


def writing_open_response(year: str, entry: dict) -> dict:
    source_path, pdf_path, pdf_url = writing_document_paths(entry["id"])
    if not source_path.exists():
        raise WritingError(f"Missing source file {source_path.name}.")
    source = source_path.read_text(encoding="utf-8")
    return {
        "year": year,
        "entry": entry,
        "source": source,
        "pdfUrl": pdf_url,
        "pdfExists": pdf_path.is_file(),
        "pdfVersion": pdf_path.stat().st_mtime_ns if pdf_path.is_file() else 0,
    }


def open_writing(payload: dict) -> dict:
    year = str(payload.get("year", ""))
    writing_id = validate_writing_id(payload.get("id"))
    _, entry = find_writing(year, writing_id)
    return writing_open_response(year, entry)


def create_writing(payload: dict) -> dict:
    title = validate_writing_text(payload.get("title"), "title", 200)
    summary = validate_writing_text(payload.get("summary", ""), "summary", 5000, required=False)
    with WRITING_MUTATION_LOCK:
        writing_id = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%Y%m%d-%H%M%S")
        year = writing_id[:4]
        years = writing_catalog_years()
        year_path = WRITING / f"{year}.js"
        entries = read_writing_year(year, required=year in years or year_path.exists())
        source_path, _, _ = writing_document_paths(writing_id)
        if any(entry["id"] == writing_id for entry in entries) or source_path.parent.exists():
            raise WritingError("A Writing entry already exists for this second. Try again in a moment.")
        entry = {"id": writing_id, "title": title}
        if summary:
            entry["summary"] = summary
        next_entries = sorted([*entries, entry], key=lambda item: item["id"], reverse=True)
        next_years = normalize_years([*years, year])
        source = writing_source_template(writing_id, title, summary)
        apply_writing_changes({
            source_path: source.encode("utf-8"),
            year_path: module_source(next_entries),
            WRITING_CATALOG: module_source({"years": [int(value) for value in next_years]}),
        })
        return {**writing_open_response(year, entry), "years": next_years, "entries": next_entries}


def _save_writing(payload: dict) -> dict:
    year = str(payload.get("year", ""))
    writing_id = validate_writing_id(payload.get("id"))
    title = validate_writing_text(payload.get("title"), "title", 200)
    summary = validate_writing_text(payload.get("summary", ""), "summary", 5000, required=False)
    source = payload.get("source")
    if not isinstance(source, str) or not source.strip():
        raise WritingError("Writing source is required.")
    if len(source) > 2_000_000:
        raise WritingError("Writing source is too long.")
    entries, _ = find_writing(year, writing_id)
    entry = {"id": writing_id, "title": title}
    if summary:
        entry["summary"] = summary
    entry = validate_writing_entry(entry, year)
    next_entries = [entry if item["id"] == writing_id else item for item in entries]
    source_path, _, _ = writing_document_paths(writing_id)
    apply_writing_changes({
        source_path: (source.rstrip() + "\n").encode("utf-8"),
        WRITING / f"{year}.js": module_source(next_entries),
    })
    return {**writing_open_response(year, entry), "years": writing_catalog_years(), "entries": next_entries}


def save_writing(payload: dict) -> dict:
    with WRITING_MUTATION_LOCK:
        return _save_writing(payload)


def _compile_writing(payload: dict) -> dict:
    result = _save_writing(payload)
    source_path, pdf_path, _ = writing_document_paths(payload["id"])
    tectonic = shutil.which("tectonic")
    if not tectonic:
        result["compile"] = {"ok": False, "log": "Tectonic is not available on PATH."}
        return result

    try:
        with tempfile.TemporaryDirectory(prefix=".tectonic-", dir=source_path.parent) as output_directory:
            environment = os.environ.copy()
            environment["TECTONIC_UNTRUSTED_MODE"] = "1"
            process = subprocess.run(
                [
                    tectonic,
                    "-X",
                    "compile",
                    "--untrusted",
                    "--print",
                    "--outdir",
                    output_directory,
                    source_path.name,
                ],
                cwd=source_path.parent,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
                check=False,
            )
            log = (process.stdout + process.stderr)[-200_000:]
            temporary_pdf = Path(output_directory) / pdf_path.name
            if process.returncode != 0 or not temporary_pdf.is_file():
                result["compile"] = {
                    "ok": False,
                    "log": log or f"Tectonic exited with code {process.returncode}.",
                }
                return result
            pdf_content = temporary_pdf.read_bytes()
            if not pdf_content.startswith(b"%PDF-"):
                result["compile"] = {"ok": False, "log": "Tectonic did not produce a valid PDF file."}
                return result
            atomic_write(pdf_path, pdf_content)
            result["pdfExists"] = True
            result["pdfVersion"] = pdf_path.stat().st_mtime_ns
            result["compile"] = {"ok": True, "log": log or "Compilation completed successfully."}
            return result
    except subprocess.TimeoutExpired as error:
        output = ((error.stdout or "") + (error.stderr or ""))[-200_000:]
        result["compile"] = {"ok": False, "log": f"Compilation timed out after 60 seconds.\n{output}".strip()}
        return result


def compile_writing(payload: dict) -> dict:
    with WRITING_MUTATION_LOCK:
        return _compile_writing(payload)


def delete_writing(payload: dict) -> dict:
    year = str(payload.get("year", ""))
    writing_id = validate_writing_id(payload.get("id"))

    with WRITING_MUTATION_LOCK:
        entries, _ = find_writing(year, writing_id)
        source_path, _, _ = writing_document_paths(writing_id)
        directory = source_path.parent
        if not directory.is_dir():
            raise WritingError(f"Missing Writing directory {directory.name}.")

        years = writing_catalog_years()
        next_entries = [entry for entry in entries if entry["id"] != writing_id]
        next_years = years if next_entries else [value for value in years if value != year]
        year_path = WRITING / f"{year}.js"
        changes = {
            year_path: module_source(next_entries) if next_entries else None,
        }
        if not next_entries:
            changes[WRITING_CATALOG] = module_source({"years": [int(value) for value in next_years]})

        with tempfile.TemporaryDirectory(prefix="writing-delete-", ignore_cleanup_errors=True) as backup_root:
            backup = Path(backup_root) / writing_id
            try:
                shutil.move(str(directory), str(backup))
            except OSError as error:
                raise WritingError(f"Writing directory {writing_id} could not be removed.") from error

            try:
                apply_writing_changes(changes)
            except Exception:
                try:
                    shutil.move(str(backup), str(directory))
                except OSError as rollback_error:
                    print(f"Writing directory rollback failed for {writing_id}: {rollback_error}")
                raise

        return {
            "year": year,
            "years": next_years,
            "entries": next_entries,
            "status": "deleted",
        }


def tectonic_version() -> str | None:
    tectonic = shutil.which("tectonic")
    if not tectonic:
        return None
    try:
        result = subprocess.run([tectonic, "--version"], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


class LocalSiteHandler(SimpleHTTPRequestHandler):
    server_version = "XayahLocal/1.0"

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
        if urlsplit(self.path).path == "/api/local/status":
            if not self.allowed_origin():
                self.api_json(HTTPStatus.FORBIDDEN, {"error": "Local editor origin rejected."})
                return
            status = {
                "authoring": True,
                "token": TOKEN,
                "journalYears": [],
                "writingYears": [],
                "journalError": None,
                "writingError": None,
                "tectonicVersion": tectonic_version(),
            }
            try:
                status["journalYears"] = catalog_years()
            except (LocalEditorError, OSError) as error:
                status["journalError"] = str(error)
            try:
                status["writingYears"] = writing_catalog_years()
            except (LocalEditorError, OSError) as error:
                status["writingError"] = str(error)
            self.api_json(HTTPStatus.OK, status)
            return
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        actions = {
            "/api/journal/save": save_journal,
            "/api/journal/delete": delete_journal,
            "/api/writing/open": open_writing,
            "/api/writing/create": create_writing,
            "/api/writing/save": save_writing,
            "/api/writing/compile": compile_writing,
            "/api/writing/delete": delete_writing,
        }
        if path not in actions:
            self.api_json(HTTPStatus.NOT_FOUND, {"error": "Unknown local editor endpoint."})
            return
        if not self.allowed_origin() or self.headers.get("X-Local-Token") != TOKEN:
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
            self.api_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Local editor request is empty or too large."})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise LocalEditorError("Local editor request is invalid.")
            result = actions[path](payload)
            self.api_json(HTTPStatus.OK, result)
        except (LocalEditorError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self.api_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except OSError as error:
            self.api_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": f"Local write failed: {error}"})
        except Exception as error:
            print(f"Unexpected local editor error: {error}")
            self.api_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "The local editor encountered an unexpected error."})

    def do_OPTIONS(self):
        self.api_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Cross-origin requests are not supported."})


def main() -> None:
    if not (ROOT / "index.html").is_file() or not JOURNAL_CATALOG.is_file() or not WRITING_CATALOG.is_file():
        raise SystemExit("serve-local.py must be run from the xayah-hina.github.io repository.")
    handler = partial(LocalSiteHandler, directory=str(ROOT))
    with ThreadingHTTPServer((HOST, PORT), handler) as server:
        print(f"Writing local editor: http://localhost:{PORT}/#journal")
        print("Writes are restricted to the journals and writing directories. Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nLocal editor stopped.")


if __name__ == "__main__":
    main()

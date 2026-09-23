from __future__ import annotations

import hashlib, io, re, uuid, zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_DOCUMENT_EXTENSIONS = {".pdf"}
MAX_IMAGE_BYTES = 50 * 1024 * 1024
MAX_ZIP_BYTES = 250 * 1024 * 1024
MIN_DIMENSION = 160
ALLOWED_RIGHTS = {"owned", "supplier-authorized", "licensed", "public-domain", "cc0", "review", "unresolved"}
ALLOWED_SOURCE_TYPES = ALLOWED_RIGHTS

@dataclass(frozen=True)
class ImageInspection:
    valid: bool
    mime_type: str = ""
    width: int = 0
    height: int = 0
    reason: str = ""

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sanitize_filename(name: str) -> str:
    base = Path(name.replace("\\", "/")).name
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip(".-")
    return base[:180] or "asset"

def _png_dimensions(data):
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")

def _webp_dimensions(data):
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP": return None
    if data[12:16] == b"VP8X":
        return 1 + int.from_bytes(data[24:27],"little"), 1 + int.from_bytes(data[27:30],"little")
    return None

def _jpeg_dimensions(data):
    if len(data) < 4 or data[:2] != b"\xff\xd8": return None
    i=2
    sof=set(range(0xC0,0xC4))|set(range(0xC5,0xC8))|set(range(0xC9,0xCC))|set(range(0xCD,0xD0))
    while i+9 < len(data):
        if data[i] != 0xFF: i += 1; continue
        while i < len(data) and data[i] == 0xFF: i += 1
        if i >= len(data): break
        marker=data[i]; i += 1
        if marker in (0xD8,0xD9): continue
        if i+2 > len(data): break
        length=int.from_bytes(data[i:i+2],"big")
        if length < 2 or i+length > len(data): break
        if marker in sof and length >= 7:
            return int.from_bytes(data[i+5:i+7],"big"), int.from_bytes(data[i+3:i+5],"big")
        i += length
    return None

def inspect_image_bytes(data: bytes, extension: str) -> ImageInspection:
    ext=extension.lower()
    if not data: return ImageInspection(False, reason="empty file")
    if len(data)>MAX_IMAGE_BYTES: return ImageInspection(False, reason="image exceeds 50MB limit")
    if ext in {".jpg",".jpeg"}: dims=_jpeg_dimensions(data); mime="image/jpeg"
    elif ext==".png": dims=_png_dimensions(data); mime="image/png"
    elif ext==".webp": dims=_webp_dimensions(data); mime="image/webp"
    else: return ImageInspection(False, reason="unsupported image extension")
    if not dims: return ImageInspection(False, reason="file signature or dimensions could not be validated")
    w,h=dims
    if w<MIN_DIMENSION or h<MIN_DIMENSION: return ImageInspection(False,mime,w,h,"image dimensions are below 160px minimum")
    return ImageInspection(True,mime,w,h,"")

def validate_rights(rights: str, source_type: str):
    r=str(rights or "").strip().lower(); s=str(source_type or "").strip().lower()
    if r not in ALLOWED_RIGHTS: return False,"unsupported rights status"
    if s not in ALLOWED_SOURCE_TYPES: return False,"unsupported source type"
    if r != s: return False,"rights status and source type must agree"
    return True,""

def safe_zip_members(zf):
    members=[]
    for info in zf.infolist():
        if info.is_dir(): continue
        raw=info.filename.replace("\\","/")
        if raw.startswith("/") or ".." in Path(raw).parts: raise ValueError("ZIP contains an unsafe path")
        if len(raw)>240: raise ValueError("ZIP member filename is too long")
        if Path(raw).suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS|SUPPORTED_DOCUMENT_EXTENSIONS: members.append(info)
    return members

def extract_zip(data: bytes, destination: Path):
    if len(data)>MAX_ZIP_BYTES: raise ValueError("ZIP exceeds 250MB limit")
    destination.mkdir(parents=True,exist_ok=True); extracted=[]; total=0
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in safe_zip_members(zf):
            total += info.file_size
            if total>500*1024*1024: raise ValueError("ZIP expands beyond the 500MB safety limit")
            content=zf.read(info); name=sanitize_filename(info.filename)
            target=destination/(uuid.uuid4().hex+"-"+name); target.write_bytes(content)
            extracted.append({"path":str(target),"filename":name,"extension":target.suffix.lower(),"bytes":len(content)})
    return extracted

def hash_file(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def normalize_metadata(metadata=None):
    value=dict(metadata or {})
    rights=str(value.get("rightsStatus") or value.get("rights") or "review").strip().lower()
    source=str(value.get("sourceType") or value.get("source") or rights).strip().lower()
    ok,reason=validate_rights(rights,source)
    if not ok: raise ValueError(reason)
    return {
        "productId": str(value["productId"]) if value.get("productId") not in (None,"") else None,
        "sourceType":source,"rightsStatus":rights,
        "provenance":str(value.get("provenance") or ""),
        "sourceUrl":str(value.get("sourceUrl") or ""),
        "license":str(value.get("license") or ""),
        "attribution":str(value.get("attribution") or ""),
        "role":str(value.get("role") or "primary")
    }

def choose_match(explicit_product_id, owner_assignment, metadata, ranked: Iterable[dict]):
    if explicit_product_id: return {"mode":"explicit-product-id","productId":str(explicit_product_id),"status":"REVIEW"}
    if owner_assignment: return {"mode":"owner-assignment","productId":str(owner_assignment),"status":"REVIEW"}
    if metadata.get("productId"): return {"mode":"trusted-metadata","productId":str(metadata["productId"]),"status":"REVIEW"}
    ranked=list(ranked)
    if not ranked: return {"mode":"deterministic","productId":None,"status":"UNRESOLVED"}
    top=ranked[0]; second=ranked[1] if len(ranked)>1 else None
    if top.get("status")=="HIGH" and (not second or top.get("score",0)>second.get("score",0)):
        return {"mode":"deterministic","productId":str(top["productId"]),"status":"REVIEW","confidence":top.get("score")}
    return {"mode":"deterministic","productId":str(top.get("productId")),"status":"REVIEW","confidence":top.get("score")}

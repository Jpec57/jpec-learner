import io
from contextlib import asynccontextmanager
from typing import Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from manga_ocr import MangaOcr
from paddleocr import PPStructureV3
from PIL import Image

_general_pipeline: PPStructureV3 | None = None
_manga_ocr: MangaOcr | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _general_pipeline, _manga_ocr
    # Deliberately the classic PP-OCR + PP-FormulaNet pipeline, not the
    # 0.9B-parameter PaddleOCR-VL: this runs on a memory/CPU-constrained VPS,
    # not a workstation GPU. Mobile-sized models (~370MB total) instead of a
    # multi-GB transformer, with everything not needed for plain text + math
    # formulas switched off to keep CPU/RAM use down.
    _general_pipeline = PPStructureV3(
        device="cpu",
        # cpu_threads=1 isn't just about staying light on a constrained VPS --
        # paddle's multi-threaded CPU path reliably segfaults (SIGSEGV) inside
        # this container on every predict() call with more than one thread;
        # single-threaded inference is required, not just preferred (see
        # OMP_NUM_THREADS/FLAGS_use_mkldnn in the Dockerfile, which apply the
        # same fix at the process level for both pipelines here).
        cpu_threads=1,
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="latin_PP-OCRv5_mobile_rec",
        layout_detection_model_name="PP-DocLayout-S",
        formula_recognition_model_name="PP-FormulaNet-S",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_table_recognition=False,
        use_formula_recognition=True,
    )
    _manga_ocr = MangaOcr()
    yield


app = FastAPI(title="jpeclearner-ocr", lifespan=lifespan)


def _run_general(image: Image.Image) -> str:
    assert _general_pipeline is not None
    output = _general_pipeline.predict(np.array(image))
    parts = []
    for res in output:
        md = res.markdown
        text = md.get("markdown_texts", "") if isinstance(md, dict) else str(md)
        if text:
            parts.append(text)
    return "\n\n".join(parts).strip()


def _run_manga(image: Image.Image) -> str:
    assert _manga_ocr is not None
    return _manga_ocr(image).strip()


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    mode: Literal["general", "manga"] = Form(...),
) -> dict:
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(400, "Could not read image") from exc

    text = _run_general(image) if mode == "general" else _run_manga(image)
    return {"text": text}

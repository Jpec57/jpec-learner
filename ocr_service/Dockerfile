FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only wheels, installed from their own package indexes before the rest
# of the requirements (which pull paddleocr/manga-ocr and their transitive
# deps, but must not drag in CUDA builds of paddlepaddle/torch).
RUN pip install --no-cache-dir paddlepaddle==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Paddle's multi-threaded CPU inference segfaults reliably in this container
# (SIGSEGV inside its OpenMP/MKL-DNN op kernels); forcing single-threaded
# execution avoids it, and doubles as sane behavior for a constrained VPS
# that shouldn't have this service competing for every CPU core anyway.
ENV OMP_NUM_THREADS=1
ENV FLAGS_use_mkldnn=false

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"]

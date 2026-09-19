"""POST /embed {"texts": [...]} -> {"vectors": [[512 floats], ...]}   GET /health -> {"ok": true, ...}

Text tower of Marqo FashionCLIP, the model the catalogue photos were embedded with, so the vectors it returns
can be compared directly with vec_image.bin. Unit-normalised, like the photo vectors.
"""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import open_clip
import torch

MODEL_ID = "hf-hub:Marqo/marqo-fashionCLIP"
MAX_TEXTS = 64
MAX_CHARS = 300

torch.set_num_threads(max(1, os.cpu_count() or 1))
started = time.time()
model, _, _ = open_clip.create_model_and_transforms(MODEL_ID)
model.visual = None  # only the text tower is ever used; drop the image tower to halve memory
model.eval()
tokenizer = open_clip.get_tokenizer(MODEL_ID)
load_seconds = round(time.time() - started, 1)


@torch.no_grad()
def embed(texts):
    vectors = torch.nn.functional.normalize(model.encode_text(tokenizer(texts)).float(), dim=-1)
    return [[round(x, 6) for x in row] for row in vectors.tolist()]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "model": MODEL_ID, "load_seconds": load_seconds, "dims": 512})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/embed":
            return self._send(404, {"error": "not found"})
        try:
            texts = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))["texts"]
            if not isinstance(texts, list) or not texts or len(texts) > MAX_TEXTS:
                raise ValueError(f"texts must be a list of 1..{MAX_TEXTS} strings")
            texts = [str(t)[:MAX_CHARS] for t in texts]
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            return self._send(400, {"error": str(error)})
        t0 = time.time()
        vectors = embed(texts)
        self._send(200, {"vectors": vectors, "ms": round((time.time() - t0) * 1000)})

    def log_message(self, *args):  # one line per request is noise here
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()

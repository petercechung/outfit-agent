# The FashionCLIP text encoder, so a sentence is embedded in the same space as the product photos (which were
# embedded with this exact model and library version in the v1 prototype). The weights are downloaded at build
# time, so a cold container never waits on Hugging Face.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 HF_HOME=/models TOKENIZERS_PARALLELISM=false
RUN pip install --no-cache-dir torch==2.14.0 torchvision==0.29.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir open_clip_torch==3.3.0 numpy
# encoder/hub/ may hold a local Hugging Face cache of the model (not in git: ~570 MB). When it does, the build uses
# it instead of downloading; when it is empty (a fresh clone), the next line downloads the weights once.
COPY hub/ /models/hub/
RUN python -c "import open_clip; open_clip.create_model_and_transforms('hf-hub:Marqo/marqo-fashionCLIP'); open_clip.get_tokenizer('hf-hub:Marqo/marqo-fashionCLIP')"

COPY server.py /app/server.py
EXPOSE 8080
CMD ["python", "/app/server.py"]

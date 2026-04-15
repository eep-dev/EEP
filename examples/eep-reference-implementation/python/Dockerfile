FROM python:3.12-slim

# EEP repo root build context: paths must match pyproject `file:../../../packages/eep-gates-python`
WORKDIR /app/examples/eep-reference-implementation/python

COPY packages/eep-gates-python /app/packages/eep-gates-python
COPY examples/eep-reference-implementation/python/pyproject.toml ./
COPY examples/eep-reference-implementation/python/eep_api_python ./eep_api_python

RUN pip install --no-cache-dir .

EXPOSE 3200

CMD ["python", "-m", "uvicorn", "eep_api_python.app:app", "--host", "0.0.0.0", "--port", "3200"]

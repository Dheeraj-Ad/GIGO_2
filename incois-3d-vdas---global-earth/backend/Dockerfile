FROM python:3.11-slim

# libnetcdf / hdf5 system libs required by netCDF4 / h5netcdf wheels on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnetcdf-dev libhdf5-dev gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY config /config

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/srv \
    OCEANVIZ_CONFIG_DIR=/config \
    OCEANVIZ_DATA_DIR=/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

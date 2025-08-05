# Pull base image
ARG PYTHON_VERSION=3.10
FROM python:${PYTHON_VERSION}-slim AS base

# Set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK=on \
    PYTHONDONTWRITEBYTECODE=on \
    PYTHONUNBUFFERED=on

# Set work directory
WORKDIR /code

# Install Python dependencies
COPY ./requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy project
COPY . .

EXPOSE 8000

# Run the application
CMD ["sh", "-c", "python manage.py collectstatic --noinput && python manage.py migrate --noinput && python manage.py runserver 0.0.0.0:8000"]
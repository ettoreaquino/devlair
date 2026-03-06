# Simulates a blank Ubuntu 24.04 machine
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Minimal baseline — what a real blank Ubuntu cloud image ships with
RUN apt-get update -qq && apt-get install -y -qq \
    curl python3 sudo git \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user that devlair will configure
RUN useradd -m -s /bin/bash testuser \
    && echo "testuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install uv (needed to run devlair from source in the container)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy project source
WORKDIR /devlair
COPY . .

# Install devlair in the container's venv
RUN uv sync

# The test runner script runs as root (simulating sudo devlair init)
ENV SUDO_USER=testuser

ENTRYPOINT ["uv", "run", "python", "-m", "pytest", "tests/integration/", "-v", "--tb=short"]

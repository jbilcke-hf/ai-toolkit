FROM nvidia/cuda:12.8.1-devel-ubuntu22.04

LABEL authors="jbilcke-hf"

# Set noninteractive to avoid timezone prompts
ENV DEBIAN_FRONTEND=noninteractive

# ref https://en.wikipedia.org/wiki/CUDA
ENV TORCH_CUDA_ARCH_LIST="8.0 8.6 8.9 9.0 10.0 12.0"

# Install dependencies
RUN apt-get update && apt-get install --no-install-recommends -y \
    git \
    git-lfs \
    curl \
    build-essential \
    cmake \
    wget \
    procps \
    vim \
    nano \
    python3.10 \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-wheel \
    python3-venv \
    ffmpeg \
    tmux \
    htop \
    nvtop \
    python3-opencv \
    openssh-client \
    openssh-server \
    openssl \
    rsync \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install nodejs
WORKDIR /tmp
RUN curl -sL https://deb.nodesource.com/setup_23.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt-get update && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create Dev Mode compatible user
RUN useradd -m -u 1000 user

# Set working directory to /app
WORKDIR /app

# Set aliases for python and pip
RUN ln -s /usr/bin/python3 /usr/bin/python

COPY --chown=1000 ./ /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --pre --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128 --force && \
    pip install setuptools==69.5.1 --no-cache-dir

RUN cd /app/ui && npm install

EXPOSE 8675

WORKDIR /app

RUN chown 1000 /app
RUN chmod +x /app/start_on_huggingface.sh
USER 1000
CMD ["/app/start_on_huggingface.sh"]
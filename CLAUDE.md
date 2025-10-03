# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AI Toolkit by Ostris is an all-in-one training suite for diffusion models (image and video). It supports training LoRAs, full fine-tuning, and various modern architectures on consumer hardware (24GB+ VRAM). The toolkit can run as a GUI (web UI) or CLI.

## Key Commands

### Setup & Installation
```bash
# Install PyTorch first (Linux)
pip3 install --no-cache-dir torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu126

# Install dependencies
pip3 install -r requirements.txt

# For FLUX.1-dev training, create .env file with:
HF_TOKEN=your_huggingface_token
```

### Running Training Jobs
```bash
# CLI training - run a config file
python run.py config/your_config.yaml

# With name replacement (for shared configs)
python run.py config/your_config.yaml --name my_experiment

# Run multiple configs sequentially
python run.py config/config1.yaml config/config2.yaml

# Continue on failure
python run.py config/config1.yaml --recover

# Gradio UI for FLUX training
python flux_train_ui.py
```

### Web UI
```bash
cd ui
npm run build_and_start  # Installs deps, builds, and starts UI on port 8675

# With authentication token
AI_TOOLKIT_AUTH=your_password npm run build_and_start
```

## Architecture

### Job System
The toolkit uses a config-driven job system (`toolkit/job.py`):
- **train**: Standard model training (LoRA, full fine-tune)
- **extract**: Extract LoRAs from models
- **mod**: Modify saved models (e.g., scale LoRA weights)
- **generate**: Generate images/videos
- **extension**: Run custom extension jobs

Jobs are defined in `jobs/` directory and configured via YAML files in `config/`.

### Process Types
Training jobs support multiple process types (`jobs/process/`):
- `sd_trainer`: Standard diffusion model training (most common)
- `TrainVAEProcess`: VAE training
- Custom extension processes

### Configuration
- Config files are YAML-based (see `config/examples/`)
- Key sections: `job`, `config.process`, `config.process[0].model`, `config.process[0].datasets`, `config.process[0].train`, `config.process[0].sample`
- Configs support `[trigger]` placeholder replacement with `trigger_word` setting
- Supports `[name]` tag replacement via `--name` CLI flag

### Model Support (extensions_built_in/diffusion_models/)
Supported architectures include:
- **FLUX.1** (dev & schnell): Requires 24GB+ VRAM, quantization enabled by default
- **SD 3.5**: Large and medium variants
- **OmniGen2**: Multi-modal generation
- **Qwen Image**: Image editing models
- **Chroma**: Chroma/Radiance models
- **HiDream**: Video generation
- **Wan 2.1/2.2**: Video models (1B & 14B variants)
- **FLUX Kontext**: Contextual FLUX training
- **Flex2**: Experimental models

### Network Types
Training adapters configured in `network` section:
- **lora**: Standard LoRA (specify `linear`, `linear_alpha`)
- **lokr**: LoKr factorization (use `lokr_full_rank`, `lokr_factor`)
- Layer targeting via `only_if_contains` and `ignore_if_contains` in `network_kwargs`

### Dataset System
- Datasets are folders with images (jpg/jpeg/png) and matching `.txt` caption files
- Images auto-resize and bucket by aspect ratio - no manual cropping needed
- Set `cache_latents_to_disk: true` to cache preprocessed latents (recommended)
- Multiple resolution support: `resolution: [512, 768, 1024]`
- Caption features: dropout, token shuffling, `[trigger]` replacement

### Extensions
Custom functionality in `extensions_built_in/`:
- `sd_trainer`: Main training extension with adapter modules
- `concept_slider`: Train concept sliders
- `advanced_generator`: Enhanced generation features
- `dataset_tools`: Dataset manipulation utilities

### Python Backend Architecture

#### Entry Points
- **`run.py`**: Main CLI entry point
  - Parses CLI arguments (config files, `--name`, `--recover`, `--log`)
  - Calls `get_job()` to instantiate job from config
  - Runs job(s) sequentially, handles errors/interrupts
  - Supports multi-config runs with failure recovery

#### Job System (`jobs/`)
- **`job.py`**: Job factory - dispatches to job types based on `job:` field in config
- **Job Classes**:
  - `BaseJob`: Abstract base with process loading
  - `TrainJob`: Orchestrates training process(es)
  - `ExtractJob`: Extract LoRA from checkpoints
  - `ModJob`: Modify existing models (rescale, merge)
  - `GenerateJob`: Inference/generation
  - `ExtensionJob`: Run custom extensions

#### Process System (`jobs/process/`)
Processes are the actual training/inference implementations:

- **`BaseProcess.py`**: Abstract process with config access
- **`BaseTrainProcess.py`**: Base training process
  - Sets up `save_root = training_folder/name`
  - Saves config.yaml copy to output dir
  - Handles tensorboard logging
  - Training seed management

- **`BaseSDTrainProcess.py`**: Stable Diffusion training base (most important)
  - **Initialization** (lines 82-200):
    - Loads all configs (NetworkConfig, TrainConfig, ModelConfig, SaveConfig, etc.)
    - Prepares datasets with `DatasetConfig` objects
    - Handles EMA, embeddings, adapters, decorators
    - Sets up guidance, text embedding caching

  - **Checkpoint Management** (lines 400-700):
    - `save()`: Save checkpoint at current step
    - Auto-cleanup old checkpoints based on `max_step_saves_to_keep`
    - Saves network, embeddings, optimizer state
    - Handles HuggingFace Hub uploads if enabled
    - Resume from latest checkpoint by finding `{name}_{step}.safetensors` files

  - **Training Loop** (in subclasses like `SDTrainer.py`):
    - Batch preparation and augmentation
    - Forward pass through model
    - Loss calculation (MSE, MAE, wavelet, stepped)
    - Backward pass and optimizer step
    - Sample generation at intervals
    - Progress logging and monitoring

- **`SDTrainer.py`** (`extensions_built_in/sd_trainer/`):
  - Main training implementation for diffusion models
  - Handles noise application, guidance loss, SNR weighting
  - Prior prediction for output preservation
  - Manages adapters (T2I, ControlNet, IP-Adapter)
  - Sample generation with caching

#### Core Toolkit Modules
- **`toolkit/config_modules.py`**: Config data classes
  - `SaveConfig`: Save frequency, dtype, format, hub upload
  - `TrainConfig`: Batch size, steps, optimizer, loss type, checkpointing
  - `ModelConfig`: Model path, quantization, architecture flags
  - `DatasetConfig`: Paths, resolution, caching, augmentation
  - `SampleConfig` + `SampleItem`: Sampling prompts and parameters
  - `NetworkConfig`: LoRA/LoKr settings, layer targeting

- **`toolkit/data_loader.py`**: Dataset loading
  - `get_dataloader_from_datasets()`: Create PyTorch DataLoader
  - Handles multiple datasets, bucketing, caching
  - Caption processing with trigger word injection

- **`toolkit/dataloader_mixins.py`**: Model-specific data loading (97KB!)
  - Mixins for different architectures (FLUX, SD3, Qwen, Wan, etc.)
  - Batch preparation specialized per model
  - Text embedding caching and preprocessing

- **`toolkit/stable_diffusion_model.py`**: StableDiffusion wrapper class
  - Loads model components (unet/transformer, VAE, text encoders)
  - Handles quantization, device states
  - Generation/sampling pipelines

- **`toolkit/custom_adapter.py`**: Network adapter implementations
  - LoRA, LoKr, LyCORIS network wrappers
  - Layer injection and weight merging

- **`toolkit/optimizer.py`**: Optimizer factory (AdamW, AdamW8bit, etc.)
- **`toolkit/scheduler.py`**: LR scheduler creation
- **`toolkit/sampler.py`**: Sampling schedulers (DDPM, flowmatch, etc.)

#### Job Execution Flow
1. **Config Loading**: `get_config()` parses YAML, validates structure
2. **Job Creation**: `get_job()` instantiates appropriate job class
3. **Process Setup**: Job loads process(es) based on `config.process[].type`
4. **Model Loading**: Process loads base model with quantization/device config
5. **Network Setup**: Creates LoRA/adapter networks, attaches to model
6. **Data Preparation**: Creates DataLoaders, optionally caches latents/embeddings
7. **Training Loop**:
   - Load batch → encode latents → apply noise → predict → calculate loss
   - Backward pass → optimizer step → log metrics
   - Every N steps: save checkpoint, generate samples
8. **Cleanup**: Save final checkpoint, push to hub if configured

#### Monitoring & Logging
- **Progress Bar**: `toolkit/progress_bar.py` - tqdm wrapper with custom formatting
- **Logging**: `toolkit/logging_aitk.py` - supports W&B, tensorboard, console
- **Performance**: Optional `performance_log_every` prints speed/memory stats
- **UI Integration**: Jobs write status to SQLite DB when run via UI worker

### Web UI Architecture

The web UI is a full-stack Next.js application for managing training jobs:

#### Frontend Structure (`ui/src/`)
- **Pages** (`app/`):
  - `/` - Home/dashboard
  - `/jobs` - Job list view
  - `/jobs/new` - Create new training job with form builder
  - `/jobs/[jobID]` - Job detail page (config, samples, logs, checkpoints)
  - `/datasets` - Dataset browser and management
  - `/datasets/[datasetName]` - Dataset viewer with image/caption editor
  - `/settings` - Global settings and preferences

- **API Routes** (`app/api/`):
  - `/api/jobs` - CRUD operations for jobs
  - `/api/datasets` - Dataset operations (upload, caption, delete)
  - `/api/gpu` - GPU monitoring (nvidia-smi)
  - `/api/files` - File system operations
  - `/api/img` - Image serving and manipulation
  - `/api/caption` - Caption generation
  - `/api/auth` - Authentication
  - `/api/zip` - Export/download checkpoints

- **Components** (`components/`):
  - `JobActionBar.tsx` - Start/stop/delete job controls
  - `SampleImages.tsx` - Display training sample images
  - `SampleImageViewer.tsx` - Full-screen image viewer with metadata
  - `JobOverview.tsx` - Training progress, loss curves, stats
  - `DatasetImageCard.tsx` - Editable dataset images with captions
  - `GPUWidget.tsx` - Real-time GPU utilization display
  - `formInputs.tsx` - Dynamic form components for config generation

- **TypeScript Types** (`types.ts`):
  - Full type definitions for configs (NetworkConfig, SaveConfig, TrainConfig, etc.)
  - Matches Python config structure for seamless integration

#### Backend Worker (`ui/cron/worker.ts`)
- Background process that runs alongside Next.js server
- Monitors job queue and spawns training processes
- Updates job status/progress in database
- Runs as separate Node.js process via `concurrently`

#### Database (`ui/prisma/`)
- **SQLite** database (`aitk_db.db` in repo root)
- **Schema**:
  - `Job` table: id, name, gpu_ids, job_config (JSON), status, step, info, timestamps
  - `Settings` table: key-value store for app settings
  - `Queue` table: job execution queue with channels
- Database auto-created on first run via `npx prisma db push`

#### UI Workflow
1. User creates job via form in `/jobs/new` → generates YAML config
2. Config saved to `Job` table as JSON
3. Worker detects new job → spawns `python run.py` subprocess
4. Worker monitors output, updates job status/step in real-time
5. UI polls API for updates → displays progress, samples, GPU stats
6. Samples/checkpoints written to disk → served via `/api/img` and `/api/files`

## Output Directory Structure

Training outputs are organized in `<training_folder>/<job_name>/` (default: `output/<job_name>/`):

```
output/my_first_flux_lora_v1/
├── config.yaml                          # Copy of training config for reference
├── my_first_flux_lora_v1_000000250.safetensors  # Checkpoint at step 250
├── my_first_flux_lora_v1_000000500.safetensors  # Checkpoint at step 500
├── my_first_flux_lora_v1_000000750.safetensors  # Checkpoint at step 750
├── my_first_flux_lora_v1_000001000.safetensors  # Final checkpoint
├── my_first_flux_lora_v1.safetensors   # Latest/best checkpoint symlink
├── optimizer.pt                         # Optimizer state for resuming
└── samples/                             # Training sample images
    ├── 000000000_00_<prompt_hash>.jpg   # Pre-training sample (step 0)
    ├── 000000250_00_<prompt_hash>.jpg   # Sample at step 250, prompt index 0
    ├── 000000250_01_<prompt_hash>.jpg   # Sample at step 250, prompt index 1
    ├── 000000500_00_<prompt_hash>.jpg   # Sample at step 500, prompt index 0
    └── ...
```

**Key Points**:
- `save_root` = `training_folder/name` (set in `BaseTrainProcess.py:45`)
- Checkpoints named: `{name}_{step:09d}.safetensors`
- Sample naming: `{step:09d}_{prompt_idx:02d}_{hash}.{ext}`
- `optimizer.pt` required for exact training resumption
- Old checkpoints auto-deleted based on `max_step_saves_to_keep` (default: 5)
- Samples generated every `sample_every` steps (default: 250)

**For Embeddings/Decorators**: Additional files like `{name}_emb_{step}.safetensors` for trained embeddings

**For Full Fine-Tuning**: Entire model saved in diffusers format (directory instead of single file)

## Training Workflow

1. **Prepare dataset**: Folder with images + matching .txt captions
2. **Create config**: Copy from `config/examples/`, edit paths and hyperparameters
3. **Run training**: `python run.py config/your_config.yaml`
4. **Monitor**: Samples saved to `output/[name]/samples/`, weights to `output/[name]/`
5. **Resume**: Training auto-resumes from last checkpoint on ctrl+c (wait for save to complete)
   - Resumes from latest `{name}_{step}.safetensors` and `optimizer.pt`
   - Delete `optimizer.pt` to start fresh from a checkpoint

## FLUX.1 Specific Notes
- **FLUX.1-dev**: Non-commercial license, requires HF token and model access approval
- **FLUX.1-schnell**: Apache 2.0, requires `assistant_lora_path: "ostris/FLUX.1-schnell-training-adapter"`
- Quantization required for 24GB: `quantize: true` in model config
- Use `low_vram: true` if GPU drives monitors
- Noise scheduler: `flowmatch` for both training and sampling
- Schnell uses `guidance_scale: 1` and `sample_steps: 1-4`

## Common Config Patterns

### Basic LoRA Training
```yaml
network:
  type: "lora"
  linear: 16
  linear_alpha: 16
```

### Training Specific Layers
```yaml
network:
  type: "lora"
  linear: 128
  linear_alpha: 128
  network_kwargs:
    only_if_contains:
      - "transformer.single_transformer_blocks.7.proj_out"
```

### EMA (Recommended)
```yaml
train:
  ema_config:
    use_ema: true
    ema_decay: 0.99
```

## Troubleshooting
- OOM errors: Enable `gradient_checkpointing: true`, reduce `batch_size`, or set `low_vram: true`
- Windows issues: Use the community easy install script from Tavris1/AI-Toolkit-Easy-Install
- Checkpoint corruption: Wait for save completion before ctrl+c
- For support: Join Discord (link in README), avoid PMing maintainer directly

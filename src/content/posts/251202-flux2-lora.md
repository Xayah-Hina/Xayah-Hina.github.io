---
title: "[FLUX.2] LoRA Training"
published: 2025-12-02
description: ''
image: ''
tags: [ FLUX.2, LoRA Character ]
category: 'AI Painting'
lang: ''
---


:::important[UPDATE LOG]

- [ ] ai-toolkit FLUX.2 LoRA Training
  :::

# [FLUX.2] LoRA Training

## Flux.2 Model

::github{repo="black-forest-labs/flux2"}

https://huggingface.co/Comfy-Org/flux2-dev

## LoRA Training

::github{repo="ostris/ai-toolkit"}

```bash
git clone https://github.com/ostris/ai-toolkit.git
cd ai-toolkit
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
python -m pip install -r requirements.txt
cd ui
npm run build_and_start
```

## WSL Huggingface Download
```shell
sudo apt install python3.12-venv
source .venv/bin/activate
python -m pip install huggingface_hub
export HF_ENDPOINT="https://hf-mirror.com"
hf auth login
hf download black-forest-labs/FLUX.1-dev  --repo-type model  --local-dir FLUX.1-dev   --exclude "flux1-dev.safetensors"
```

## WSL SimpleTuner

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-8

sudo apt-get install -y nvidia-open

sudo apt install python3.12-venv
python3 -m venv .venv
source .venv/bin/activate
pip install torch torchvision
pip install simpletuner[cuda]

sudo apt -y install libopenmpi-dev openmpi-bin libaio-dev
```
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
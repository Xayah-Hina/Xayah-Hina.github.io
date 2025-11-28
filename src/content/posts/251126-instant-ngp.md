---
title: "[Instant NGP Code Digest - A First Principle Perspective] Main Training Pipeline"
published: 2025-11-26
description: ''
image: ''
tags: [ NeRF/NGP ]
category: 'Graphics'
draft: false 
lang: 'en'
---

:::important[UPDATE LOG]
- [x] CDF Definition (2025-11-27)
:::
::github{repo="NVlabs/instant-ngp"}

# Kernel: `generate_training_samples_nerf`

## Function `image_idx`
```c++
__device__ uint32_t image_idx(
    const uint32_t base_idx,
    const uint32_t n_rays,
    const uint32_t n_training_images
    ) {
    return base_idx * n_training_images / n_rays % n_training_images;
}
```
$$
f(i) = \Biggl(\left\lfloor \frac{i \cdot N_I}{N_R} \right\rfloor \Biggr) \bmod N_I
$$

Where:

| Symbol | Corresponding variable |
|-----| ---------------------- |
| $i$  | `base_idx`             |
| $N_R$ | `n_rays`               |
| $N_I$ | `n_training_images`    |

**Intuitive interpretation**

$$
\text{Each image receives approximately } \frac{N_R}{N_I} \text{ rays.}
$$
$$
\text{Rays are distributed proportionally among the images.}
$$

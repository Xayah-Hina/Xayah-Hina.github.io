---
title: "Revisiting Instant NGP: A Deep Dive in 2025"
published: 2025-11-08
description: '"A renewed exploration of Instant Neural Graphics Primitives — revisiting its core ideas, architecture, and long-term influence three years after its 2022 release."
category: "Graphics"'
image: ''
tags: [3D-Reconstruction]
category: 'Graphics'
draft: false 
lang: ''
---

:::caution[ON DEVELOPMENT]
- UPDATE 1108 - This article is currently under development and may contain incomplete sections or inaccuracies. Please check back later for the finalized version.
:::

# 1. Background & Motivation

::github{repo="NVlabs/instant-ngp"}
https://nvlabs.github.io/instant-ngp/


# Instant Physics-Informed Hash Fields for Sparse-View Smoke Reconstruction

*(Problem Analysis, Core Contributions, Implementation Blueprint, and Expected Outcomes)*

## Abstract

We study dynamic smoke reconstruction from a handful of calibrated cameras. Prior physics-informed neural field (PINF) pipelines optimize a density field $\rho(\mathbf{x},t)$ and sometimes a velocity field $\mathbf{u}(\mathbf{x},t)$ under differentiable volume rendering and strong-form PDE residuals. In practice, the strong-form residuals require higher-order automatic differentiation, triggering **double backward**, large memory footprints, and slow training; moreover, the training step is fragmented into many small GPU kernels with poor locality.
We propose a **minimal, fast, and robust** alternative: (i) rewrite the physics supervision as **linear operators on field outputs** via weak-form integration, finite-difference stencils, and characteristic (semi-Lagrangian) approximations—so **only first-order backpropagation** is needed; and (ii) implement a **fully-fused training kernel** that combines encoding, tiny MLPs, volume rendering, physics residuals, gradient accumulation, and optimizer updates. The resulting system removes double backward, reduces kernel launches, improves bandwidth locality, and preserves the core physical coupling that disambiguates sparse views. We provide a complete method specification and an evaluation blueprint focused on efficiency, reconstruction fidelity, and physics consistency.

---

## 1. Introduction

Reconstructing time-varying smoke from sparse viewpoints is ill-posed: volumetric appearance is under-constrained, density–color interactions are non-linear, and the underlying motion is latent. Physics-informed neural fields (PINF) mitigate this ambiguity by coupling the density and velocity through PDE constraints while supervising appearance through a differentiable renderer. However, standard PINF realizations rely on **strong-form** residuals (e.g., advection–diffusion written with $\partial_t$, $\nabla$, $\nabla^2$ applied directly to network outputs) and automatic differentiation to backpropagate through these derivatives. This design forces **second-order differentiation w.r.t. network parameters**, i.e., double backward, which inflates memory and latency, and typically fragments the training step into many small GPU kernels.

**Goal.** Preserve the core benefits of physics-guided reconstruction while eliminating double backward and fusing the training dataflow to achieve large speedups and lower memory use—without auxiliary tricks (temporal consistency, sparse-time supervision, density–color disambiguation priors, etc.).

---

## 2. Core PINF Pipeline and Its Bottlenecks

### 2.1 Core PINF (sans auxiliaries)

Let $\rho:\mathbb{R}^3\times\mathbb{R}!\to!\mathbb{R}_{\ge 0}$ and $\mathbf{u}:\mathbb{R}^3\times\mathbb{R}!\to!\mathbb{R}^3$ be represented by MLPs:
$$
(\mathbf{x},t)\mapsto \rho(\mathbf{x},t),\qquad
(\mathbf{x},t)\mapsto \mathbf{u}(\mathbf{x},t).
$$

**Differentiable volume rendering.** For a ray $r(s)=\mathbf{o}+s\mathbf{d}$ at time $t$, with samples ${s_i}$ and step sizes $\Delta s_i$,
$$
\hat{C}(r,t)=\sum_{i} T_i\Bigl(1-\exp(-\sigma_i\Delta s_i)\Bigr),c_i,\qquad
T_i=\exp!\Bigl(-!\sum_{j<i}\sigma_j\Delta s_j\Bigr),\quad \sigma_i=\alpha,\rho(\mathbf{x}*i,t),
$$
where $c_i$ denotes local emission/reflectance (we use a fixed gray emission for simplicity). Photometric supervision:
$$
\mathcal{L}*{\text{img}}=\mathbb{E}_{(r,t)}\bigl\lVert \hat{C}(r,t)-C(r,t)\bigr\rVert_1.
$$

**Strong-form physics residual.** Using advection–diffusion (optional $\kappa\ge 0$):
$$
\mathcal{R}*{\text{strong}}=\partial_t \rho+\mathbf{u}\cdot\nabla\rho-\kappa,\nabla^2\rho,\qquad
\mathcal{L}*{\text{phys}}=\mathbb{E}\bigl\lVert \mathcal{R}*{\text{strong}}\bigr\rVert_2^2.
$$
Joint objective: $\ \mathcal{L}=\lambda*{\text{img}}\mathcal{L}*{\text{img}}+\lambda*{\text{phys}}\mathcal{L}_{\text{phys}}$.

### 2.2 Where the core problem appears (precise)

When differentiating $\mathcal{L}_{\text{phys}}$ w.r.t. parameters $\theta$, terms like $\nabla\rho$, $\nabla^2\rho$, $\partial_t\rho$ induce
$$
\frac{\partial}{\partial\theta}\bigl(\nabla\rho(\mathbf{x},t;\theta)\bigr)=
\nabla!\Bigl(\frac{\partial \rho}{\partial\theta}\Bigr),\qquad
\frac{\partial}{\partial\theta}\bigl(\nabla^2\rho(\cdot)\bigr)=
\nabla^2!\Bigl(\frac{\partial \rho}{\partial\theta}\Bigr),
$$
i.e., **second-order derivatives w.r.t. $\theta$**. Conventional frameworks realize this via **double backward** (e.g., `create_graph=True` in PyTorch), which:

* inflates memory (retain first-order graphs for the second pass),
* increases per-step latency,
* fragments the training into many small kernels (derivative ops, reductions, updates), wasting bandwidth and GPU launch overhead.

**Bottom line.** The bottleneck is the **combination of strong-form PDE supervision and framework-level higher-order autograd**, not physics itself.

---

## 3. Contributions

**C1. First-order physics supervision.** We replace strong-form residuals by **linear operators acting on the fields**—via weak-form (variational) integration by parts, finite-difference stencils, and characteristic (semi-Lagrangian) time differencing—so the gradient w.r.t. parameters requires **only first-order backpropagation**.

**C2. Fully-fused training kernel.** We fuse **encoding $\rightarrow$ tiny MLP forward $\rightarrow$ volume rendering (forward+backward) $\rightarrow$ physics residuals $\rightarrow$ gradient accumulation $\rightarrow$ fused Adam updates** into **one (or very few) CUDA kernels**, maximizing locality and throughput.

**C3. Sparse-view friendly representation.** A multi-resolution hash-grid encoder for space and a lightweight temporal encoding feed two tiny heads for $\rho$ and $\mathbf{u}$. Occupancy-guided sampling focuses compute on non-empty, high-gradient regions, improving convergence and detail.

---

## 4. Method

### 4.1 Representation and Encoders

We use a multi-resolution spatial hash-grid encoder $E_{\text{hash}}(\mathbf{x})\in\mathbb{R}^{2L}$ (two features per level; $L=12!-!16$) and a Fourier time encoder $E_t(t)\in\mathbb{R}^{2B}$ ($B=8!-!16$). Two tiny MLP heads (2 layers, width 64, SiLU) output:
$$
\text{MLP}*\rho:[E*{\text{hash}},E_t]\mapsto \rho(\mathbf{x},t),\qquad
\text{MLP}*u:[E*{\text{hash}},E_t]\mapsto \mathbf{u}(\mathbf{x},t)\in\mathbb{R}^3.
$$
Extinction is $\sigma=\alpha,\rho$ with $\alpha>0$ (e.g., $\alpha=1$).

### 4.2 Differentiable Volume Rendering (Fused)

Rendering follows emission–absorption with occupancy-guided sampling. We implement **forward and backward in the same kernel**: accumulate $\partial \mathcal{L}_{\text{img}}/\partial \sigma_i$ while computing $\hat{C}(r,t)$, then chain to $\partial\mathcal{L}/\partial \rho$ and back to MLP parameters.

### 4.3 Physics Supervision Without Double Backward

We provide three complementary, **first-order** routes. They can be used alone or combined.

#### 4.3.1 Weak-form (variational) residual

For subdomain $\Omega_k$ and test function $\varphi_k$,
$$
\mathcal{R}*k=\int*{\Omega_k}\Bigl(\partial_t\rho+\mathbf{u}\cdot\nabla\rho-\kappa\nabla^2\rho\Bigr),\varphi_k,\mathrm{d}V.
$$
Integration by parts transfers derivatives to $\varphi_k$:
$$
\mathcal{R}*k=\int*{\Omega_k}\Bigl(\rho,\partial_t\varphi_k-\rho,\nabla!\cdot(\mathbf{u}\varphi_k)-\kappa,\nabla\rho\cdot\nabla\varphi_k\Bigr),\mathrm{d}V
+\text{boundary terms}.
$$
Discretization uses quadrature on a small set of points per $\Omega_k$ with box/Gaussian $\varphi_k$. The resulting operator is **linear in sampled field values**, so gradients propagate with **first-order** backprop only. Loss:
$$
\mathcal{L}_{\text{phys}}=\mathbb{E}_k\bigl\Vert \mathcal{R}_k \bigr\Vert_2^2.
$$

#### 4.3.2 Finite-difference strong-form (numerical surrogate)

On a regular or hashed voxel lattice, use central/upwind stencils:
$$
\nabla\rho\approx \mathbf{D}_1\rho,\qquad \nabla^2\rho\approx \mathbf{D}*2\rho,\qquad
\mathcal{R}*{\text{diff}}=(\mathbf{D}*t\rho)+\mathbf{u}\cdot(\mathbf{D}*1\rho)-\kappa(\mathbf{D}*2\rho).
$$
Again, $\mathcal{R}*{\text{diff}}$ is a **linear** map of sampled values; loss $\ \mathcal{L}*{\text{phys}}=\mathbb{E}\lVert \mathcal{R}*{\text{diff}}\rVert_2^2$.

#### 4.3.3 Characteristic (semi-Lagrangian) time differencing

Approximate the time derivative along characteristics:
$$
\partial_t\rho(\mathbf{x},t)\approx \frac{\rho(\mathbf{x},t)-\rho\bigl(\mathbf{x}-\Delta t,\mathbf{u}(\mathbf{x},t),,t-\Delta t\bigr)}{\Delta t},
$$
realized via trilinear interpolation at the backtraced location. This is **linear in the queried samples**, thus first-order differentiable.

### 4.4 Fully-Fused Training Step

A single (or very few) CUDA kernel(s) executes:

1. sample rays and physics points (occupancy-guided),
2. compute $E_{\text{hash}}, E_t$ and forward through $\text{MLP}_\rho,\text{MLP}_u$,
3. render (forward+backward) to obtain $\partial \mathcal{L}_{\text{img}}/\partial \rho$,
4. evaluate physics residual(s) (weak/difference/characteristic) and obtain gradients w.r.t. $\rho,\mathbf{u}$,
5. accumulate gradients to encoders and MLP parameters,
6. apply **fused Adam** (mixed precision; master $\text{FP32}$, compute $\text{FP16}$/$\text{BF16}$).

Engineering: persistent threads, block-level reductions, level-by-level hash lookups, and tightly packed layouts for samples and features.

---

## 5. Implementation Details (Ready-to-Build Defaults)

* **Encoders:** $L=16$ spatial levels, $2$ features/level; $B=16$ Fourier time bands.
* **Heads:** two MLPs, depth $2$, width $64$, SiLU activations.
* **Extinction:** $\sigma=\alpha\rho$ with $\alpha=1$ (or dataset-normalized).
* **Sampling:** fixed total samples per step; maximize distinct rays; physics points drawn from occupied tiles with edge/residual bias.
* **Loss weights:** $\mathcal{L}=\lambda_{\text{img}}\mathcal{L}*{\text{img}}+\lambda*{\text{phys}}\mathcal{L}*{\text{phys}}$; ramp $\lambda*{\text{phys}}:0!\to!0.1$ over the first $5%$ steps.
* **Stability:** start with $\kappa=0$; if unstable in extreme sparsity, use $\kappa\in[5\times 10^{-6},,10^{-4}]$.
* **Precision:** compute in $\text{FP16}$/$\text{BF16}$ with master $\text{FP32}$; use blockwise reductions and occupancy grids.

---

## 6. Evaluation Plan and Expected Outcomes

### 6.1 Metrics

* **Photometric fidelity:** PSNR / SSIM / LPIPS on held-out views and times.
* **Physics consistency:** mean PDE residual $\overline{R}=\mathbb{E}\lVert\mathcal{R}\rVert_2$; optional $\mathbb{E}\lvert\nabla\cdot\mathbf{u}\rvert$.
* **Efficiency:** ms/step, samples/s, peak GPU memory (GB), wall-clock time to reach target PSNR or $\overline{R}$.

### 6.2 Baselines and Ablations

* **Baselines:**
  (B1) Original PINF core: strong-form + autograd (double backward).
  (B2) Density-only (no physics).
  (B3) Large MLP with sinusoidal/Fourier positional encoding (no hash-grid).
* **Ablations:** weak-form vs. finite-difference vs. characteristic; with vs. without fully-fusing; vary $L$, hash capacity, $B$.

### 6.3 Expected Results

* **Quality vs. time:** Our method reaches equal or higher PSNR **in less wall-clock time** than (B1–B3).
* **Physics:** $\overline{R}$ significantly lower than (B2) and comparable or better than (B1), without higher-order AD.
* **Efficiency:** step time reduced (fewer launches, better locality); **memory reduced** (no higher-order graphs).
* **Sparse views:** stable filaments and coherent advection under $2!-!4$ cameras.

Presentation: (i) wall-clock vs. PSNR curves, (ii) wall-clock vs. $\overline{R}$, (iii) tables for peak memory, step time, and time-to-target, (iv) qualitative sequences (novel views/times, iso-surfaces or MIPs), (v) residual heatmaps decaying over training.

---

## 7. Limitations

We assume simplified emission–absorption (fixed lighting/scattering). Severe occlusion or extremely sparse cameras can still under-estimate density. Long-horizon temporal extrapolation degrades without additional anchors or learned forcing.

---

## 8. Conclusion

The obstacle in core PINF pipelines is not physics but **how physics is differentiated**. By expressing PDE supervision as **linear operators on field outputs**, we remove **double backward** and enable a **fully-fused** GPU training step. Combined with hash-grid encoders and tiny MLPs, this yields a minimal, fast, and robust system for sparse-view smoke reconstruction, preserving the essential coupling between $\rho$ and $\mathbf{u}$ while delivering substantial speed and memory gains.

---

## Appendix: Compact Mathematical Summary

**Rendering.**
$$
\hat{C}(r,t)=\sum_{i}T_i\bigl(1-e^{-\sigma_i\Delta s_i}\bigr),c_i,\qquad
T_i=\exp!\Bigl(-\sum_{j<i}\sigma_j\Delta s_j\Bigr),\qquad
\sigma=\alpha\rho.
$$

**Strong-form (for reference only).**
$$
\mathcal{R}_{\text{strong}}=\partial_t \rho+\mathbf{u}\cdot\nabla\rho-\kappa\nabla^2\rho.
$$

**Weak-form (used).**
$$
\mathcal{R}*k=\int*{\Omega_k}\Bigl(\rho,\partial_t\varphi_k-\rho,\nabla!\cdot(\mathbf{u}\varphi_k)-\kappa,\nabla\rho\cdot\nabla\varphi_k\Bigr)\mathrm{d}V.
$$

**Finite differences (used).**
$$
\mathcal{R}_{\text{diff}}=(\mathbf{D}_t\rho)+\mathbf{u}\cdot(\mathbf{D}_1\rho)-\kappa(\mathbf{D}_2\rho).
$$

**Characteristic time differencing (used).**
$$
\partial_t\rho(\mathbf{x},t)\approx \frac{\rho(\mathbf{x},t)-\rho(\mathbf{x}-\Delta t,\mathbf{u}(\mathbf{x},t),,t-\Delta t)}{\Delta t}.
$$

**Objective.**
$$
\mathcal{L}=\lambda_{\text{img}}\mathbb{E}\lVert \hat{C}-C\rVert_1+\lambda_{\text{phys}}\mathbb{E}\lVert \mathcal{R}\rVert_2^2.
$$

---

*This document intentionally omits auxiliary PINF components (temporal consistency, sparse-time supervision, density–color disambiguation, external priors) to foreground the core pipeline and our contributions.*

---
title: "[Instant NGP Code Digest - A First Principle Perspective] Core Training Pipeline"
published: 2025-11-26
description: ''
image: ''
tags: [ NeRF/NGP ]
category: 'Graphics'
draft: false
lang: 'en'
---

:::note
This draft is base on the commit [
`d64e353db28109a81657879fc88025713d8fad53`](https://github.com/NVlabs/instant-ngp/tree/d64e353db28109a81657879fc88025713d8fad53)  (
Oct 8, 2025)

Instant-NGP Official Repository:
::github{repo="NVlabs/instant-ngp"}
:::

:::important[UPDATE LOG]

- [ ] complete the kernel Generate Training Samples NeRF
  :::

# 1. Introduction and Motivation

[The official Instant NGP implementation](https://github.com/NVlabs/instant-ngp) is really **impressive** in performance. However, it seems also **complex** and **daunting** at first glance.

In this article, we're going to untangle the core training pipeline, in a first-principle manner, and finally rewrite a _clean_, _tidy_, _modern_, and _easy-to-understand_ version, and achieve _better performance_.

# 2. Kernel: Generate Training Samples NeRF

> Location: `instant-ngp`/`src`/`testbed_nerf.cu` -> `generate_training_samples_nerf`

**Parameters List**

| Name                      | Type                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `n_rays`                  | `uint32_t`                                                              |
| `aabb`                    | **BoundingBox** *(custom struct)*                                       |
| `max_samples`             | `uint32_t`                                                              |
| `n_rays_total`            | `uint32_t`                                                              |
| `rng`                     | **default_rng_t** *(PCG RNG wrapper)*                                   |
| `ray_counter`             | `uint32_t*`                                                             |
| `numsteps_counter`        | `uint32_t*`                                                             |
| `ray_indices_out`         | `uint32_t*`                                                             |
| `rays_out_unnormalized`   | **Ray*** *(custom ray structure pointer)*                               |
| `numsteps_out`            | `uint32_t*`                                                             |
| `coords_out`              | **PitchedPtr<NerfCoordinate>** *(pitched GPU buffer of sampled coords)* |
| `n_training_images`       | `uint32_t`                                                              |
| `metadata`                | **TrainingImageMetadata*** *(per-image camera + rays + focal info)*     |
| `training_xforms`         | **TrainingXForm*** *(start/end view transform, rolling shutter)*        |
| `density_grid`            | `const uint8_t*`                                                        |
| `max_mip`                 | `uint32_t`                                                              |
| `max_level_rand_training` | `bool`                                                                  |
| `max_level_ptr`           | `float*`                                                                |
| `snap_to_pixel_centers`   | `bool`                                                                  |
| `train_envmap`            | `bool`                                                                  |
| `cone_angle_constant`     | `float`                                                                 |
| `distortion`              | **Buffer2DView<const vec2>** *(image-space distortion LUT)*             |
| `cdf_x_cond_y`            | `const float*`                                                          |
| `cdf_y`                   | `const float*`                                                          |
| `cdf_img`                 | `const float*`                                                          |
| `cdf_res`                 | **ivec2** *(2D integer vector)*                                         |
| `extra_dims_gpu`          | `const float*`                                                          |
| `n_extra_dims`            | `uint32_t`                                                              |


<details>
<summary>Click here to show complete code</summary>

```cpp
__global__ void generate_training_samples_nerf(
    const uint32_t n_rays, BoundingBox aabb, const uint32_t max_samples, const uint32_t n_rays_total,
    default_rng_t rng, uint32_t* __restrict__ ray_counter, uint32_t* __restrict__ numsteps_counter,
    uint32_t* __restrict__ ray_indices_out, Ray* __restrict__ rays_out_unnormalized,
    uint32_t* __restrict__ numsteps_out, PitchedPtr<NerfCoordinate> coords_out, const uint32_t n_training_images,
    const TrainingImageMetadata* __restrict__ metadata, const TrainingXForm* training_xforms,
    const uint8_t* __restrict__ density_grid, uint32_t max_mip, bool max_level_rand_training,
    float* __restrict__ max_level_ptr, bool snap_to_pixel_centers, bool train_envmap, float cone_angle_constant,
    Buffer2DView<const vec2> distortion, const float* __restrict__ cdf_x_cond_y, const float* __restrict__ cdf_y,
    const float* __restrict__ cdf_img, const ivec2 cdf_res, const float* __restrict__ extra_dims_gpu,
    uint32_t n_extra_dims)
{
    const uint32_t i = threadIdx.x + blockIdx.x * blockDim.x;
    if (i >= n_rays)
    {
        return;
    }

    uint32_t img = image_idx(i, n_rays, n_rays_total, n_training_images, cdf_img);
    ivec2 resolution = metadata[img].resolution;

    rng.advance(i * N_MAX_RANDOM_SAMPLES_PER_RAY());
    vec2 uv =
        nerf_random_image_pos_training(rng, resolution, snap_to_pixel_centers, cdf_x_cond_y, cdf_y, cdf_res, img);

    // Negative values indicate masked-away regions
    size_t pix_idx = pixel_idx(uv, resolution, 0);
    if (read_rgba(uv, resolution, metadata[img].pixels, metadata[img].image_data_type).x < 0.0f)
    {
        return;
    }

    float max_level = max_level_rand_training ? (random_val(rng) * 2.0f)
                                              : 1.0f; // Multiply by 2 to ensure 50% of training is at max level

    float motionblur_time = random_val(rng);

    const vec2 focal_length = metadata[img].focal_length;
    const vec2 principal_point = metadata[img].principal_point;
    const float* extra_dims = extra_dims_gpu + img * n_extra_dims;
    const Lens lens = metadata[img].lens;

    const mat4x3 xform =
        get_xform_given_rolling_shutter(training_xforms[img], metadata[img].rolling_shutter, uv, motionblur_time);

    Ray ray_unnormalized;
    const Ray* rays_in_unnormalized = metadata[img].rays;
    if (rays_in_unnormalized)
    {
        // Rays have been explicitly supplied. Read them.
        ray_unnormalized = rays_in_unnormalized[pix_idx];

        /* DEBUG - compare the stored rays to the computed ones
        const mat4x3 xform = get_xform_given_rolling_shutter(training_xforms[img], metadata[img].rolling_shutter,
        uv, 0.f); Ray ray2; ray2.o = xform[3]; ray2.d = f_theta_distortion(uv, principal_point, lens); ray2.d =
        (xform.block<3, 3>(0, 0) * ray2.d).normalized(); if (i==1000) { printf("\n%d uv %0.3f,%0.3f pixel
        %0.2f,%0.2f transform from [%0.5f %0.5f %0.5f] to [%0.5f %0.5f %0.5f]\n" " origin    [%0.5f %0.5f %0.5f] vs
        [%0.5f %0.5f %0.5f]\n" " direction [%0.5f %0.5f %0.5f] vs [%0.5f %0.5f %0.5f]\n" , img,uv.x, uv.y,
        uv.x*resolution.x, uv.y*resolution.y,
                training_xforms[img].start[3].x,training_xforms[img].start[3].y,training_xforms[img].start[3].z,
                training_xforms[img].end[3].x,training_xforms[img].end[3].y,training_xforms[img].end[3].z,
                ray_unnormalized.o.x,ray_unnormalized.o.y,ray_unnormalized.o.z,
                ray2.o.x,ray2.o.y,ray2.o.z,
                ray_unnormalized.d.x,ray_unnormalized.d.y,ray_unnormalized.d.z,
                ray2.d.x,ray2.d.y,ray2.d.z);
        }
        */
    }
    else
    {
        ray_unnormalized = uv_to_ray(0, uv, resolution, focal_length, xform, principal_point, vec3(0.0f), 0.0f,
                                     1.0f, 0.0f, {}, {}, lens, distortion);
        if (!ray_unnormalized.is_valid())
        {
            ray_unnormalized = {xform[3], xform[2]};
        }
    }

    vec3 ray_d_normalized = normalize(ray_unnormalized.d);

    vec2 tminmax = aabb.ray_intersect(ray_unnormalized.o, ray_d_normalized);
    float cone_angle = calc_cone_angle(dot(ray_d_normalized, xform[2]), focal_length, cone_angle_constant);

    // The near distance prevents learning of camera-specific fudge right in front of the camera
    tminmax.x = fmaxf(tminmax.x, 0.0f);

    float startt = advance_n_steps(tminmax.x, cone_angle, random_val(rng));
    vec3 idir = vec3(1.0f) / ray_d_normalized;

    // first pass to compute an accurate number of steps
    uint32_t j = 0;
    float t = startt;
    vec3 pos;

    while (aabb.contains(pos = ray_unnormalized.o + t * ray_d_normalized) && j < NERF_STEPS())
    {
        float dt = calc_dt(t, cone_angle);
        uint32_t mip = mip_from_dt(dt, pos, max_mip);
        if (density_grid_occupied_at(pos, density_grid, mip))
        {
            ++j;
            t += dt;
        }
        else
        {
            t = advance_to_next_voxel(t, cone_angle, pos, ray_d_normalized, idir, mip);
        }
    }
    if (j == 0 && !train_envmap)
    {
        return;
    }
    uint32_t numsteps = j;
    uint32_t base = atomicAdd(numsteps_counter, numsteps); // first entry in the array is a counter
    if (base + numsteps > max_samples)
    {
        return;
    }

    coords_out += base;

    uint32_t ray_idx = atomicAdd(ray_counter, 1);

    ray_indices_out[ray_idx] = i;
    rays_out_unnormalized[ray_idx] = ray_unnormalized;
    numsteps_out[ray_idx * 2 + 0] = numsteps;
    numsteps_out[ray_idx * 2 + 1] = base;

    vec3 warped_dir = warp_direction(ray_d_normalized);
    t = startt;
    j = 0;
    while (aabb.contains(pos = ray_unnormalized.o + t * ray_d_normalized) && j < numsteps)
    {
        float dt = calc_dt(t, cone_angle);
        uint32_t mip = mip_from_dt(dt, pos, max_mip);
        if (density_grid_occupied_at(pos, density_grid, mip))
        {
            coords_out(j)->set_with_optional_extra_dims(warp_position(pos, aabb), warped_dir, warp_dt(dt),
                                                        extra_dims, coords_out.stride_in_bytes);
            ++j;
            t += dt;
        }
        else
        {
            t = advance_to_next_voxel(t, cone_angle, pos, ray_d_normalized, idir, mip);
        }
    }

    if (max_level_rand_training)
    {
        max_level_ptr += base;
        for (j = 0; j < numsteps; ++j)
        {
            max_level_ptr[j] = max_level;
        }
    }
}
```

</details>

## 2.1 CUDA indexing formula

```cpp
const uint32_t i = threadIdx.x + blockIdx.x * blockDim.x;
if (i >= n_elements)
{
    return;
}
```

### Global Thread Index [[1]](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)

$$
\boxed{
i = \text{threadIdx}_x + \text{blockIdx}_x \cdot \text{blockDim}_x
}
$$

![CUDA Indexing](https://docs.nvidia.com/cuda/archive/11.4.3/cuda-c-programming-guide/graphics/grid-of-thread-blocks.png)

| Term                   | Meaning                          |
|------------------------|----------------------------------|
| $ \text{threadIdx}_x $ | index of thread inside its block |
| $ \text{blockIdx}_x $  | index of block inside the grid   |
| $ \text{blockDim}_x $  | number of threads per block      |

---

## 2.2 Determine image index for a given ray

```cpp
uint32_t img = image_idx(i, n_rays, n_rays_total, n_training_images, cdf_img);
```

### 2.2.1 Function `image_idx`

```c++
inline NGP_HOST_DEVICE uint32_t image_idx(uint32_t base_idx, uint32_t n_rays, uint32_t n_rays_total, uint32_t n_training_images, const float* __restrict__ cdf = nullptr, float* __restrict__ pdf = nullptr) {
	if (cdf) {
		float sample = ld_random_val(base_idx/* + n_rays_total*/, 0xdeadbeef);
		// float sample = random_val(base_idx/* + n_rays_total*/);
		uint32_t img = binary_search(sample, cdf, n_training_images);

		if (pdf) {
			float prev = img > 0 ? cdf[img-1] : 0.0f;
			*pdf = (cdf[img] - prev) * n_training_images;
		}

		return img;
	}

	// return ((base_idx/* + n_rays_total*/) * 56924617 + 96925573) % n_training_images;

	// Neighboring threads in the warp process the same image. Increases locality.
	if (pdf) {
		*pdf = 1.0f;
	}
	return (((base_idx/* + n_rays_total*/) * n_training_images) / n_rays) % n_training_images;
}
```

$$
f(i) = \Biggl(\left\lfloor \frac{i \cdot N_I}{N_R} \right\rfloor \Biggr) \bmod N_I
$$

Where:

| Symbol | Corresponding variable |
|--------|------------------------|
| $i$    | `base_idx`             |
| $N_R$  | `n_rays`               |
| $N_I$  | `n_training_images`    |

**Intuitive interpretation**

$$
\text{Each image receives approximately } \frac{N_R}{N_I} \text{ rays.}
$$
$$
\text{Rays are distributed proportionally among the images.}
$$

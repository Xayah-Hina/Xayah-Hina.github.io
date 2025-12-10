---
title: "[LoRA Dataset Instruction] Maintain Characteristic Features"
published: 2025-12-06
description: ''
image: ''
tags: [ LoRA Character ]
category: 'AI Painting'
draft: false 
lang: ''
---

# ✅ **1. What are “fixed features”?**

These are attributes that **must never change** across all generations:

* Hair color
* Hair length
* Hair style
* Bangs shape
* Eye color
* Skin tone
* Outfit design
* Accessory identity
* Body type
* Color palette
* Material finish

You want these to stay **the same in every output**.

This means your prompt must *always* include these attributes in a stable, consistent wording.

---

# ✅ **2. The Core Rule: Your prompt must always start with the identity block**

This is the golden rule:

### ⭐ **Identity tokens must appear first in the prompt, before any pose or environment.**

Why?
Because stable-diffusion-type models (and LoRA models) read prompts **left-to-right**.
Tokens at the beginning carry the strongest influence.

---

# ✅ **3. The perfect structure for stable fixed features**

For consistent identity, every prompt must follow this order:

---

## ⭐ **A) Identity Block (ALWAYS FIRST)**

This includes ONLY fixed features.

Example structure:

```
character_trigger, 1girl,
{hair_color}, {hair_length}, {hair_style}, {bangs_style},
{head_accessory}, {side_accessories},
{eye_color}, {skin_tone}, {expression_base},
{neck_accessory},
{top_type}, {collar}, {sleeves}, {chest_decoration},
{bottom_type}, {bottom_details},
{legwear_material} {legwear_color} {legwear_type},
{footwear_color} {footwear_type},
{body_type}, {render_style}, {material_rules}
```

Nothing in this block ever changes.
This block is your **identity lock**.

---

## ⭐ **B) Variable Block (pose, scene, lighting, camera)**

This describes the current scene.

Examples:

```
standing, gentle smile, classroom interior, diffuse lighting, medium shot, front view
```

This block may change dynamically.

---

# ✅ **4. How to keep identity stable when writing prompts**

Here are the essential rules:

---

## ⭐ Rule 1: Always use **the same exact words** for fixed features.

Do NOT switch between:

* “silver hair” → “light silver hair” → “pale silver hair”
* “navy skirt” → “blue skirt”
* “white pantyhose” → “white tights”

Stable diffusion treats these as **different traits**.

You must use **one canonical phrase** forever.

---

## ⭐ Rule 2: Never let pose/environment appear inside the identity block.

Bad example:

```
silver hair, wind blowing hair, standing, classroom
```

“wind blowing hair” is a variable trait → it contaminates the identity.

Identity block must be **pure**.

---

## ⭐ Rule 3: Identity block must include **everything that must never change**

Most people forget:

* bangs
* hair texture
* chest decoration
* legwear finish (matte / opaque)
* footwear color
* material rules (no gloss)

If you don’t define it → the model will drift.

---

## ⭐ Rule 4: Do NOT write conflicting traits

Example of contradictions:

* “matte fabrics” + “glossy stockings”
* “short hair” + “long ponytail”
* “no earrings” + “earrings”

Contradictions cause instability.

---

## ⭐ Rule 5: Use a **character trigger word**

A unique token (e.g., `xayahayaka`) gives the LoRA a strong anchor.

Put it FIRST.

---

# ✅ **5. Example: How a correct prompt looks**

Let’s say your character identity is:

* silver hair, long straight hair, blunt bangs
* blue eyes
* fair skin
* sailor blouse outfit
* white pantyhose (matte, opaque)
* black loafers

Then every prompt must begin like this:

```
xaya_newgirl, 1girl,
silver hair, long straight hair, blunt bangs,
no head accessory, no side ornaments,
blue eyes, fair skin, gentle expression,
gold choker,
white sailor blouse, navy sailor collar with white trim, long sleeves,
navy ribbon bow at chest,
navy pleated skirt, decorative hem stripe,
opaque matte white pantyhose (no gloss, not see-through),
black loafers,
slender build, semi-realistic anime style, matte fabrics,
```

Then you append variable content:

```
standing in a classroom, soft smile, diffuse daylight, medium shot, front view
```

Final prompt:

```
xaya_newgirl, 1girl,
silver hair, long straight hair, blunt bangs,
no head accessory, no side ornaments,
blue eyes, fair skin, gentle expression,
gold choker,
white sailor blouse, navy sailor collar with white trim, long sleeves,
navy ribbon bow at chest,
navy pleated skirt, decorative hem stripe,
opaque matte white pantyhose (no gloss, not see-through),
black loafers,
slender build, semi-realistic anime style, matte fabrics,
standing in a classroom, soft smile, diffuse daylight, medium shot, front view
```

---

# ✅ **6. What will make identity collapse (so you avoid it)**

### ❌ Using synonyms

“white stockings” today → “white pantyhose” tomorrow
→ drift

### ❌ Changing order

Identity tags must stay together at the front.

### ❌ Leaving out important identity tags

If you don't specify *bangs*, the model will randomize them.

### ❌ Allowing environment words to mix with identity

Never write:

```
wind in hair
wet clothes
```

inside identity block.

### ❌ Too short identity block

Your identity block must be **dense**.

Models collapse when identity is under-defined.

---

# ✅ **7. The universal template you can always follow**

Here is the fully clean template you can use for any character:

---

### ⭐ **Identity (copy/paste for every prompt; never change)**

```
{character_trigger}, 1girl,
{hair_color}, {hair_length}, {hair_style}, {bangs_style},
{head_accessory}, {side_ornaments},
{eye_color}, {skin_tone}, {expression_base},
{neck_accessory},
{top_description}, {collar_type}, {sleeve_type},
{chest_decoration},
{bottom_description},
{legwear_description},
{footwear_description},
{body_type}, {render_style}, {material_rules}
```

---

### ⭐ **Variable Block (change freely)**

```
{pose}, {momentary_expression}, {background}, {lighting}, {camera_angle}, {shot_distance}
```

---

# ⭐ If you want, I can help you design:

* your character’s complete identity block
* a final fixed-template prompt
* multiple structured variable templates
* a generation-ready ComfyUI / FluxGym script
* a dataset plan for training LoRA

Just tell me:

**“Help me create the identity block.”**

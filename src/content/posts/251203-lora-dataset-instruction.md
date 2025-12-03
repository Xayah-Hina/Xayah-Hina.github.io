---
title: "[LoRA Dataset Instruction] Captioning Guide"
published: 2025-12-03
description: ''
image: ''
tags: [ LoRA Character ]
category: 'AI Painting'
draft: false 
lang: ''
---
# 🌟 **Ultimate Captioning Guide for LoRA Training**

### **A complete, compact, and detailed rulebook for building perfect LoRA datasets (FLUX, SDXL, SD3, Z-Image, etc.)**

This is written as a **clear checklist**, designed for humans *and AI agents* to follow exactly.

---

# 🧠 **0. Philosophy of Good LoRA Captions**

A diffusion model learns by comparing:

* **features that appear in the dataset**
* **their corresponding caption tokens**

Therefore:

### ✔️ If you want the LoRA to learn a feature → **label it**

### ✔️ If you want the LoRA to ignore a feature → **do NOT label it**

### ✔️ If a feature is already strongly known to the base model → **use the base word**

### ✔️ If a feature is new/custom → **use a new invented token**

That’s the entire logic.

Everything else is the implementation below.

---

# 🔵 **1. Use a Single Unique Activation Token**

This activates your LoRA.

Format:

```
<unique_word>
```

Examples:

```
xayahayaka
xychr1
myuniform99
```

**Rules**

* Must be **unique**, not real English.
* Shorter is better (4–10 letters).
* Keep **one activation token per LoRA**.
* Put it at the **very beginning** of the caption.

---

# 🟣 **2. Describe Only the Features You Want the LoRA to Learn**

Every token you include becomes a learn target.

### ✔️ Include:

* unique features
* custom designs
* special props
* specific hairstyle
* unique clothing patterns
* signature accessories
* distinctive body shapes
* unique color palettes

### ❌ Do NOT include:

* scene
* background
* lighting
* mood
* camera angle
* composition
* common words you don’t want to bind

Because including them will force the LoRA to “bake in” those features.

---

# 🟢 **3. Keep Common Features in Caption (Only If Needed)**

The base model already knows:

* 1girl
* long hair
* bangs
* silver hair
* blue eyes
* sailor uniform
* pleated skirt

Including these helps anchor your features so the model does NOT hallucinate.

### Why?

Without them, the LoRA may “replace” unknown words with something random.

**Rule of thumb:**

* **Keep common descriptors that stabilize identity**
* **Remove common descriptors that you do NOT want to overtrain**

Example list:

```
1girl, silver hair, long hair, high ponytail, blunt bangs, blue eyes, fair skin, slender build
```

---

# 🟡 **4. Invent Tokens for Features You Want Perfectly Preserved**

For unique features that must NEVER change:

### Format:

```
<activation_token><feature_token>
```

Examples:

```
xayahayaka_ribbon
xayahayaka_uniform
xayahayaka_hairbow
xayahayaka_tassel
```

### Why do this?

Because real words like:

```
ribbon
bow
pink ornament
```

are **too general** and conflict with the base model.

This method creates **perfect controllable modular features** that can be reused on other characters.

---

# 🟤 **5. Caption Structure Template**

### **Strong recommended template for each training image**

```
<activation_token>,
(common identity descriptors),
(unique invented tokens),
(common clothing descriptors),
(unique clothing details),
(optional fixed color palette)
```

### Example (your dataset, optimized)

```
xayahayaka,
1girl, silver hair, long hair, high ponytail, blunt bangs, blue eyes, fair skin, slender build,
xayah_ribbon, xayah_tassel,
white sailor blouse, navy pleated skirt, opaque white pantyhose,
navy-and-gold color palette, pink tassel ornaments
```

---

# 🟠 **6. Caption Consistency Rules**

### ✔️ Use the same invented token everywhere

(e.g., always `xayah_ribbon`, never `xayah ribbon` or `xayah-ribbon`)

### ✔️ Describe the same feature with identical words

(e.g., always “navy pleated skirt”, never mix it with “blue skirt”)

### ✔️ Keep body type words consistent

(e.g., always “slender build”, not “slim” → “petite” → “thin”)

### ✔️ Use lower case only

(helps tokenizer stability)

---

# 🔴 **7. What NOT to Include in Captions**

Never include:

### ❌ Background

Example:
“cherry blossoms”, “park”, “street”, “sunlight”, “bench”

### ❌ Composition

“low angle”, “full body”, “close-up”, etc.

### ❌ Emotional cues

“smiling”, “sad”, “blushing”, “crying”

Because including them “freezes” these features into the LoRA.

---

# 🟣 **8. How to Handle Multi-Feature LoRAs**

If you want the LoRA to only handle **one feature**:

→ Train **one LoRA per feature**.

If you want the LoRA to include **character + outfit together**:

→ It must appear across all images
→ Captions must consistently describe both

If you want the LoRA to support:

* character alone
* outfit alone
* ribbon alone

Then you should train **separate LoRAs**.

---

# 🟢 **9. Recommended Caption Length**

* 100–200 characters
* 8–20 tokens
* Extremely long captions do NOT help
* Very short captions produce unstable training

Perfect caption length:
**1–2 lines, 12–20 items**

---

# 🔵 **10. Final Checklist Before Training**

### Make sure:

✔ Activation token is unique
✔ All unique features use invented tokens
✔ Common identity features included (if useful)
✔ Same words used consistently
✔ No background
✔ No camera angle
✔ No emotional features
✔ Describes ONLY what you want the LoRA to learn

---

# 🔥 **11. Ready-to-Use Standard Caption (Your Character Example)**

```
xayahayaka,
1girl, silver hair, long hair, high ponytail, blunt bangs, blue eyes, fair skin, slender build,
xayah_ribbon, xayah_tassel,
white sailor blouse, navy pleated skirt with gold accents, opaque white pantyhose,
navy-blue and gold palette
```

This is stable, clean, and perfect for training.

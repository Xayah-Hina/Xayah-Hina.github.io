---
title: "LoRA Character Identity 1 - Girl Character Identity"
published: 2025-11-06
description: 'Structured LoRA training prompt and annotation guide for consistent girl character identity — includes identity templates, variable attributes, and strict output formatting for dataset captions.'
image: ''
tags: [LoRA Character]
category: 'AI Painting'
draft: false 
lang: ''
---

# Girl Character Identity Prompt Template

## 🧩 1️⃣ Hair Attributes

| Sub-category       | Description                                                          | Example Tags                                                      |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Hair Color**     | Base hue and undertone; keep consistent vocabulary (avoid synonyms). | `silver hair`, `blonde hair`, `light brown hair`, `ash pink hair` |
| **Hair Length**    | Relative to shoulders/waist; do not vary across samples.             | `long hair`, `medium hair`, `short hair`                          |
| **Hair Style**     | Fundamental silhouette (ponytail, twin braids, straight, etc.).      | `high ponytail`, `straight hair`, `side braid`                    |
| **Bangs / Fringe** | Shape and cut; ensures face recognition.                             | `blunt bangs`, `side bangs`, `forehead visible`                   |
| **Hair Texture**   | Overall texture behavior.                                            | `smooth hair`, `soft hair`, `flowing hair`                        |
| **Head Accessory** | Primary decorative element on or above head.                         | `big ribbon`, `hair clip`, `headband`                             |
| **Side Ornaments** | Secondary adornments (ear ribbons, tassels).                         | `ribbon hair ornaments`, `tassel hair ties`                       |

---

## 👁️ 2️⃣ Face Attributes

| Sub-category        | Description                                             | Example Tags                                   |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| **Eye Color**       | Fixed hue; controls character gaze identity.            | `blue eyes`, `green eyes`, `amber eyes`        |
| **Eye Shape**       | Distinct shape / curve style.                           | `almond eyes`, `round eyes`                    |
| **Eyebrows**        | Thickness and tone.                                     | `thin eyebrows`, `light eyebrows`              |
| **Skin Tone**       | Core tonal identity; keep globally consistent.          | `fair skin`, `tan skin`, `pale skin`           |
| **Face Shape**      | General silhouette.                                     | `soft oval face`, `heart-shaped face`          |
| **Expression Base** | Default resting emotion (gentle / neutral / confident). | `gentle expression`, `soft smile`, `calm face` |
| **Make-up Detail**  | Style level.                                            | `natural look`, `light makeup`, `no eyeliner`  |

---

## 💍 3️⃣ Neck / Upper Accessory

| Sub-category                 | Description                  | Example Tags                                                  |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------- |
| **Neck Jewelry**             | Chokers, ribbons, pendants.  | `gold choker with pendant`, `black ribbon choker`, `necklace` |
| **Scarf / Collar Accessory** | Non-jewelry collar elements. | `ribbon tie`, `sailor collar trim`                            |

---

## 👕 4️⃣ Outfit Structure

### (A) Upper Garment

| Feature              | Description                           | Example Tags                                       |
| -------------------- | ------------------------------------- | -------------------------------------------------- |
| **Type**             | Shirt, blouse, armor plate, etc.      | `white blouse`, `school uniform top`, `kimono top` |
| **Color**            | Dominant hue; maintain stable naming. | `white`, `navy`, `black`                           |
| **Sleeves**          | Short / long / detached, etc.         | `long sleeves`, `short sleeves`                    |
| **Collar**           | Collar design.                        | `sailor collar`, `high collar`                     |
| **Chest Decoration** | Ribbon, tie, brooch.                  | `navy ribbon bow`, `red necktie`                   |
| **Fit / Shape**      | Loose / tight / cropped.              | `slim fit blouse`, `cropped top`                   |
| **Fabric Finish**    | Surface property.                     | `matte fabric`, `silky fabric`, `cotton texture`   |

### (B) Lower Garment

| Feature        | Description                     | Example Tags                            |
| -------------- | ------------------------------- | --------------------------------------- |
| **Type**       | Skirt / shorts / pants / armor. | `pleated skirt`, `shorts`               |
| **Color**      | Dominant hue.                   | `navy`, `black`, `red`                  |
| **Length**     | Relative coverage.              | `mid-thigh skirt`, `ankle-length dress` |
| **Structure**  | Material and silhouette.        | `structured pleats`, `flowing skirt`    |
| **Decoration** | Trim / patterns.                | `decorative hem stripe`, `floral print` |

### (C) Legwear

| Feature               | Description                                | Example Tags                                                          |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| **Type**              | Socks / stockings / pantyhose / bare legs. | `pantyhose`, `thighhighs`, `bare legs`                                |
| **Color**             | Hue of legwear.                            | `white pantyhose`, `black stockings`                                  |
| **Material / Finish** | Texture control.                           | `opaque`, `matte`, `sheer`, `glossy`, `not glossy`, `not see-through` |
| **Fit**               | How tight / smooth.                        | `tight fit`, `smooth fabric`                                          |

### (D) Footwear

| Feature     | Description             | Example Tags                              |
| ----------- | ----------------------- | ----------------------------------------- |
| **Type**    | Shoes or boots type.    | `black loafers`, `brown boots`, `sandals` |
| **Color**   | Stable color reference. | `black`, `brown`                          |
| **Details** | Buckles, bows, straps.  | `strap shoes`, `buckle boots`             |

---

## 🎀 5️⃣ Additional Accessories / Props

| Category          | Description                          | Example Tags                    |
| ----------------- | ------------------------------------ | ------------------------------- |
| **Jewelry**       | Rings, bracelets, earrings (if any). | `earrings`, `bracelet`, `ring`  |
| **Hair Extras**   | Minor ornaments.                     | `hair clip`, `flower accessory` |
| **Hands / Nails** | Keep neutral.                        | `clean nails`, `no nail polish` |
| **Ears**          | If visible or decorated.             | `no earrings`, `pierced ears`   |

---

## 🧠 6️⃣ Body Structure / General Style

| Feature               | Description                        | Example Tags                                              |
| --------------------- | ---------------------------------- | --------------------------------------------------------- |
| **Body Type**         | Fixed physique class for identity. | `slender build`, `curvy body`, `athletic`                 |
| **Height Impression** | Relative proportion perception.    | `petite`, `tall`, `average height`                        |
| **Hands / Arms**      | Proportion & delicacy.             | `delicate hands`, `small hands`                           |
| **Render Style**      | Artistic domain consistency.       | `semi-realistic anime`, `soft shading`, `matte rendering` |
| **Tone Palette**      | Dominant palette family.           | `cool tone palette`, `pastel colors`, `neutral colors`    |

---

## 🧶 7️⃣ Color / Material Rules (Global)

| Aspect                | Rule                                                         | Example                                                       |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| **Primary Palette**   | Define the character’s overall color family (2–3 main hues). | `blue-white-gold scheme`, `red-black scheme`                  |
| **Material Finish**   | Global physical finish for fabrics/metals.                   | `matte fabrics`, `gold metallic accents`, `no gloss surfaces` |
| **Reflectivity**      | Avoid unintentional shiny surfaces.                          | `diffuse reflection only`, `no specular highlights`           |
| **Metal Consistency** | Restrict to one metal color if applicable.                   | `gold only`, `silver only`                                    |

---

## 🧱 8️⃣ Final Identity Prompt Block (Template)

Use this in LoRA caption or conditioning text.
Replace placeholders `{...}` with concrete attributes.

```yaml
{character_trigger}, 1girl,
{hair_color}, {hair_length}, {hair_style}, {bangs_style},
{head_accessory}, {side_ornaments},
{eye_color}, {skin_tone}, {expression_base},
{neck_accessory},
{top_color} {top_type}, {collar_type}, {sleeve_type},
{chest_decoration},
{bottom_color} {bottom_type}, {decoration},
{legwear_material} {legwear_color} {legwear_type} (no gloss, not see-through),
{footwear_color} {footwear_type},
{body_type}, {render_style}, {material_finish}
```

Example instantiated for Ayaka:

```yaml
xayahayaka, 1girl,
silver hair, long hair, high ponytail, blunt bangs,
big navy bow, pink ribbon hair ornaments with tassels,
blue eyes, fair skin, gentle expression,
gold choker with tassel pendant,
white sailor blouse, navy sailor collar with white trim, long sleeves,
navy ribbon bow at chest,
navy pleated skirt, decorative hem stripe,
opaque matte white pantyhose (no gloss, not see-through),
black loafers,
slender build, semi-realistic anime style, matte fabrics
```

# Girl Character Variable Attribute Framework

## 1️⃣ Pose & Body Dynamics

| Sub-category               | Description                       | Example Tags                                                                |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| **Global Pose**            | Full-body stance variety.         | `standing`, `sitting`, `kneeling`, `lying`, `jumping`, `walking`, `running` |
| **Upper-Body Gestures**    | Hand positions, arm orientations. | `arms crossed`, `hands on hips`, `touching hair`, `holding hand near face`  |
| **Leg Gestures**           | Leg crossing, kneeling angles.    | `crossed legs`, `kneeling`, `one leg bent`, `sitting on knees`              |
| **Camera-Facing**          | Viewpoint orientation.            | `front view`, `side view`, `back view`, `three-quarter view`                |
| **Perspective Variation**  | Camera position.                  | `low angle`, `high angle`, `close-up`, `full body`                          |
| **Balance / Weight Shift** | Adds realism and variation.       | `leaning`, `tilting head`, `resting hand`                                   |

> 🔹 *Purpose:* expands the model’s body composition understanding and avoids overfitting to a single silhouette.

---

## 2️⃣ Facial Expressions & Emotional States

| Sub-category             | Description                                                      | Example Tags                                                                              |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Emotion Range**        | Mild emotion shifts compatible with the character’s personality. | `smiling`, `blushing`, `surprised`, `sad`, `laughing`, `serious`, `embarrassed`, `crying` |
| **Mouth Shape**          | Subtle variations that affect expression.                        | `open mouth`, `closed mouth`, `slight smile`, `pouting`                                   |
| **Eye Gaze**             | Gaze direction variety.                                          | `looking at viewer`, `looking away`, `looking down`, `looking up`, `side glance`          |
| **Blush / Tear Accents** | Adds expressiveness.                                             | `blush`, `tears`, `sweatdrop`                                                             |

> 🔹 *Purpose:* trains emotional adaptability while keeping visual style stable.

---

## 3️⃣ Scene Context (Environment)

| Sub-category                | Description                   | Example Tags                                                                    |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| **Setting Category**        | General type of environment.  | `classroom`, `street`, `park`, `room`, `rooftop`, `garden`, `beach`, `cafe`     |
| **Time / Lighting Context** | Light direction, time of day. | `sunlight`, `sunset`, `night`, `indoors lighting`, `diffuse light`, `backlight` |
| **Seasonal Context**        | Environmental themes.         | `spring`, `summer`, `autumn leaves`, `snow`, `cherry blossoms`                  |
| **Background Detail**       | Optional descriptive anchor.  | `under cherry blossoms`, `in classroom`, `on staircase`                         |
| **Depth / Composition**     | Depth layering and distance.  | `close-up portrait`, `medium shot`, `full body`                                 |

> 🔹 *Purpose:* enables style adaptation and environment embedding without changing identity.

---

## 4️⃣ Clothing Variation (Optional / Thematic)

| Sub-category            | Description                               | Example Tags                                                     |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| **Seasonal Versions**   | Small design changes while keeping theme. | `summer uniform`, `winter uniform`, `short sleeves`, `with coat` |
| **Accessory Presence**  | Optional external accessories.            | `holding bag`, `wearing jacket`, `carrying umbrella`             |
| **Fabric Behavior**     | Physical state variation.                 | `wind blowing clothes`, `wet clothes`, `wrinkled fabric`         |
| **Partial Disassembly** | For realism, not exposure.                | `unbuttoned collar`, `rolled sleeves`                            |

> 🔹 *Purpose:* teaches the LoRA how to map minor costume changes to the same identity (important for generalization).

---

## 5️⃣ Prop & Interaction Domain

| Sub-category                    | Description                        | Example Tags                                                                           |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| **Held Objects**                | Items in hands.                    | `holding book`, `holding umbrella`, `carrying bag`, `holding phone`, `holding flower`  |
| **Scene Props**                 | Objects in environment.            | `desk`, `chair`, `window`, `fence`, `bench`                                            |
| **Interaction Type**            | Relationship with props or others. | `leaning on desk`, `sitting on chair`, `touching water`, `talking with another person` |
| **Multi-Character Interaction** | If dataset includes pairs/groups.  | `hugging`, `hand holding`, `back to back`, `walking together`                          |

> 🔹 *Purpose:* improves semantic control in text-to-image inference, e.g. “xayahayaka holding umbrella under rain.”

---

## 6️⃣ Lighting & Rendering Domain

| Aspect                | Description                 | Example Tags                                                 |
| --------------------- | --------------------------- | ------------------------------------------------------------ |
| **Lighting Angle**    | Directional variations.     | `front lighting`, `rim light`, `backlight`, `top light`      |
| **Lighting Quality**  | Hard / soft shadows.        | `soft lighting`, `diffuse lighting`, `dramatic lighting`     |
| **Color Temperature** | Warm / cool tones for mood. | `warm light`, `cool light`, `neutral light`                  |
| **Rendering Mood**    | Style emphasis.             | `cinematic lighting`, `moody atmosphere`, `vibrant contrast` |

> 🔹 *Purpose:* helps LoRA adapt to multiple lighting distributions at inference time.

---

## 7️⃣ Composition & Framing

| Sub-category        | Description                         | Example Tags                                    |
| ------------------- | ----------------------------------- | ----------------------------------------------- |
| **Framing**         | Cropping and camera field.          | `portrait`, `waist up`, `full body`, `close up` |
| **Focus Depth**     | Use of blur for variety.            | `shallow depth of field`, `sharp focus`         |
| **Orientation**     | Horizontal vs vertical composition. | `landscape`, `portrait orientation`             |
| **Camera Distance** | Distance control.                   | `medium shot`, `long shot`, `close-up`          |

---

## 8️⃣ Art-Style & Rendering Variant (if applicable)

| Sub-category            | Description                              | Example Tags                                                       |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| **Rendering Style**     | Artistic look, within same model domain. | `anime style`, `semi-realistic`, `illustration`, `soft watercolor` |
| **Brush / Line Weight** | Edge rendering.                          | `thin lines`, `painterly style`                                    |
| **Texture Emphasis**    | Global surface treatment.                | `smooth shading`, `textured shading`                               |
| **Color Scheme**        | Optional variation for mood.             | `pastel palette`, `vivid palette`, `monotone`                      |

> 🔹 *Purpose:* for style LoRA, varying these enhances domain transfer; for identity LoRA, keep moderate diversity.

---

## 9️⃣ Background / Environment Effects

| Feature                    | Description                | Example Tags                                           |
| -------------------------- | -------------------------- | ------------------------------------------------------ |
| **Particles / Atmosphere** | Environmental overlays.    | `falling petals`, `snowflakes`, `rain`, `glow`, `dust` |
| **Weather State**          | Lighting + mood variation. | `rainy`, `sunny`, `foggy`, `clear sky`                 |
| **Backdrop Structure**     | General spatial anchors.   | `school corridor`, `park bench`, `bridge`, `street`    |

---

## 🔟 Camera & Photographic Variations

| Feature                | Description                | Example Tags                               |
| ---------------------- | -------------------------- | ------------------------------------------ |
| **Lens / Perspective** | Visual distortion variety. | `wide angle`, `telephoto`, `fisheye`       |
| **Motion Blur**        | Dynamic feel.              | `motion blur`, `dynamic pose`              |
| **Color Grading**      | Tone shift for atmosphere. | `film tone`, `vintage color`, `soft color` |

---

## ✅ Summary of Non-Fixed Domains to Cover

| Domain                         | Goal                   | Typical Range                   |
| ------------------------------ | ---------------------- | ------------------------------- |
| **Pose & Body**                | Structural variability | 10–20 unique full-body poses    |
| **Facial Expression**          | Emotional diversity    | 5–10 expressions                |
| **Lighting & Time**            | Visual realism         | 3–6 conditions                  |
| **Scene Context**              | Context adaptability   | 4–8 environments                |
| **Clothing / Accessory State** | Limited variation      | 2–3 subtypes per outfit         |
| **Props & Interaction**        | Gesture variety        | 5–10 object/interaction samples |
| **Composition**                | Framing diversity      | portrait / full-body / medium   |
| **Style & Rendering**          | Optional               | 2–3 stylistic variants          |

---

## 📘 Usage Guidelines

1. **Diversity within control:**
   Vary within these domains, but keep *identity attributes locked* from your invariant template.

2. **Caption coverage:**
   Include relevant variable tags in captions as they appear (e.g., `sitting on chair`, `sunset lighting`), but **never mix identity-changing tags** (e.g., hair color or clothing type not belonging to the character).

3. **Dataset balance:**
   Ensure roughly equal coverage across pose, expression, and environment to avoid over-bias toward any single pattern.

4. **Generation scripting:**
   When generating data via FluxGym or ComfyUI, systematically sample these variables (pose/lighting/context grids) to create orthogonal variation for better LoRA generalization.


# System Prompt

```yaml
SYSTEM ROLE
You are a data-annotation assistant for LoRA training. The user will send images one by one. 
For each image, you MUST extract:
1) FIXED (identity) attributes — invariant character features (hair, eyes, outfit core, accessories, body type, material/color rules).
2) VARIABLE attributes — pose, expression intensity, scene context, lighting, composition, props/interaction, style variants.

GOALS
- Produce consistent, high-signal captions for LoRA training.
- Keep identity stable across all samples; allow variability only in the variable section.
- Never invent details not visible in the image.

TERMS & RULES
- “Fixed/Identity” = intrinsic traits of the same character and outfit identity. These MUST NOT drift between images.
- “Variable” = everything that may change across images (pose, expression, environment, lighting, framing, props, minor outfit state).
- If an attribute is not visible or uncertain, write “(not visible)” in the STRUCTURED section ONLY. 
  Do NOT include “(not visible)” in the final training prompt.
- Use concise, canonical English tags (avoid synonyms drift; use stable vocabulary like: “navy”, “white”, “gold”, “matte”, “opaque”).
- DO NOT include background/pose/emotion words inside the Identity block.
- DO NOT hallucinate. If unsure, mark “(not visible)” in the structured section and omit from the prompt.
- NEVER add negative prompts for Flux (no “negative prompt” field; CFG is assumed = 1.0 and managed elsewhere).

ONTOLOGY (COVER ALL RELEVANT FIELDS)
A) FIXED / IDENTITY ATTRIBUTES (pose-independent)
  1. Hair
     - Hair Color (stable hue/undertone; e.g., silver hair, light blue hair)
     - Hair Length (short/medium/long)
     - Hair Style (e.g., high ponytail, straight hair)
     - Bangs/Fringe (e.g., blunt bangs, side bangs)
     - Head Accessory (e.g., big navy bow, headband)
     - Side Ornaments (e.g., ribbon hair ornaments with tassels)
  2. Face
     - Eye Color (canonical)
     - Skin Tone (e.g., fair skin/pale skin/tan skin)
     - Expression Base (default gentle/neutral; not pose or momentary emotion)
     - Face Shape (optional if reliably visible; else “(not visible)”)
  3. Neck / Upper Accessory
     - Neck Jewelry / Ornament (e.g., gold choker with tassel pendant)
  4. Outfit (structural identity, not pose/state)
     - Top (type + canonical color + collar + sleeves; e.g., white sailor blouse, navy sailor collar with white trim, long sleeves)
     - Chest Decoration (e.g., navy ribbon bow at chest)
     - Bottom (type + canonical color; e.g., navy pleated skirt; optional emblem/trim if consistently present)
     - Legwear (type + color + material finish; e.g., opaque matte white pantyhose; add “no gloss”, “not see-through” if intrinsic)
     - Footwear (type + color; e.g., black loafers)
  5. Body Type
     - Build / Proportions (e.g., slender build; avoid exaggeration words)
  6. Material / Color Rules (global)
     - Palette (e.g., cool blue–white–gold)
     - Fabric Finish (e.g., matte fabrics; avoid shiny/latex)

B) VARIABLE ATTRIBUTES (may change per image)
  1. Pose & Gesture
     - Global Pose (standing/sitting/kneeling/lying/etc.)
     - Upper-Body Gesture (hands/arms positions: touching hair, arms crossed, etc.)
  2. Facial Expression (momentary emotion)
     - Expression Type (smile/serious/blush/surprised/etc.)
     - Mouth/Eye specifics (open mouth, side glance) if visible
  3. Scene Context
     - Background / Location (classroom/street/park/room/etc.)
     - Lighting / Time (sunlight/sunset/night/diffuse/backlight/etc.)
  4. Composition
     - Framing / Camera Angle (full body/medium shot/close-up; front/side/three-quarter; low/high angle)
     - Focus/Depth (shallow DOF/sharp focus)
     - Orientation (portrait/landscape)
  5. Props / Interaction
     - Held Objects / Surfaces / 2nd person interactions (holding book, sitting on chair, hugging, etc.)
  6. Style Variant (optional; keep moderate for identity LoRA)
     - Rendering Style (anime/semi-realistic/illustration)
     - Color Mood (pastel/vivid/monotone)

OUTPUT FORMAT (STRICT)
Always return BOTH sections below in this order:

1) STRUCTURED ANALYSIS (for review; may include “(not visible)”)
- Fixed / Identity
  [Hair]
    - Hair Color: <text or (not visible)>
    - Hair Length: <text or (not visible)>
    - Hair Style: <text or (not visible)>
    - Bangs: <text or (not visible)>
    - Head Accessory: <text or (not visible)>
    - Side Ornaments: <text or (not visible)>
  [Face]
    - Eye Color: <text or (not visible)>
    - Skin Tone: <text or (not visible)>
    - Expression Base: <text or (not visible)>
    - Face Shape: <text or (not visible)>
  [Neck/Upper Accessory]
    - Neck Ornament: <text or (not visible)>
  [Outfit]
    - Top: <type + color + collar + sleeves> or (not visible)
    - Chest Decoration: <text or (not visible)>
    - Bottom: <type + color + details> or (not visible)
    - Legwear: <type + color + material finish> or (not visible)
    - Footwear: <type + color> or (not visible)
  [Body Type]
    - Build: <text or (not visible)>
  [Material/Color Rules]
    - Palette: <text or (not visible)>
    - Fabric Finish: <text or (not visible)>
  [Identity Prompt Summary]
    - ONE LINE, English, pose-independent, DO NOT include any “(not visible)”.

- Variable
  [Pose & Gesture]
    - Global Pose: <text or (not visible)>
    - Upper-Body Gesture: <text or (not visible)>
  [Facial Expression]
    - Expression Type: <text or (not visible)>
  [Scene Context]
    - Background / Location: <text or (not visible)>
    - Lighting / Time: <text or (not visible)>
  [Composition]
    - Framing / Camera Angle: <text or (not visible)>
    - Focus / Depth: <text or (not visible)>
    - Orientation: <text or (not visible)>
  [Props / Interaction]
    - Items / Interaction: <text or (not visible)>
  [Style Variant] (optional)
    - Rendering / Color Mood: <text or (not visible)>
  [Variable Prompt Summary]
    - ONE LINE, English. May include pose/scene/lighting/props. DO NOT include any “(not visible)”.

2) FINAL TRAINING PROMPT (CLEAN)
- Concatenate: [Identity Prompt Summary] + [Variable Prompt Summary] into ONE LINE.
- Automatically REMOVE any “(not visible)” tokens.
- Do NOT include background-only words unless visible. 
- Keep color/material vocabulary canonical (no synonym drift).
- Keep identity words first; variable words after.

BEHAVIORAL CONSTRAINTS
- If an identity attribute is missing/occluded, keep it out of the Identity Prompt Summary (do not invent). 
- DO NOT move variable attributes into identity.
- DO NOT change hair/eye/primary outfit identity across images.
- Avoid intensifiers that change identity (e.g., “ultra glossy tights” if identity is “opaque matte tights”).
- No NSFW content; no guessing hidden anatomy/garments.

QUALITY CHECK (RUN BEFORE RESPONDING)
- Identity tags present, stable, and pose-independent?
- Variable tags describe only visible, per-image changes?
- Final Training Prompt has NO “(not visible)”, duplicates, or contradictory material specs?
- Vocabulary canonical: colors (navy/white/black/gold), finishes (matte/opaque), style (anime/semi-realistic) consistent?

EXAMPLE (ABRIDGED)
[Identity Prompt Summary]
xayahayaka, 1girl, silver hair, long hair, high ponytail, blunt bangs, blue eyes, fair skin, gold choker with tassel pendant, white sailor blouse, navy sailor collar with white trim, navy ribbon bow at chest, navy pleated skirt, opaque matte white pantyhose (no gloss, not see-through), black loafers, slender build

[Variable Prompt Summary]
sitting on chair, gentle smile, classroom interior, diffuse daylight, medium shot, front view

[Final Training Prompt]
xayahayaka, 1girl, silver hair, long hair, high ponytail, blunt bangs, blue eyes, fair skin, gold choker with tassel pendant, white sailor blouse, navy sailor collar with white trim, navy ribbon bow at chest, navy pleated skirt, opaque matte white pantyhose (no gloss, not see-through), black loafers, slender build, sitting on chair, gentle smile, classroom interior, diffuse daylight, medium shot, front view
```
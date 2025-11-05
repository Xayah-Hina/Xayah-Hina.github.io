---
title: "Flux LoRA Character Identity"
published: 2025-11-06
description: ''
image: ''
tags: [AI Painting, ComfyUI, Flux]
category: 'Generative AI'
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


## Kamizato Ayaka Sailor Uniform

### Hair (Head & Style)

| Sub-category         | Feature                                    | Description                                | Tags / Descriptors                                     |
| -------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| **Color**            | Silver-blue / bluish-silver                | Cool tone, slight blue tint under light    | `silver hair`, `light blue hair`, `bluish silver hair` |
| **Length**           | Long                                       | Extends below shoulders, visible movement  | `long hair`                                            |
| **Style**            | High ponytail                              | Signature trait; tied near crown, lifted   | `high ponytail`                                        |
| **Bangs / Fringe**   | Blunt straight bangs                       | Even horizontal cut above eyes             | `blunt bangs`, `straight bangs`                        |
| **Hair Texture**     | Smooth, soft, naturally flowing            | No curls, no frizz                         | `smooth hair`, `flowing hair`                          |
| **Head Accessory**   | Large navy ribbon bow                      | Fixed on top/back of ponytail              | `big navy bow`, `hair bow`                             |
| **Side Ornaments**   | Pink tassel ribbons (bilateral)            | Hanging ribbon ties with tassels near ears | `pink ribbon hair ornaments with tassels`              |
| **Additional Notes** | Hair always tied; never loose or twin-tail | Keep consistent throughout dataset         | —                                                      |

### Face (Facial Features & Expression)

| Sub-category       | Feature                      | Description                              | Tags / Descriptors                  |
| ------------------ | ---------------------------- | ---------------------------------------- | ----------------------------------- |
| **Eye Color**      | Light blue / gray-blue       | Cold hue; reflective iris                | `blue eyes`, `light gray-blue eyes` |
| **Eye Shape**      | Almond, gentle arc           | Graceful anime eye shape                 | `large eyes`, `almond eyes`         |
| **Eyebrows**       | Thin, arched                 | Matches hair color                       | `thin eyebrows`, `light eyebrows`   |
| **Skin Tone**      | Fair, pale                   | No blush base, consistent cold undertone | `fair skin`, `pale skin`            |
| **Face Shape**     | Soft oval with delicate chin | Neither round nor sharp                  | —                                   |
| **Expression**     | Calm, gentle, serene         | Never exaggerated                        | `gentle expression`, `soft smile`   |
| **Make-up Detail** | Minimal, natural             | Avoid heavy eyeliner or lip color        | `natural look`                      |

### Neck & Upper Body Accessories

| Sub-category            | Feature                                         | Description                            | Tags / Descriptors                                                 |
| ----------------------- | ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| **Neck Ornament**       | Gold choker with tassel pendant                 | Rigid ring with central hanging tassel | `gold choker`, `tassel pendant`, `gold choker with tassel pendant` |
| **Neckline Visibility** | Slight collarbone visible when cropped top used | For cropped blouse variants            | `collarbone` (optional)                                            |


### Outfit (Clothing Structure)

#### (A) Upper Garment — Sailor Blouse

| Feature          | Description                           | Tags / Descriptors                                      |
| ---------------- | ------------------------------------- | ------------------------------------------------------- |
| Base Color       | Pure white                            | `white blouse`, `white sailor blouse`                   |
| Collar           | Navy sailor collar with white trim    | `navy sailor collar`, `navy collar with white trim`     |
| Sleeves          | Long-sleeved design                   | `long sleeves`, `sailor long sleeves`                   |
| Chest Ribbon     | Navy ribbon bow                       | `navy ribbon bow at chest`, `sailor ribbon`             |
| Fit / Shape      | Slightly fitted waist; soft fabric    | `slim fit blouse`, `soft fabric`                        |
| Midriff Exposure | Slight cropped version (some samples) | `cropped sailor blouse`, `slight midriff`, `navel peek` |
| Fabric Type      | Matte cotton texture                  | `matte fabric`, `cotton texture`                        |

#### (B) Lower Garment — Pleated Skirt

| Feature        | Description                           | Tags / Descriptors                               |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| Base Color     | Navy blue                             | `navy pleated skirt`                             |
| Skirt Length   | Mid-thigh                             | `mid-thigh skirt`, `short pleated skirt`         |
| Structure      | Sharp pleats, solid form              | `stiff pleats`, `structured skirt`               |
| Hem Decoration | Golden / light stripe or emblem motif | `decorative hem stripe`, `emblem print on skirt` |
| Fabric Finish  | Matte, medium weight                  | `matte fabric`, `school uniform skirt`           |


#### (C) Legwear — Pantyhose

| Feature    | Description                     | Tags / Descriptors                                              |
| ---------- | ------------------------------- | --------------------------------------------------------------- |
| Type       | Full pantyhose                  | `pantyhose`, `tights`                                           |
| Color      | White                           | `white pantyhose`, `white tights`                               |
| Material   | Opaque, matte, non-reflective   | `opaque`, `matte`, `not glossy`, `not see-through`, `non-sheer` |
| Fit        | Smooth, form-fitting            | `tight fit`, `smooth surface`                                   |
| Prohibited | No sheen, no transparent effect | add explicitly: `no gloss`, `no shiny tights`                   |

### Additional Body & Accessory Consistency

| Sub-category        | Feature                         | Description                       | Tags / Descriptors |
| ------------------- | ------------------------------- | --------------------------------- | ------------------ |
| **Body Type**       | Slender, elegant, proportionate | `slender build`, `elegant figure` |                    |
| **Hands**           | Delicate, small                 | `delicate hands`, `small hands`   |                    |
| **Nails**           | Natural, unpainted              | `clean nails`, `no nail polish`   |                    |
| **Jewelry**         | None except choker              | —                                 |                    |
| **Ears / Earrings** | None visible                    | `no earrings`                     |                    |


### Color & Material Rules (Cross-Category Consistency)

| Aspect                                  | Rule                                            | Description                             |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| **Color Palette**                       | Cool-toned blue–white scheme                    | Avoid warm hues or saturation shift     |
| **Fabric Finish**                       | Matte only                                      | No latex, no gloss reflection           |
| **Metal Accents**                       | Gold (for choker/tassel only)                   | No silver or mixed metals               |
| **Hair/Cloth Reflectivity**             | Subtle diffuse highlights only                  | Avoid specular shine                    |
| **Lighting Domain (for normalization)** | Neutral-soft diffuse lighting (no HDR contrast) | Helps LoRA stabilize texture embeddings |

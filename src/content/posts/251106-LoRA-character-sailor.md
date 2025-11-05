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

## Girl Character Identity Prompt Template

### 🧩 1️⃣ Hair Attributes

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

### 👁️ 2️⃣ Face Attributes

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

### 💍 3️⃣ Neck / Upper Accessory

| Sub-category                 | Description                  | Example Tags                                                  |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------- |
| **Neck Jewelry**             | Chokers, ribbons, pendants.  | `gold choker with pendant`, `black ribbon choker`, `necklace` |
| **Scarf / Collar Accessory** | Non-jewelry collar elements. | `ribbon tie`, `sailor collar trim`                            |

---

### 👕 4️⃣ Outfit Structure

#### (A) Upper Garment

| Feature              | Description                           | Example Tags                                       |
| -------------------- | ------------------------------------- | -------------------------------------------------- |
| **Type**             | Shirt, blouse, armor plate, etc.      | `white blouse`, `school uniform top`, `kimono top` |
| **Color**            | Dominant hue; maintain stable naming. | `white`, `navy`, `black`                           |
| **Sleeves**          | Short / long / detached, etc.         | `long sleeves`, `short sleeves`                    |
| **Collar**           | Collar design.                        | `sailor collar`, `high collar`                     |
| **Chest Decoration** | Ribbon, tie, brooch.                  | `navy ribbon bow`, `red necktie`                   |
| **Fit / Shape**      | Loose / tight / cropped.              | `slim fit blouse`, `cropped top`                   |
| **Fabric Finish**    | Surface property.                     | `matte fabric`, `silky fabric`, `cotton texture`   |

#### (B) Lower Garment

| Feature        | Description                     | Example Tags                            |
| -------------- | ------------------------------- | --------------------------------------- |
| **Type**       | Skirt / shorts / pants / armor. | `pleated skirt`, `shorts`               |
| **Color**      | Dominant hue.                   | `navy`, `black`, `red`                  |
| **Length**     | Relative coverage.              | `mid-thigh skirt`, `ankle-length dress` |
| **Structure**  | Material and silhouette.        | `structured pleats`, `flowing skirt`    |
| **Decoration** | Trim / patterns.                | `decorative hem stripe`, `floral print` |

#### (C) Legwear

| Feature               | Description                                | Example Tags                                                          |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| **Type**              | Socks / stockings / pantyhose / bare legs. | `pantyhose`, `thighhighs`, `bare legs`                                |
| **Color**             | Hue of legwear.                            | `white pantyhose`, `black stockings`                                  |
| **Material / Finish** | Texture control.                           | `opaque`, `matte`, `sheer`, `glossy`, `not glossy`, `not see-through` |
| **Fit**               | How tight / smooth.                        | `tight fit`, `smooth fabric`                                          |

#### (D) Footwear

| Feature     | Description             | Example Tags                              |
| ----------- | ----------------------- | ----------------------------------------- |
| **Type**    | Shoes or boots type.    | `black loafers`, `brown boots`, `sandals` |
| **Color**   | Stable color reference. | `black`, `brown`                          |
| **Details** | Buckles, bows, straps.  | `strap shoes`, `buckle boots`             |

---

### 🎀 5️⃣ Additional Accessories / Props

| Category          | Description                          | Example Tags                    |
| ----------------- | ------------------------------------ | ------------------------------- |
| **Jewelry**       | Rings, bracelets, earrings (if any). | `earrings`, `bracelet`, `ring`  |
| **Hair Extras**   | Minor ornaments.                     | `hair clip`, `flower accessory` |
| **Hands / Nails** | Keep neutral.                        | `clean nails`, `no nail polish` |
| **Ears**          | If visible or decorated.             | `no earrings`, `pierced ears`   |

---

### 🧠 6️⃣ Body Structure / General Style

| Feature               | Description                        | Example Tags                                              |
| --------------------- | ---------------------------------- | --------------------------------------------------------- |
| **Body Type**         | Fixed physique class for identity. | `slender build`, `curvy body`, `athletic`                 |
| **Height Impression** | Relative proportion perception.    | `petite`, `tall`, `average height`                        |
| **Hands / Arms**      | Proportion & delicacy.             | `delicate hands`, `small hands`                           |
| **Render Style**      | Artistic domain consistency.       | `semi-realistic anime`, `soft shading`, `matte rendering` |
| **Tone Palette**      | Dominant palette family.           | `cool tone palette`, `pastel colors`, `neutral colors`    |

---

### 🧶 7️⃣ Color / Material Rules (Global)

| Aspect                | Rule                                                         | Example                                                       |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| **Primary Palette**   | Define the character’s overall color family (2–3 main hues). | `blue-white-gold scheme`, `red-black scheme`                  |
| **Material Finish**   | Global physical finish for fabrics/metals.                   | `matte fabrics`, `gold metallic accents`, `no gloss surfaces` |
| **Reflectivity**      | Avoid unintentional shiny surfaces.                          | `diffuse reflection only`, `no specular highlights`           |
| **Metal Consistency** | Restrict to one metal color if applicable.                   | `gold only`, `silver only`                                    |

---

### 🧱 8️⃣ Final Identity Prompt Block (Template)

Use this in LoRA caption or conditioning text.
Replace placeholders `{...}` with concrete attributes.

```
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

```
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

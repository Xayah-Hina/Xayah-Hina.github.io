---
title: "Comprehensive Sailor Uniform Character Generation"
published: 2025-11-07
description: "Comprehensive guide and prompt template for analyzing Japanese sailor uniforms, detailing core feature dimensions, vocabulary guidelines, example outputs, and an auto-formatted agent prompt for producing structured Markdown reports and combined text-to-image prompts."
image: "https://huggingface.co/datasets/XayahHina/imagebed/resolve/main/LoRA%20dataset/xayahayaka/3.jpg"
tags: [AI Painting, ComfyUI, Flux]
category: 'Generative AI'
draft: false 
lang: 'en'
---

# Sailor Uniform Core Feature Dimensions

| Category                 | Dimension           | Typical Options (English)                                    | Example Prompt Phrase          |
| ------------------------ | ------------------- | ------------------------------------------------------------ | ------------------------------ |
| **Top (Blouse)**         | Collar Type         | square / sailor / stand / collarless / mini lapel            | `square sailor collar`         |
|                          | Collar Trim Color   | white / navy / red / black / gold / silver                   | `navy-trim collar`             |
|                          | Collar Stripe Count | one stripe / two stripes / triple stripes / plain            | `triple-striped collar`        |
|                          | Sleeve Length       | sleeveless / short / three-quarter / long                    | `long-sleeve sailor blouse`    |
|                          | Cuff Detail         | striped cuff / ribbon cuff / plain cuff / lace cuff          | `striped cuffs`                |
|                          | Front Closure       | pullover / zip front / buttoned / open front                 | `buttoned sailor top`          |
|                          | Fabric              | cotton / polyester / wool / silk / blend                     | `cotton sailor top`            |
|                          | Chest Decoration    | pocket / emblem badge / ribbon detail / none                 | `chest emblem badge`           |
|                          | Neck Accessory      | necktie / ribbon bow / scarf tie / bowknot / tie clip        | `red ribbon bow`               |
|                          | Back Bow            | large bow / small bow / none                                 | `large back bow`               |
|                          | Shoulder Detail     | epaulet stripe / plain / double-line trim                    | `naval shoulder stripe`        |
| **Skirt**                | Skirt Type          | pleated / A-line / circular / asymmetrical                   | `pleated skirt`                |
|                          | Skirt Length        | mini / mid-length / knee-length / long                       | `knee-length pleated skirt`    |
|                          | Waist Style         | high-waist / normal waist / elastic / belted                 | `high-waist skirt`             |
|                          | Skirt Color         | navy / black / gray / red / white / checkered                | `navy pleated skirt`           |
|                          | Skirt Pattern       | solid / plaid / striped / gradient / lace edge               | `plaid skirt`                  |
|                          | Skirt Layers        | single-layer / double-layer / lace underskirt                | `double-layer skirt`           |
|                          | Skirt Fabric        | cotton / polyester / wool / chiffon / blend                  | `wool skirt`                   |
| **Hosiery**              | Sock Type           | no socks / ankle / calf / knee-high / thigh-high / pantyhose | `thigh-high socks`             |
|                          | Sock Color          | white / black / gray / navy / striped / sheer                | `white thigh-highs`            |
|                          | Sock Pattern        | plain / striped / checkered / lace / floral edge             | `striped thigh-high socks`     |
|                          | Sock Accessory      | ribbon bow / lace trim / garter / none                       | `ribbon thigh-highs`           |
| **Footwear**             | Shoe Type           | loafers / mary janes / school shoes / sneakers / boots       | `black loafers`                |
|                          | Shoe Color          | black / brown / navy / white / red                           | `brown school shoes`           |
|                          | Shoe Finish         | glossy / matte / leather / patent                            | `glossy leather shoes`         |
|                          | Heel Height         | flat / low heel / medium heel                                | `low-heel loafers`             |
| **Outerwear (Seasonal)** | Layer Type          | cardigan / vest / blazer / coat / cape                       | `cardigan over sailor uniform` |
|                          | Material            | wool / knit / cotton / polyester                             | `wool cardigan`                |
|                          | Color Theme         | navy / gray / beige / white / black                          | `navy blazer`                  |
| **Accessories**          | Scarf / Tie Clip    | neck scarf / sailor scarf / scarf ring                       | `sailor scarf with clip`       |
|                          | School Emblem       | chest badge / tie clip emblem / collar pin                   | `school emblem on chest`       |
|                          | Belt / Strap        | slim belt / decorative strap / none                          | `decorative belt`              |
|                          | Bag                 | shoulder school bag / hand-carry school bag                  | `holding a school bag`         |
| **Headwear**             | Hat Type            | sailor hat / beret / no hat                                  | `white sailor hat`             |
|                          | Hair Accessory      | ribbon / hair clip / bow / headband / none                   | `ribbon hair accessory`        |
| **Gloves (optional)**    | Glove Type          | white gloves / black gloves / none                           | `white gloves`                 |

# Sailor Uniform Analysis Prompt Template

**Role Definition:**

> You are an expert **Japanese sailor uniform visual tagger**.
> Your task is to analyze the provided image and describe **only the uniform itself** — not the background, pose, or lighting.
>
> You must output all observations as **Markdown tables** following the structure below.
> Every field must have both a **Value** (factual term) and a **Prompt Phrase** (short phrase suitable for T2I or ComfyUI use).
>
> If an element is not visible, write `not visible`.
> If you are uncertain, write `unsure`.
>
> If you detect **extra uniform-related elements** (e.g. jewelry, pattern, fasteners, ribbons not listed), add them under **Extra Features**.
>
> Finally, produce a fluent **Combined Prompt** sentence summarizing the entire visible uniform.

---

## Output Format

### **Top (Blouse)**

| Dimension           | Value | Prompt Phrase |
| ------------------- | ----- | ------------- |
| Collar Type         |       |               |
| Collar Trim Color   |       |               |
| Collar Stripe Count |       |               |
| Sleeve Length       |       |               |
| Cuff Detail         |       |               |
| Front Closure       |       |               |
| Fabric              |       |               |
| Chest Decoration    |       |               |
| Neck Accessory      |       |               |
| Back Bow            |       |               |
| Shoulder Detail     |       |               |

---

### **Skirt**

| Dimension   | Value | Prompt Phrase |
| ----------- | ----- | ------------- |
| Type        |       |               |
| Length      |       |               |
| Waist Style |       |               |
| Color       |       |               |
| Pattern     |       |               |
| Layers      |       |               |
| Fabric      |       |               |

---

### **Hosiery**

| Dimension      | Value | Prompt Phrase |
| -------------- | ----- | ------------- |
| Sock Type      |       |               |
| Sock Color     |       |               |
| Sock Pattern   |       |               |
| Sock Accessory |       |               |

---

### **Footwear**

| Dimension   | Value | Prompt Phrase |
| ----------- | ----- | ------------- |
| Shoe Type   |       |               |
| Shoe Color  |       |               |
| Shoe Finish |       |               |
| Heel Height |       |               |

---

### **Outerwear (if any)**

| Dimension   | Value | Prompt Phrase |
| ----------- | ----- | ------------- |
| Layer Type  |       |               |
| Material    |       |               |
| Color Theme |       |               |

---

### **Accessories**

| Dimension         | Value | Prompt Phrase |
| ----------------- | ----- | ------------- |
| Scarf or Tie Clip |       |               |
| School Emblem     |       |               |
| Belt or Strap     |       |               |
| Bag               |       |               |

---

### **Headwear**

| Dimension      | Value | Prompt Phrase |
| -------------- | ----- | ------------- |
| Hat Type       |       |               |
| Hair Accessory |       |               |

---

### **Gloves**

| Dimension  | Value | Prompt Phrase |
| ---------- | ----- | ------------- |
| Glove Type |       |               |

---

### **Extra Features (optional)**

| Feature | Prompt Phrase |
| ------- | ------------- |
|         |               |
|         |               |

---

### **Combined Prompt**

```
<Compose one clean English sentence summarizing the entire visible uniform.>
```

---

## Vocabulary Guidelines

Always choose terms from the following vocab sets when possible:

* **Collar Type:** `square`, `sailor`, `stand`, `collarless`, `mini lapel`
* **Collar Trim Color:** `white`, `navy`, `red`, `black`, `gold`, `silver`
* **Skirt Type:** `pleated`, `A-line`, `circular`, `asymmetrical`
* **Sock Type:** `no socks`, `ankle`, `calf`, `knee-high`, `thigh-high`, `pantyhose`
* **Shoe Type:** `loafers`, `mary janes`, `school shoes`, `sneakers`, `boots`
* **Materials:** `cotton`, `polyester`, `wool`, `chiffon`, `blend`

If a unique variation appears (e.g., “sailor top with floral embroidery”), record it as an **Extra Feature**.

---

## Example Output

### Example Image Analysis Result

**Top (Blouse)**

| Dimension         | Value        | Prompt Phrase      |
| ----------------- | ------------ | ------------------ |
| Collar Type       | sailor       | sailor collar      |
| Collar Trim Color | navy         | navy-trim collar   |
| Sleeve Length     | long         | long-sleeve blouse |
| Cuff Detail       | striped cuff | striped cuffs      |
| Chest Decoration  | ribbon bow   | blue ribbon bow    |

**Skirt**

| Dimension | Value      | Prompt Phrase            |
| --------- | ---------- | ------------------------ |
| Type      | pleated    | pleated skirt            |
| Length    | mid-length | mid-length pleated skirt |
| Color     | navy       | navy skirt               |
| Pattern   | solid      | solid navy skirt         |

**Hosiery**

| Dimension    | Value     | Prompt Phrase   |
| ------------ | --------- | --------------- |
| Sock Type    | pantyhose | white pantyhose |
| Sock Color   | white     | white           |
| Sock Pattern | solid     | solid white     |

**Footwear**

| Dimension   | Value    | Prompt Phrase        |
| ----------- | -------- | -------------------- |
| Shoe Type   | loafers  | brown loafers        |
| Shoe Finish | glossy   | glossy leather shoes |
| Heel Height | low heel | low-heel loafers     |

**Accessories**

| Dimension      | Value | Prompt Phrase |
| -------------- | ----- | ------------- |
| Hair Accessory | bow   | blue hair bow |
| School Emblem  | none  | not visible   |

**Extra Features**

| Feature         | Prompt Phrase        |
| --------------- | -------------------- |
| Choker necklace | gold choker necklace |

**Combined Prompt:**

> *“A girl wearing a white long-sleeved sailor blouse with navy-trim collar and blue ribbon bow, paired with a navy pleated mid-length skirt, white pantyhose, glossy brown loafers, blue hair bow, and a gold choker necklace.”*

# Sailor Uniform Analysis – Auto-Formatted Agent Prompt

````markdown
### [SYSTEM ROLE]
You are an expert visual tagger and fashion analyst specialized in **Japanese sailor uniforms**.  
Your task is to analyze the provided **image input** and output a **structured Markdown report** describing the sailor uniform in full detail.  

Focus **only** on the uniform itself — not the background, pose, or lighting.  

---

### [OUTPUT REQUIREMENTS]

1. You **must** output Markdown tables exactly as defined below.  
2. Each table cell must contain:
   - **Value** → concise factual description (English)
   - **Prompt Phrase** → short text-to-image prompt phrase usable in ComfyUI / Stable Diffusion / FLUX.
3. If a feature is **not visible**, write `not visible`.  
   If uncertain, write `unsure`.
4. If you notice **extra uniform-related elements not covered by the schema**
   (e.g. jewelry, choker, pattern, unique buttons, armband),
   add them in the **Extra Features** section.
5. End with a **Combined Prompt** — a single fluent English sentence combining all visible details.

---

### [OUTPUT FORMAT]

#### **Top (Blouse)**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Collar Type |  |  |
| Collar Trim Color |  |  |
| Collar Stripe Count |  |  |
| Sleeve Length |  |  |
| Cuff Detail |  |  |
| Front Closure |  |  |
| Fabric |  |  |
| Chest Decoration |  |  |
| Neck Accessory |  |  |
| Back Bow |  |  |
| Shoulder Detail |  |  |

---

#### **Skirt**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Type |  |  |
| Length |  |  |
| Waist Style |  |  |
| Color |  |  |
| Pattern |  |  |
| Layers |  |  |
| Fabric |  |  |

---

#### **Hosiery**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Sock Type |  |  |
| Sock Color |  |  |
| Sock Pattern |  |  |
| Sock Accessory |  |  |

---

#### **Footwear**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Shoe Type |  |  |
| Shoe Color |  |  |
| Shoe Finish |  |  |
| Heel Height |  |  |

---

#### **Outerwear (if any)**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Layer Type |  |  |
| Material |  |  |
| Color Theme |  |  |

---

#### **Accessories**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Scarf or Tie Clip |  |  |
| School Emblem |  |  |
| Belt or Strap |  |  |
| Bag |  |  |

---

#### **Headwear**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Hat Type |  |  |
| Hair Accessory |  |  |

---

#### **Gloves**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Glove Type |  |  |

---

#### **Extra Features (optional)**
| Feature | Prompt Phrase |
|----------|----------------|
|  |  |
|  |  |

---

#### **Combined Prompt**
```
<Write one clear English sentence summarizing the entire visible uniform design>
```

---

### [VOCABULARY GUIDELINES]

Use the following vocabulary families when applicable:

- **Collar Type:** `square`, `sailor`, `stand`, `collarless`, `mini lapel`  
- **Collar Trim Color:** `white`, `navy`, `red`, `black`, `gold`, `silver`  
- **Skirt Type:** `pleated`, `A-line`, `circular`, `asymmetrical`  
- **Sock Type:** `no socks`, `ankle`, `calf`, `knee-high`, `thigh-high`, `pantyhose`  
- **Shoe Type:** `loafers`, `mary janes`, `school shoes`, `sneakers`, `boots`  
- **Material Keywords:** `cotton`, `polyester`, `wool`, `chiffon`, `blend`  

If something unique is detected (e.g., floral embroidery, gold piping),  
record it as an *Extra Feature*.

---

### [EXAMPLE OUTPUT]

**Top (Blouse)**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Collar Type | sailor | sailor collar |
| Collar Trim Color | navy | navy-trim collar |
| Sleeve Length | long | long-sleeved blouse |
| Neck Accessory | ribbon bow | blue ribbon bow |

**Skirt**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Type | pleated | pleated skirt |
| Color | navy | navy skirt |
| Pattern | solid | solid navy skirt |

**Hosiery**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Sock Type | pantyhose | white pantyhose |
| Sock Color | white | white |

**Footwear**
| Dimension | Value | Prompt Phrase |
|------------|--------|----------------|
| Shoe Type | loafers | brown loafers |
| Shoe Finish | glossy | glossy leather shoes |

**Extra Features**
| Feature | Prompt Phrase |
|----------|----------------|
| Gold choker necklace | gold choker necklace |

**Combined Prompt:**
> *“A girl wearing a white long-sleeved sailor blouse with navy-trim collar and blue ribbon bow, navy pleated skirt, white pantyhose, glossy brown loafers, and a gold choker necklace.”*
````

---
title: "Mizuki Markdown 全功能测试"
published: 2025-09-14
updated: 2025-09-14
draft: false
description: "全面测试 Mizuki 博客框架 Markdown 支持能力"
tags: ["markdown","test","mizuki"]
category: "Demo"
lang: "zh"
pinned: false
author: "Xayah"
---

# 一级标题
## 二级标题
### 三级标题

**粗体** *斜体* ~~删除线~~ <u>下划线</u>  
行内代码：`console.log("hello")`

---

## 列表
- 无序 A
- 无序 B
    - 子项 1
    - 子项 2

1. 有序 1
2. 有序 2
3. 有序 3

- [x] 已完成
- [ ] 未完成

---

## 引用
> 这是一个引用块  
> 可以多行

---

## 分割线
---

## 表格

| 名称    | 星级 | 备注        |
|---------|------|-------------|
| Vulkan  | ★★★★☆ | GPU Compute |
| CUDA    | ★★★★★ | Kernels     |
| Blender | ★★★☆☆ | Extension   |

---

## 代码块

```js
function greet(name) {
  console.log(`Hello ${name}`);
}
greet("Mizuki");
```

```python
def add(a, b):
    return a+b
```

---

## 链接与图片
[外部链接](https://github.com/Xayah-Hina)  
![示例图片](/images/1.webp)

---

## 提示框
:::info
这是一个 info 提示框
:::

:::tip
这是一个 tip 提示框
:::

:::warning
这是一个 warning 提示框
:::

:::danger
这是一个 danger 提示框
:::

---

## 数学公式

行内：$E = mc^2$

块级：

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

---

## Mermaid 图表

### 流程图
```mermaid
---
config:
  theme: redux-dark
  layout: elk
  look: neo
---
flowchart TD
 subgraph s1["Untitled subgraph"]
        n4["Untitled Node"]
  end
    A(["Start"]) --> B{"Decision"} & n1["Untitled Node"]
    B --> C["Option A"] & D["Option B"] & n3["Untitled Node"] & n5(["Stadium"])
    n1 --> n2["Untitled Node"]
    n2 --> s1
    B --> n6["Parallelogram Reversed"]
    n6@{ shape: lean-r}
     A:::Ash
    classDef Ash stroke-width:1px, stroke-dasharray:none, stroke:#999999, fill:#EEEEEE, color:#000000

```

```mermaid
graph TD;
    %% =========== Build / Create Phase ===========
    IN["用户提交 BuildDesc"] --> V{"shell_validate?"};
    V --|false|--> VERR["返回 ValidationFailed"];
    V --|true|--> TR["shell_translate"];
    TR --> PK["shell_pack"];
    PK --> CTB["shell_cache_track_begin"];
    CTB --> EC["engine_create"];

    subgraph EngineCreateInternals["engine_create 内部"]
        EC --> CQ{"shell_cache_query(key)"};
        CQ --|有 key|--> CL["shell_cache_load"];
        CL --|miss|--> BM["cooking_build_model"];
        CQ --|无 key|--> BM;
        CL --|hit|--> HAVE["获得 Model"];
        BM --> HAVE;
        HAVE --> STC{"需写入缓存?"};
        STC --|yes|--> SC["shell_cache_store"];
        STC --|no|--> NOSTORE["noop"];
        HAVE --> DC["core_data_create_from_state"];
        DC --> BSEL["backends_choose"];
        BSEL --> CFG["配置 Data 执行/布局标志"];
    end

    CFG --> CTE["shell_cache_track_end"];
    CTE --> EH["构造 Solver(EngineHandle + TelemetryFrame 初始化)"];
    EH --> READY["Solver Ready"];

    %% =========== Runtime Commands (Param / Structural) ===========
    subgraph CommandFlow["运行时命令流"]
        CMD["外部命令 Command[]"] --> AP1{"Param 修改?"};
        AP1 --|yes|--> EASP["engine_apply_small_params"];
        EASP --> OVR["core_data_apply_overrides<br/>更新 Data 参数/开关"];
        AP1 --|no|--> AP2{"结构修改?"};
        AP2 --|yes|--> EASC["engine_apply_structural_changes"];
        EASC --> CRM["cooking_rebuild_model_from_commands"];
        CRM --> RMP["core_data_apply_remap"];
        RMP --> REP["替换 EngineHandle 中 Model/Data"];
        AP2 --|no|--> NOCMD["无影响"];
    end

    READY --> LOOPENTRY["开始帧循环"];
    OVR --> LOOPENTRY;
    REP --> LOOPENTRY;

    %% =========== Runtime per-frame step entry ===========
    LOOPENTRY --> STEP["sim::step(dt)"];
    STEP --> ESTP["engine_step"];
    ESTP --> RSTEP["runtime_step"];

    %% =========== runtime_step internal high-level ===========
    RSTEP --> PRE{"substeps/iterations/damping 解析<br/>(OVR 覆盖优先)"};
    PRE --> SUBLOOP{"for each substep"};

    %% ----- Substep Body -----
    SUBLOOP --> INT["integrate_pred(dt_sub)"];
    INT --> ALPHA["prepare_alpha_edge(dt_sub)"];
    ALPHA --> LAYOUT{"布局分支"};

    %% Blocked (AoSoA)
    LAYOUT --|Blocked|--> PACKB["storage_pack_soa_to_aosoa"];
    PACKB --> ATTB{"attachment?"};
    ATTB --|yes|--> ATTBK["presolve_attachment_aosoa"];
    ATTB --|no|--> SKIPATTB["skip"];
    ATTBK --> DISTB["project_distance_islands_aosoa"];
    SKIPATTB --> DISTB;
    DISTB --> BENDB{"bending?"};
    BENDB --|yes|--> BENDBK["bending_pass_aosoa"];
    BENDB --|no|--> SKIPBENDB["skip"];
    BENDBK --> UNPACKB["storage_unpack_aosoa_to_soa"];
    SKIPBENDB --> UNPACKB;

    %% AoS
    LAYOUT --|AoS|--> PACKA["storage_pack_soa_to_aos"];
    PACKA --> ATTA{"attachment?"};
    ATTA --|yes|--> ATTAK["presolve_attachment_aos"];
    ATTA --|no|--> SKIPATTA["skip"];
    ATTAK --> DISTA["project_distance_islands_aos"];
    SKIPATTA --> DISTA;
    DISTA --> BENDA{"bending?"};
    BENDA --|yes|--> BENDAK["bending_pass_aos"];
    BENDA --|no|--> SKIPBENDA["skip"];
    BENDAK --> UNPACKA["storage_unpack_aos_to_soa"];
    SKIPBENDA --> UNPACKA;

    %% SoA Native
    LAYOUT --|SoA|--> ATTS{"attachment?"};
    ATTS --|yes|--> ATTSK["presolve_attachment_soa"];
    ATTS --|no|--> SKIPATTS["skip"];
    ATTSK --> DISTS["project_distance_islands_soa"];
    SKIPATTS --> DISTS;
    DISTS --> BENDS{"bending?"};
    BENDS --|yes|--> BENDSK["bending_pass_soa"];
    BENDS --|no|--> SKIPBENDS["skip"];

    %% Finalize (merged)
    UNPACKB --> FIN["finalize(dt_sub,damping)"];
    UNPACKA --> FIN;
    BENDSK --> FIN;
    SKIPBENDS --> FIN;

    FIN --> NEXTSUB["下一 substep"];
    NEXTSUB --> SUBLOOP;

    SUBLOOP --|全部完成|--> RESID["compute_distance_residual"];
    RESID --> TEL["写 TelemetryFrame(phase timings + residual)"];
    TEL --> STEPEND["engine_step 返回 Status::Ok"];
    STEPEND --> FRAMEEND["帧结束"];

    FRAMEEND --> LOOPENTRY;

    %% Feedback edges
    OVR --> PRE;
    REP --> PRE;

    classDef phase fill:#064,stroke:#eee,color:#fff;
    classDef cond fill:#155,stroke:#eee,color:#fff;
    classDef data fill:#2a7,stroke:#fff,color:#fff;
    classDef cache fill:#5a4,stroke:#fff,color:#fff;
    class V,TR,PK,CTB,EC,CQ,CL,BM,HAVE,DC,BSEL,CFG,EH,READY,STEP,ESTP,RSTEP,PRE,SUBLOOP,INT,ALPHA,LAYOUT,PACKB,ATTBK,DISTB,BENDBK,UNPACKB,PACKA,ATTAK,DISTA,BENDAK,UNPACKA,ATTSK,DISTS,BENDSK,FIN,RESID,TEL,STEPEND,FRAMEEND,OVR,EASC,CRM,RMP,REP,EASP phase;
    class VERR,NOCMD,SKIPATTB,SKIPBENDB,SKIPATTA,SKIPBENDA,SKIPATTS,SKIPBENDS,NOSTORE cache;
    class CQ,STC,AP1,AP2,LAYOUT,ATTB,BENDA,ATTA,BENDA,ATTS,BENDS,PRE,SUBLOOP cond;
```

### 时序图
```mermaid
sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
```

### 类图
```mermaid
classDiagram
  Animal <|-- Cat
  Animal <|-- Dog
  class Animal {
    +String name
    +run()
  }
```

### 甘特图
```mermaid
gantt
  title 项目进度
  dateFormat  YYYY-MM-DD
  section 开发
  任务1 :done,    des1, 2025-09-01,2025-09-05
  任务2 :active,  des2, 2025-09-06, 5d
```

### 状态图
```mermaid
stateDiagram-v2
  [*] --> State1
  State1 --> State2
  State2 --> [*]
```

### 饼图
```mermaid
pie title 技能分布
  "CUDA" : 40
  "Vulkan" : 30
  "Blender" : 20
  "其他" : 10
```

### ER 图
```mermaid
erDiagram
  USER ||--o{ POST : writes
  POST ||--|{ COMMENT : contains
```

---

## 脚注
这是一个脚注引用[^1]。

[^1]: 这是脚注内容。

---

## Emoji
😄 🎉 🚀 ✨ :smile: :star:

---

## 视频与音频
<video controls width="400" src="/videos/demo.mp4"></video>  
<audio controls src="/audios/demo.mp3"></audio>

---

## 自定义组件
<Badge text="Beta" type="warning" />

---

## 目录
（此文档应自动生成 TOC，右侧显示）

---

结束测试 🎉

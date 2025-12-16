---
title: Vulkan Tutorial Read Digest
published: 2025-12-11
description: 'https://docs.vulkan.org/tutorial/latest'
image: ''
tags: [ Vulkan ]
category: 'Rendering'
draft: false
lang: ''
---

# Initialization

## Create Instance RAII

```cpp
void VulkanEngine::create_instance_raii() {
    glfwInit();
    check_validation_layers_support(this->context, this->info.required_layers);
    auto requiredExtensions = check_extensions_support(this->context);

    const ApplicationInfo appInfo{
        .pApplicationName   = this->info.app_name.c_str(),
        .applicationVersion = VK_MAKE_VERSION(1, 0, 0),
        .pEngineName        = this->info.engine_name.c_str(),
        .engineVersion      = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion         = ApiVersion14,
    };
    const InstanceCreateInfo createInfo{
        .pApplicationInfo        = &appInfo,
        .enabledLayerCount       = static_cast<uint32_t>(this->info.required_layers.size()),
        .ppEnabledLayerNames     = this->info.required_layers.data(),
        .enabledExtensionCount   = static_cast<uint32_t>(requiredExtensions.size()),
        .ppEnabledExtensionNames = requiredExtensions.data(),
    };
    this->instance = raii::Instance(context, createInfo);
}
```

### 1. initialize glfw first

```cpp
glfwInit()
```

`glfwInit()` need to be called before creating a Vulkan instance. :spoiler[(TODO: The exact reason unknown)]

### 2. check validation layers support

| Layers                        | Notes                    |
|-------------------------------|--------------------------|
| `VK_LAYER_KHRONOS_validation` | enable validation layers |

```cpp
void check_validation_layers_support(const raii::Context& context, const std::vector<const char*>& requiredLayers) {
    auto layerProperties = context.enumerateInstanceLayerProperties();
    for (auto const& requiredLayer : requiredLayers) {
        if (std::ranges::none_of(layerProperties, [requiredLayer](auto const& layerProperty) { return strcmp(layerProperty.layerName, requiredLayer) == 0; })) {
            throw std::runtime_error("Required layer not supported: " + std::string(requiredLayer));
        }
    }
}
```

### 3. check extensions support

| Extensions                          | Notes                       |
|-------------------------------------|-----------------------------|
| `EXTDebugUtilsExtensionName`        | :spoiler[(TODO: Fill here)] |
| `KHRSwapchainExtensionName`         | :spoiler[(TODO: Fill here)] |
| `KHRSpirv14ExtensionName`           | :spoiler[(TODO: Fill here)] |
| `KHRSynchronization2ExtensionName`  | :spoiler[(TODO: Fill here)] |
| `KHRCreateRenderpass2ExtensionName` | :spoiler[(TODO: Fill here)] |

```cpp
auto check_extensions_support(const raii::Context& context) {
    uint32_t glfwExtensionCount = 0;
    const auto glfwExtensions   = glfwGetRequiredInstanceExtensions(&glfwExtensionCount);
    std::vector requiredExtensions(glfwExtensions, glfwExtensions + glfwExtensionCount);
    requiredExtensions.push_back(EXTDebugUtilsExtensionName);
    auto extensionProperties = context.enumerateInstanceExtensionProperties();
    for (auto const& requiredExtension : requiredExtensions) {
        if (std::ranges::none_of(extensionProperties, [requiredExtension](auto const& extensionProperty) { return strcmp(extensionProperty.extensionName, requiredExtension) == 0; })) {
            throw std::runtime_error("Required extension not supported: " + std::string(requiredExtension));
        }
    }
    return requiredExtensions;
}
```

### 4. ApplicationInfo

| Items                | Notes                                                       | Affects Vulkan behavior? |
|----------------------|-------------------------------------------------------------|--------------------------|
| `pApplicationName`   | The human-readable name of your application                 | ❌                        |
| `applicationVersion` | A developer-defined version number for your app             | ❌                        |
| `pEngineName`        | Name of the engine or framework, not the app                | ❌                        |
| `engineVersion`      | Version number of your engine, not Vulkan                   | ❌                        |
| `apiVersion`         | The maximum Vulkan API version your application understands | ✅                        |

```cpp
const ApplicationInfo appInfo{
    .pApplicationName   = this->info.app_name.c_str(),
    .applicationVersion = VK_MAKE_VERSION(1, 0, 0),
    .pEngineName        = this->info.engine_name.c_str(),
    .engineVersion      = VK_MAKE_VERSION(1, 0, 0),
    .apiVersion         = ApiVersion14,
};
```

#### What’s the difference between an application and an engine?

High-level idea (one sentence)

- Application: The thing the user runs
- Engine: The reusable technology that powers the app

Real-world examples

- Application: Elden Ring
- Engine: FromSoftware Engine

### 5. InstanceCreateInfo

| Items                      | Notes                                                   |
|----------------------------|---------------------------------------------------------|
| `pApplicationInfo`         | Links your instance to the metadata you already defined |
| `enabledLayerCount`        | Number of instance layers you want to enable            |
| `ppEnabledLayerNames`      | Pointer to an array of C-strings                        |
| `enabledExtensionCount   ` | Number of instance extensions you want                  |
| `ppEnabledExtensionNames ` | `Pointer to array of extension names`                   |

```cpp
const InstanceCreateInfo createInfo{
    .pApplicationInfo        = &appInfo,
    .enabledLayerCount       = static_cast<uint32_t>(this->info.required_layers.size()),
    .ppEnabledLayerNames     = this->info.required_layers.data(),
    .enabledExtensionCount   = static_cast<uint32_t>(requiredExtensions.size()),
    .ppEnabledExtensionNames = requiredExtensions.data(),
};
```

---

## Create Debug Messenger RAII

A debug messenger is a callback hook registered with the Vulkan loader + validation layers.
Whenever something happens:

- Validation error
- Performance warning
- General info
- Incorrect API usage

Vulkan calls your function.

:::Important
This exists only in debug / development
It has zero effect on rendering
It does not exist in release builds unless you enable it
:::

```cpp
void VulkanEngine::create_debug_messenger_raii() {
    constexpr DebugUtilsMessageSeverityFlagsEXT severityFlags(DebugUtilsMessageSeverityFlagBitsEXT::eVerbose | DebugUtilsMessageSeverityFlagBitsEXT::eWarning | DebugUtilsMessageSeverityFlagBitsEXT::eError);
    constexpr DebugUtilsMessageTypeFlagsEXT messageTypeFlags(DebugUtilsMessageTypeFlagBitsEXT::eGeneral | DebugUtilsMessageTypeFlagBitsEXT::ePerformance | DebugUtilsMessageTypeFlagBitsEXT::eValidation);
    constexpr DebugUtilsMessengerCreateInfoEXT debugUtilsMessengerCreateInfoEXT{.messageSeverity = severityFlags, .messageType = messageTypeFlags, .pfnUserCallback = &debugCallback};
    this->debug_messenger = this->instance.createDebugUtilsMessengerEXT(debugUtilsMessengerCreateInfoEXT);
}
```

### 1. debug messenger severity flags

| Severity flags | Notes                            |
|----------------|----------------------------------|
| `eVerbose`     | Very detailed info (often noisy) |
| `eInfo`        | Informational messages           |
| `eWarning`     | Valid but suspicious usage       |
| `eError`       | Spec violations or invalid calls |

#### Best practice

During early learning:

```cpp
eVerbose | eInfo | eWarning | eError
```

During serious development:

```cpp
eWarning | eError
```

### 2. debug messenger type flags

| Message type flags | Notes                       |
|--------------------|-----------------------------|
| `eGeneral`         | Non-specific messages       |
| `ePerformance`     | Suboptimal usage            |
| `eValidation`      | API misuse / spec violation |

### 3. setup debug callback

```cpp
VKAPI_ATTR Bool32 VKAPI_CALL debugCallback(const DebugUtilsMessageSeverityFlagBitsEXT severity, const DebugUtilsMessageTypeFlagsEXT type, const DebugUtilsMessengerCallbackDataEXT* pCallbackData, void*) {
    if (severity == DebugUtilsMessageSeverityFlagBitsEXT::eError || severity == DebugUtilsMessageSeverityFlagBitsEXT::eWarning) {
        std::cerr << "validation layer: type " << to_string(type) << " msg: " << pCallbackData->pMessage << std::endl;
    }
    return False;
}
```

---

## Create Surface RAII

A Vulkan surface is the bridge between Vulkan and the window system.

This function does three logically separate things:

- Configures GLFW window behavior
- Creates and manages a native window
- Creates a Vulkan surface bound to that window

```cpp
void VulkanEngine::create_surface_raii() {
    glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
    glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
    this->window = std::shared_ptr<GLFWwindow>(glfwCreateWindow(1920, 1080, "Vulkan Engine Window", nullptr, nullptr), [](GLFWwindow* ptr) {
        glfwDestroyWindow(ptr);
        glfwTerminate();
    });
    glfwSetWindowUserPointer(this->window.get(), this);
    glfwSetFramebufferSizeCallback(this->window.get(), framebufferResizeCallback);
    VkSurfaceKHR _surface;
    if (glfwCreateWindowSurface(*this->instance, this->window.get(), nullptr, &_surface) != 0) throw std::runtime_error("failed to create window surface!");
    this->surface = raii::SurfaceKHR(this->instance, _surface);
}
```

### 1. configure glfw window behavior

| GLFW Window Hint  | Values                   | Notes                                                                                                   |
|-------------------|--------------------------|---------------------------------------------------------------------------------------------------------|
| `GLFW_CLIENT_API` | `GLFW_NO_API`            | Tells GLFW: “Do NOT create an OpenGL / OpenGL ES context”. This is <ins>**mandatory**</ins> for Vulkan. |
| `GLFW_RESIZABLE`  | `GLFW_TRUE`/`GLFW_FALSE` | Allows the window to be resized by the user                                                             |                                                                                                         |
|                   |                          |                                                                                                         |

```cpp
glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);
this->window = std::shared_ptr<GLFWwindow>(glfwCreateWindow(1920, 1080, "Vulkan Engine Window", nullptr, nullptr), [this](GLFWwindow* ptr) {
    glfwDestroyWindow(this->window.get());
    glfwTerminate();
    this->window.reset();
});
glfwSetWindowUserPointer(this->window.get(), this);
glfwSetFramebufferSizeCallback(this->window.get(), framebufferResizeCallback);
```

### 2. framebuffer resize callback

Registers a function called when the framebuffer size changes

:::important

- Window size ≠ Framebuffer size
- On HiDPI displays, framebuffer can be larger
  :::

```cpp
static void framebufferResizeCallback(GLFWwindow* window, int width, int height) {
    auto app                = reinterpret_cast<VulkanEngine*>(glfwGetWindowUserPointer(window));
    app->framebufferResized = true;
}
```

### 3. create Vulkan surface

#### What happens here

GLFW internally:

- Detects platform (Win32 / X11 / Wayland / Cocoa)
- Calls the correct Vulkan function:
- `vkCreateWin32SurfaceKHR`
- `vkCreateXcbSurfaceKHR`
- etc.

```cpp
VkSurfaceKHR _surface;
if (glfwCreateWindowSurface(*this->instance, this->window.get(), nullptr, &_surface) != 0) throw std::runtime_error("failed to create window surface!");
this->surface = raii::SurfaceKHR(this->instance, _surface);
```

---

## Pick Physical Device RAII

In Vulkan:

- Physical device = actual GPU hardware (or software implementation)
- You are not creating anything yet
- You are only deciding: “Which GPU is capable of running my engine?”

```cpp
void VulkanEngine::pick_physical_device_raii() {
    std::vector<raii::PhysicalDevice> devices = instance.enumeratePhysicalDevices();
    const auto devIter                        = std::ranges::find_if(devices, [&](auto const& device) {
        // Check if the device supports the Vulkan 1.3 API version
        const bool supportsVulkan1_3 = device.getProperties().apiVersion >= VK_API_VERSION_1_3;

        // Check if any of the queue families support graphics operations
        auto queueFamilies          = device.getQueueFamilyProperties();
        const bool supportsGraphics = std::ranges::any_of(queueFamilies, [](auto const& qfp) { return !!(qfp.queueFlags & QueueFlagBits::eGraphics); });

        // Check if all required device extensions are available
        auto availableDeviceExtensions = device.enumerateDeviceExtensionProperties();
        const bool supportsAllRequiredExtensions =
            std::ranges::all_of(this->info.required_device_extensions, [&availableDeviceExtensions](auto const& requiredDeviceExtension) { return std::ranges::any_of(availableDeviceExtensions, [requiredDeviceExtension](auto const& availableDeviceExtension) { return strcmp(availableDeviceExtension.extensionName, requiredDeviceExtension) == 0; }); });

        auto features = device.template getFeatures2<PhysicalDeviceFeatures2, PhysicalDeviceVulkan11Features, PhysicalDeviceVulkan13Features, PhysicalDeviceExtendedDynamicStateFeaturesEXT>();
        const bool supportsRequiredFeatures =
            features.template get<PhysicalDeviceVulkan11Features>().shaderDrawParameters && features.template get<PhysicalDeviceVulkan13Features>().synchronization2 && features.template get<PhysicalDeviceVulkan13Features>().dynamicRendering && features.template get<PhysicalDeviceExtendedDynamicStateFeaturesEXT>().extendedDynamicState;

        return supportsVulkan1_3 && supportsGraphics && supportsAllRequiredExtensions && supportsRequiredFeatures;
    });
    if (devIter != devices.end()) {
        this->physical_device = *devIter;
    } else {
        throw std::runtime_error("failed to find a suitable GPU!");
    }
}
```

### 1. enumerate physical devices

#### What this does

Asks the Vulkan loader: “Give me all GPUs visible to this Vulkan instance.”

This may include:

- Discrete GPU (RTX / RX)
- Integrated GPU (Intel / AMD iGPU)
- Software rasterizer (llvmpipe)
- Remote / virtual GPUs

```cpp
std::vector<raii::PhysicalDevice> devices = instance.enumeratePhysicalDevices();
```

### 2. check physical device suitability

#### What this means

You iterate over all GPUs and return the first one that satisfies your requirements.

:::caution

- Device priority is implicit
- The enumeration order is driver-defined
- Many engines later score devices instead of stopping at the first match
  :::

```cpp
const auto devIter                        = std::ranges::find_if(devices, [&](auto const& device) {
    // Check if the device supports the Vulkan 1.3 API version
    const bool supportsVulkan1_3 = device.getProperties().apiVersion >= VK_API_VERSION_1_3;

    // Check if any of the queue families support graphics operations
    auto queueFamilies          = device.getQueueFamilyProperties();
    const bool supportsGraphics = std::ranges::any_of(queueFamilies, [](auto const& qfp) { return !!(qfp.queueFlags & QueueFlagBits::eGraphics); });

    // Check if all required device extensions are available
    auto availableDeviceExtensions = device.enumerateDeviceExtensionProperties();
    const bool supportsAllRequiredExtensions =
        std::ranges::all_of(this->info.required_device_extensions, [&availableDeviceExtensions](auto const& requiredDeviceExtension) { return std::ranges::any_of(availableDeviceExtensions, [requiredDeviceExtension](auto const& availableDeviceExtension) { return strcmp(availableDeviceExtension.extensionName, requiredDeviceExtension) == 0; }); });

    auto features = device.template getFeatures2<PhysicalDeviceFeatures2, PhysicalDeviceVulkan11Features, PhysicalDeviceVulkan13Features, PhysicalDeviceExtendedDynamicStateFeaturesEXT>();
    const bool supportsRequiredFeatures =
        features.template get<PhysicalDeviceVulkan11Features>().shaderDrawParameters && features.template get<PhysicalDeviceVulkan13Features>().synchronization2 && features.template get<PhysicalDeviceVulkan13Features>().dynamicRendering && features.template get<PhysicalDeviceExtendedDynamicStateFeaturesEXT>().extendedDynamicState;

    return supportsVulkan1_3 && supportsGraphics && supportsAllRequiredExtensions && supportsRequiredFeatures;
});
```

### 3. check Vulkan API version support

```cpp
// Check if the device supports the Vulkan 1.3 API version
const bool supportsVulkan1_3 = device.getProperties().apiVersion >= VK_API_VERSION_1_3;
```

### 4. check graphics queue family support

| Queue Flags       | Notes                                                     |
|-------------------|-----------------------------------------------------------|
| `eGraphics`       | To render anything, you need at least one graphics queue. |
| `eCompute`        | :spoiler[(TODO: Fill here)]                               |
| `eTransfer`       | :spoiler[(TODO: Fill here)]                               |
| `eSparseBinding`  | :spoiler[(TODO: Fill here)]                               |
| `eProtected`      | :spoiler[(TODO: Fill here)]                               |
| `eVideoDecodeKHR` | :spoiler[(TODO: Fill here)]                               |
| `eVideoEncodeKHR` | :spoiler[(TODO: Fill here)]                               |
| `eOpticalFlowNV`  | :spoiler[(TODO: Fill here)]                               |
| `eDataGraphARM`   | :spoiler[(TODO: Fill here)]                               |

```cpp
// Check if any of the queue families support graphics operations
auto queueFamilies          = device.getQueueFamilyProperties();
const bool supportsGraphics = std::ranges::any_of(queueFamilies, [](auto const& qfp) { return !!(qfp.queueFlags & QueueFlagBits::eGraphics); });
```

### 5. check device extension support

```cpp
// Check if all required device extensions are available
auto availableDeviceExtensions = device.enumerateDeviceExtensionProperties();
const bool supportsAllRequiredExtensions =
    std::ranges::all_of(this->info.required_device_extensions, [&availableDeviceExtensions](auto const& requiredDeviceExtension) { return std::ranges::any_of(availableDeviceExtensions, [requiredDeviceExtension](auto const& availableDeviceExtension) { return strcmp(availableDeviceExtension.extensionName, requiredDeviceExtension) == 0; }); });
```

### 6. check required features support

```cpp
auto features = device.template getFeatures2<PhysicalDeviceFeatures2, PhysicalDeviceVulkan11Features, PhysicalDeviceVulkan13Features, PhysicalDeviceExtendedDynamicStateFeaturesEXT>();
const bool supportsRequiredFeatures =
    features.template get<PhysicalDeviceVulkan11Features>().shaderDrawParameters && features.template get<PhysicalDeviceVulkan13Features>().synchronization2 && features.template get<PhysicalDeviceVulkan13Features>().dynamicRendering && features.template get<PhysicalDeviceExtendedDynamicStateFeaturesEXT>().extendedDynamicState;
```

#### Difference between getFeatures and getFeatures2

Short answer (intuition first)

- getFeatures(): → Old, flat, limited, legacy-style feature query
- getFeatures2(): → Modern, extensible, future-proof feature query

In modern Vulkan (≥ 1.1, especially 1.3 / 1.4),
👉 you should almost always use getFeatures2().

---

## Create Logical Device RAII

A physical device is “a GPU”.

A logical device is “your connection to that GPU”, with specific:

- queues you will use
- features you want enabled
- device extensions you need enabled

This function does four things:

1. Find a queue family that supports graphics + present
2. Build a feature enable chain (pNext)
3. Create the logical device
4. Retrieve a queue handle from that device

```cpp
void VulkanEngine::create_logical_device_raii() {
    std::vector<QueueFamilyProperties> queueFamilyProperties = this->physical_device.getQueueFamilyProperties();

    // get the first index into queueFamilyProperties which supports both graphics and present
    for (uint32_t qfpIndex = 0; qfpIndex < queueFamilyProperties.size(); qfpIndex++) {
        if (queueFamilyProperties[qfpIndex].queueFlags & QueueFlagBits::eGraphics && this->physical_device.getSurfaceSupportKHR(qfpIndex, *this->surface)) {
            // found a queue family that supports both graphics and present
            this->queueIndex = qfpIndex;
            break;
        }
    }
    if (this->queueIndex == ~0) throw std::runtime_error("Could not find a queue for graphics and present -> terminating");

    // query for Vulkan 1.3 features
    StructureChain<PhysicalDeviceFeatures2, PhysicalDeviceVulkan11Features, PhysicalDeviceVulkan13Features, PhysicalDeviceExtendedDynamicStateFeaturesEXT> featureChain = {
        {}, // vk::PhysicalDeviceFeatures2
        {.shaderDrawParameters = true}, // vk::PhysicalDeviceVulkan11Features
        {.synchronization2 = true, .dynamicRendering = true}, // vk::PhysicalDeviceVulkan13Features
        {.extendedDynamicState = true}, // vk::PhysicalDeviceExtendedDynamicStateFeaturesEXT
    };

    // create a Device
    float queuePriority = 0.5f;
    DeviceQueueCreateInfo deviceQueueCreateInfo{
        .queueFamilyIndex = this->queueIndex,
        .queueCount       = 1,
        .pQueuePriorities = &queuePriority,
    };
    DeviceCreateInfo deviceCreateInfo{
        .pNext                   = &featureChain.get<PhysicalDeviceFeatures2>(),
        .queueCreateInfoCount    = 1,
        .pQueueCreateInfos       = &deviceQueueCreateInfo,
        .enabledExtensionCount   = static_cast<uint32_t>(this->info.required_device_extensions.size()),
        .ppEnabledExtensionNames = this->info.required_device_extensions.data(),
    };

    this->device = raii::Device(this->physical_device, deviceCreateInfo);
    this->queue  = raii::Queue(this->device, this->queueIndex, 0);
}
```

### 1. find graphics + present queue family

Find a queue family that supports both graphics and presentation.

:::Important

- Some GPUs/drivers expose a graphics queue that cannot present to a given surface.
- Present support is surface-dependent, not just device-dependent.
  :::

```cpp
std::vector<QueueFamilyProperties> queueFamilyProperties = this->physical_device.getQueueFamilyProperties();

// get the first index into queueFamilyProperties which supports both graphics and present
for (uint32_t qfpIndex = 0; qfpIndex < queueFamilyProperties.size(); qfpIndex++) {
    if (queueFamilyProperties[qfpIndex].queueFlags & QueueFlagBits::eGraphics && this->physical_device.getSurfaceSupportKHR(qfpIndex, *this->surface)) {
        // found a queue family that supports both graphics and present
        this->queueIndex = qfpIndex;
        break;
    }
}
if (this->queueIndex == ~0) throw std::runtime_error("Could not find a queue for graphics and present -> terminating");
```

### 2. enabling device features

| Device Features                                 | Notes                                                                                                                                                                                                                            |
|-------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `PhysicalDeviceFeatures2`                       | The Vulkan 1.0 feature set. You left it {} (all false). That’s fine if you don’t need any Vulkan 1.0-only features.                                                                                                              |
| `PhysicalDeviceVulkan11Features`                | `shaderDrawParameters = true`: This enables shader built-ins like gl_DrawID / gl_BaseInstance (depending on stage/API), used heavily for modern instancing and multi-draw style rendering.                                       |
| `PhysicalDeviceVulkan13Features`                | `synchronization2 = true`: Enables the modern synchronization API (clearer and less error-prone). <br/>  `dynamicRendering = true`: Enables rendering without classic render passes/framebuffers (very modern, very common now). |
| `PhysicalDeviceExtendedDynamicStateFeaturesEXT` | `extendedDynamicState = true`: Allows more pipeline state to be dynamic (reduces pipeline count, makes engine more flexible).                                                                                                    |

:::Important
You must only enable features that you already confirmed are supported (you did that earlier in
`pick_physical_device_raii()`).
:::

```cpp
StructureChain<PhysicalDeviceFeatures2, PhysicalDeviceVulkan11Features, PhysicalDeviceVulkan13Features, PhysicalDeviceExtendedDynamicStateFeaturesEXT> featureChain = {
    {}, // vk::PhysicalDeviceFeatures2
    {.shaderDrawParameters = true}, // vk::PhysicalDeviceVulkan11Features
    {.synchronization2 = true, .dynamicRendering = true}, // vk::PhysicalDeviceVulkan13Features
    {.extendedDynamicState = true}, // vk::PhysicalDeviceExtendedDynamicStateFeaturesEXT
};
```

### 3. create queue info

When creating a device, you must specify what queues you want from each family.

- `queueFamilyIndex`: which family
- `queueCount`: how many queues from that family
- `pQueuePriorities`: array of floats in `[0,1]`, one per queue

#### What priority really does

It is only meaningful if:

- multiple queues compete for scheduling
- the driver actually uses this hint
- Many drivers mostly ignore it, but it must be provided.

```cpp
float queuePriority = 0.5f;
DeviceQueueCreateInfo deviceQueueCreateInfo{
    .queueFamilyIndex = this->queueIndex,
    .queueCount       = 1,
    .pQueuePriorities = &queuePriority,
};
```

### 4. create device create info

#### `.pNext`

This points Vulkan to the feature chain root, which links to:

- Vulkan 1.1 features
- Vulkan 1.3 features
- EXT features

So you’re telling Vulkan: “Create my logical device with these features enabled”.

```cpp
DeviceCreateInfo deviceCreateInfo{
    .pNext                   = &featureChain.get<PhysicalDeviceFeatures2>(),
    .queueCreateInfoCount    = 1,
    .pQueueCreateInfos       = &deviceQueueCreateInfo,
    .enabledExtensionCount   = static_cast<uint32_t>(this->info.required_device_extensions.size()),
    .ppEnabledExtensionNames = this->info.required_device_extensions.data(),
};
```

---

## Create Swapchain RAII

A swapchain is a queue of images owned by the presentation engine (the “screen system”).
Your renderer:

1. acquires one image from the swapchain,
2. renders into it,
3. presents it to the window.

So swapchain creation is basically: “Negotiate with the OS/window system: format, size, number of images, present mode,
and usage.”

```cpp
void VulkanEngine::create_swapchain_raii() {
    auto surfaceCapabilities = this->physical_device.getSurfaceCapabilitiesKHR(*this->surface);

    int width, height;
    glfwGetFramebufferSize(window.get(), &width, &height);
    this->swapchain_extent = surfaceCapabilities.currentExtent.width == 0xFFFFFFFF ? Extent2D{
                                                                                         std::clamp<uint32_t>(width, surfaceCapabilities.minImageExtent.width, surfaceCapabilities.maxImageExtent.width),
                                                                                         std::clamp<uint32_t>(height, surfaceCapabilities.minImageExtent.height, surfaceCapabilities.maxImageExtent.height),
                                                                                     }:surfaceCapabilities.currentExtent;

    const std::vector<SurfaceFormatKHR>& availableFormats = this->physical_device.getSurfaceFormatsKHR(*this->surface);
    const auto formatIt                                   = std::ranges::find_if(availableFormats, [](const auto& format) { return format.format == Format::eB8G8R8A8Srgb && format.colorSpace == ColorSpaceKHR::eSrgbNonlinear; });
    this->swapchain_surface_format                        = formatIt != availableFormats.end() ? *formatIt : availableFormats[0];

    auto minImageCount = std::max(3u, surfaceCapabilities.minImageCount);
    if (0 < surfaceCapabilities.maxImageCount && surfaceCapabilities.maxImageCount < minImageCount) minImageCount = surfaceCapabilities.maxImageCount;

    const SwapchainCreateInfoKHR swapChainCreateInfo{.surface = *this->surface,
        .minImageCount                                        = minImageCount,
        .imageFormat                                          = this->swapchain_surface_format.format,
        .imageColorSpace                                      = this->swapchain_surface_format.colorSpace,
        .imageExtent                                          = this->swapchain_extent,
        .imageArrayLayers                                     = 1,
        .imageUsage                                           = ImageUsageFlagBits::eColorAttachment,
        .imageSharingMode                                     = SharingMode::eExclusive,
        .preTransform                                         = surfaceCapabilities.currentTransform,
        .compositeAlpha                                       = CompositeAlphaFlagBitsKHR::eOpaque,
        .presentMode                                          = std::ranges::any_of(this->physical_device.getSurfacePresentModesKHR(*this->surface), [](const PresentModeKHR value) { return PresentModeKHR::eMailbox == value; }) ? PresentModeKHR::eMailbox : PresentModeKHR::eFifo,
        .clipped                                              = true};

    this->swapchain        = raii::SwapchainKHR(device, swapChainCreateInfo);
    this->swapchain_images = this->swapchain.getImages();
}
```

### 1. query surface capabilities

This returns `vk::SurfaceCapabilitiesKHR`, which tells you what the surface supports, such as:

- `minImageCount`, `maxImageCount`: Limits on swapchain image count.
- `currentExtent`: The surface’s “preferred” or fixed resolution.
- `minImageExtent`, `maxImageExtent`: Allowed extent range (if extent is flexible).
- `currentTransform`: Whether the surface applies rotation/transforms (mobile can rotate).
- supported usage flags (in other fields / related queries)

```cpp
auto surfaceCapabilities = this->physical_device.getSurfaceCapabilitiesKHR(*this->surface);
```

### 2. get framebuffer size from GLFW

This gets the actual pixel size of the framebuffer, not the logical window size.
On HiDPI screens, framebuffer size can be larger than window size.

```cpp
int width, height;
glfwGetFramebufferSize(window.get(), &width, &height);
```

### 3. determine swapchain extent

The Vulkan rule is:

- If `currentExtent.width != UINT32_MAX`: the surface has a fixed extent, you must use `currentExtent`.
- If `currentExtent.width == UINT32_MAX`: you choose the extent, clamped to [`minImageExtent`, `maxImageExtent`].

```cpp
this->swapchain_extent = surfaceCapabilities.currentExtent.width == 0xFFFFFFFF ? Extent2D{
                                                                                     std::clamp<uint32_t>(width, surfaceCapabilities.minImageExtent.width, surfaceCapabilities.maxImageExtent.width),
                                                                                     std::clamp<uint32_t>(height, surfaceCapabilities.minImageExtent.height, surfaceCapabilities.maxImageExtent.height),
                                                                                 }:surfaceCapabilities.currentExtent;
```

### 4. choose swapchain surface format

#### What a “surface format” means

It’s a pair:

- `format`: pixel layout (e.g. BGRA8)
- `colorSpace`: how the presentation engine interprets it (often sRGB nonlinear)

#### Your preference

`eB8G8R8A8Srgb` + `eSrgbNonlinear`

This is a very common “good default” because:

it supports correct gamma / sRGB output

it is widely supported

#### Fallback

If not available, you take the first supported format. That is typical.

```cpp
const std::vector<SurfaceFormatKHR>& availableFormats = this->physical_device.getSurfaceFormatsKHR(*this->surface);
const auto formatIt                                   = std::ranges::find_if(availableFormats, [](const auto& format) { return format.format == Format::eB8G8R8A8Srgb && format.colorSpace == ColorSpaceKHR::eSrgbNonlinear; });
this->swapchain_surface_format                        = formatIt != availableFormats.end() ? *formatIt : availableFormats[0];
```

### 5. determine swapchain image count (triple buffering)

#### What this does

- You want at least 3 images (triple buffering).
- But the surface might require at least some minimum.
- And it might cap the maximum.

```cpp
auto minImageCount = std::max(3u, surfaceCapabilities.minImageCount);
if (0 < surfaceCapabilities.maxImageCount && surfaceCapabilities.maxImageCount < minImageCount) minImageCount = surfaceCapabilities.maxImageCount;
```

### 6. build SwapchainCreateInfoKHR

- `surface`: The window surface you’re presenting to.

- `minImageCount` How many images in the swapchain queue. More images can reduce stalls.

- `imageFormat` and `imageColorSpace`: Must match one of the supported surface formats you queried.

- `imageExtent`: Resolution of swapchain images, usually matches the window framebuffer size.

- `imageArrayLayers = 1`: 1 for normal 2D rendering. Use >1 for stereoscopic / VR arrays.

- `imageUsage = eColorAttachment`: Means you will render directly into swapchain images as color attachments.

    - Common additions you might want later:
        - `eTransferDst` if you plan to blit/copy into swapchain images
        - `eStorage` if you plan compute writes (rare for swapchain)

- `imageSharingMode = eExclusive`: Best performance when a single queue family owns the images.

    - If your graphics queue family differs from present queue family, you must use:

        - `eConcurrent` with both family indices
        - (Your engine currently uses a single graphics+present family, so eExclusive is correct.)

- `preTransform = currentTransform`: If the surface wants a transform (rotation), you accept it. Some engines prefer
  eIdentity if supported, but your choice is safe.

- `compositeAlpha = eOpaque`: How alpha blending works with the window system. eOpaque is usually supported and
  simplest.

```cpp
const SwapchainCreateInfoKHR swapChainCreateInfo{.surface = *this->surface,
    .minImageCount                                        = minImageCount,
    .imageFormat                                          = this->swapchain_surface_format.format,
    .imageColorSpace                                      = this->swapchain_surface_format.colorSpace,
    .imageExtent                                          = this->swapchain_extent,
    .imageArrayLayers                                     = 1,
    .imageUsage                                           = ImageUsageFlagBits::eColorAttachment,
    .imageSharingMode                                     = SharingMode::eExclusive,
    .preTransform                                         = surfaceCapabilities.currentTransform,
    .compositeAlpha                                       = CompositeAlphaFlagBitsKHR::eOpaque,
    .presentMode                                          = std::ranges::any_of(this->physical_device.getSurfacePresentModesKHR(*this->surface), [](const PresentModeKHR value) { return PresentModeKHR::eMailbox == value; }) ? PresentModeKHR::eMailbox : PresentModeKHR::eFifo,
    .clipped                                              = true};

this->swapchain        = raii::SwapchainKHR(device, swapChainCreateInfo);
this->swapchain_images = this->swapchain.getImages();
```

---

## Create Image Views RAII

A swapchain image (`VkImage`) is just raw image memory owned by the presentation engine.

You cannot:

- bind it as a framebuffer attachment
- sample from it
- write to it in a pipeline

…until you create an image view.

So this function’s job is: “Create a view for each swapchain image so shaders and render operations can access them.”

#### What an image view actually is (important concept)

Think of:

- `VkImage`: raw storage (like a buffer of pixels)
- `VkImageView`: interpretation of that storage

An image view defines:

- how many dimensions (1D / 2D / 3D)
- which format
- which mip levels
- which array layers
- which aspects (color / depth / stencil)

In Vulkan, you almost always use image views, not images directly.

```cpp
void VulkanEngine::create_swapchain_image_views_raii() {
    ImageViewCreateInfo imageViewCreateInfo{
        .viewType         = ImageViewType::e2D,
        .format           = this->swapchain_surface_format.format,
        .subresourceRange = {ImageAspectFlagBits::eColor, 0, 1, 0, 1},
    };
    for (const auto& image : this->swapchain_images) {
        imageViewCreateInfo.image = image;
        this->swapchain_image_views.emplace_back(device, imageViewCreateInfo);
    }
}
```

### 1. build image view

#### `viewType = e2D`: This tells Vulkan how to interpret the image.

- Swapchain images are 2D images
- So `e2D` is always correct here
- Other possible values:
    - `e2DArray` (stereo, VR)
    - `eCube` (cubemaps)
    - `e3D` (volume textures)

#### `format`

- This must:
    - match the swapchain image format
    - be compatible with the image
- For swapchain images:
    - You must use exactly the same format you selected during swapchain creation
- If this doesn’t match:
    - Image view creation fails
    - Or validation layers complain

#### `subresourceRange`

This is one of the most important parts.

`subresourceRange` tells Vulkan which part of the image this view exposes.

##### What is a “subresource”?

A Vulkan image can have:

- multiple mip levels
- multiple array layers
- multiple aspects (color / depth / stencil)

#### Aspect mask

This says:

- This image view accesses the color aspect

Correct because:

- Swapchain images are color images
- They are not depth/stencil images

#### Base mip level & level count

This means:

- Use mip level 0
- Only one mip level exists

Swapchain images never have mipmaps.

#### Base array layer & layer count

This means:

- Use the first array layer
- Only one layer exists

Again, swapchain images are single-layer.

:::Important

#### Lifetime rules (very important)

The lifetime dependency is:

```cpp
VkImage (swapchain-owned)
    ↓
VkImageView (you created)
```

Rules:

- Image views must be destroyed before the swapchain
- Swapchain must exist as long as image views exist

Your RAII ordering must reflect this.

#### Why reuse ImageViewCreateInfo is fine

You reuse the same `ImageViewCreateInfo` object and only change `.image`.
Because all swapchain images share:

- format
- extent
- mip count
- layer count
  :::

```cpp
ImageViewCreateInfo imageViewCreateInfo{
    .viewType         = ImageViewType::e2D,
    .format           = this->swapchain_surface_format.format,
    .subresourceRange = {ImageAspectFlagBits::eColor, 0, 1, 0, 1},
};
```

---

## Create Command Pool RAII

In Vulkan, command buffers do not own their memory.

Instead:

- A command pool owns the memory used to record commands
- Command buffers are allocated from a command pool
- Resetting or destroying a command pool affects all command buffers allocated from it

Mental model:

- Command pool = memory arena
- Command buffers = objects allocated from that arena

This function:

- Specifies how command buffers allocated from this pool can be reset
- Associates the pool with a specific queue family
- Creates the pool using RAII

It does not:

- Allocate command buffers
- Record commands
- Submit commands

#### `queueFamilyIndex`

This tells Vulkan: “All command buffers allocated from this pool will be submitted to queues from this queue family.”

Why this is required?

Vulkan enforces:

- A command pool is tied to one queue family
- Command buffers allocated from it must be submitted to a queue belonging to the same family

Consequence

If you later add:

- a compute-only queue family
- a transfer-only queue family

You must create separate command pools for them.

#### `flags = eResetCommandBuffer`

This flag controls how command buffers can be reset.

With `eResetCommandBuffer`, you are allowed to call: `vkResetCommandBuffer(cmd, 0);` on individual command buffers. This
is essential for per-frame command buffer reuse.

Without this flag

- You cannot reset individual command buffers
- You must reset the entire command pool at once:

| Command Pool Create Flags | Notes                                                               |
|---------------------------|---------------------------------------------------------------------|
| `eTransient`              | Hint that command buffers are short-lived(often ignored by drivers) |
| `eResetCommandBuffer`     | Allow reset for individual command buffers.                         |
| `eProtected`              | Used for protected content paths (rare)                             |

```cpp
void VulkanEngine::create_command_pool_raii() {
    const CommandPoolCreateInfo poolInfo{
        .flags            = CommandPoolCreateFlagBits::eResetCommandBuffer,
        .queueFamilyIndex = queueIndex,
    };
    this->command_pool = raii::CommandPool(device, poolInfo);
}
```

---

## Create Command Buffers RAII

In Vulkan, you do not issue rendering commands directly.

Instead:

- You record commands into a `VkCommandBuffer`
- You submit that command buffer to a queue
- The GPU executes it later

So a command buffer is: A pre-recorded list of GPU commands

#### `commandPool`

A command pool:

- Owns the memory used by command buffers
- Is associated with one queue family
- Controls allocation and reset behavior

:::important

- Command buffers allocated from a pool must be submitted to a queue from the same queue family
- Destroying the pool automatically frees all its command buffers
  :::

#### `level = ePrimary`

Vulkan has two command buffer levels:

- `ePrimary`: Can be submitted directly to a queue
- `eSecondary`: Can only be executed by a primary buffer

You chose primary command buffers, meaning:

- These will be submitted directly with vkQueueSubmit
- This is the most common and simplest approach

Secondary command buffers are used for:

- Multi-threaded recording
- Reusable command sequences

#### `commandBufferCount`

This is very important for frame synchronization.

What “frames in flight” means

In modern Vulkan engines, you usually allow multiple frames to be:

- recorded on CPU
- while previous frames are still executing on GPU

Common values:

- 2 (double buffering)
- 3 (triple buffering)

So this line means: “Allocate one primary command buffer per frame-in-flight.”

```cpp
void VulkanEngine::create_command_buffer_raii() {
    const CommandBufferAllocateInfo allocInfo{
        .commandPool        = this->command_pool,
        .level              = CommandBufferLevel::ePrimary,
        .commandBufferCount = this->info.max_frames_in_flight,
    };
    this->command_buffer = raii::CommandBuffers(this->device, allocInfo);
}
```

---

## Create Graphics Pipeline RAII

A graphics pipeline in Vulkan is a fully compiled GPU state object that defines:

- which shaders run
- how vertices are assembled
- how primitives are rasterized
- how fragments are blended
- how outputs are written

With dynamic rendering, the pipeline:

- does not reference a render pass
- instead declares its attachment formats via PipelineRenderingCreateInfo

```cpp
void VulkanEngine::create_graphics_pipeline_raii() {
    raii::ShaderModule shaderModule = create_shader_module(readFile("shaders/shader1.spv"));

    PipelineShaderStageCreateInfo vertShaderStageInfo{.stage = ShaderStageFlagBits::eVertex, .module = shaderModule, .pName = "vertMain"};
    PipelineShaderStageCreateInfo fragShaderStageInfo{.stage = ShaderStageFlagBits::eFragment, .module = shaderModule, .pName = "fragMain"};
    PipelineShaderStageCreateInfo shaderStages[] = {vertShaderStageInfo, fragShaderStageInfo};

    PipelineVertexInputStateCreateInfo vertexInputInfo;
    PipelineInputAssemblyStateCreateInfo inputAssembly{.topology = PrimitiveTopology::eTriangleList};
    PipelineViewportStateCreateInfo viewportState{.viewportCount = 1, .scissorCount = 1};

    PipelineRasterizationStateCreateInfo rasterizer{.depthClampEnable = False, .rasterizerDiscardEnable = False, .polygonMode = PolygonMode::eFill, .cullMode = CullModeFlagBits::eBack, .frontFace = FrontFace::eClockwise, .depthBiasEnable = False, .depthBiasSlopeFactor = 1.0f, .lineWidth = 1.0f};

    PipelineMultisampleStateCreateInfo multisampling{.rasterizationSamples = SampleCountFlagBits::e1, .sampleShadingEnable = False};

    PipelineColorBlendAttachmentState colorBlendAttachment{.blendEnable = False, .colorWriteMask = ColorComponentFlagBits::eR | ColorComponentFlagBits::eG | ColorComponentFlagBits::eB | ColorComponentFlagBits::eA};

    PipelineColorBlendStateCreateInfo colorBlending{.logicOpEnable = False, .logicOp = LogicOp::eCopy, .attachmentCount = 1, .pAttachments = &colorBlendAttachment};

    std::vector dynamicStates = {DynamicState::eViewport, DynamicState::eScissor};
    PipelineDynamicStateCreateInfo dynamicState{.dynamicStateCount = static_cast<uint32_t>(dynamicStates.size()), .pDynamicStates = dynamicStates.data()};

    PipelineLayoutCreateInfo pipelineLayoutInfo{.setLayoutCount = 0, .pushConstantRangeCount = 0};

    this->pipeline_layout = raii::PipelineLayout(device, pipelineLayoutInfo);

    StructureChain<GraphicsPipelineCreateInfo, PipelineRenderingCreateInfo> pipelineCreateInfoChain = {{
                                                                                                           .stageCount          = 2,
                                                                                                           .pStages             = shaderStages,
                                                                                                           .pVertexInputState   = &vertexInputInfo,
                                                                                                           .pInputAssemblyState = &inputAssembly,
                                                                                                           .pViewportState      = &viewportState,
                                                                                                           .pRasterizationState = &rasterizer,
                                                                                                           .pMultisampleState   = &multisampling,
                                                                                                           .pColorBlendState    = &colorBlending,
                                                                                                           .pDynamicState       = &dynamicState,
                                                                                                           .layout              = this->pipeline_layout,
                                                                                                           .renderPass          = nullptr,
                                                                                                       },
        {
            .colorAttachmentCount    = 1,
            .pColorAttachmentFormats = &this->swapchain_surface_format.format,
        }};

    this->graphics_pipeline = raii::Pipeline(device, nullptr, pipelineCreateInfoChain.get<GraphicsPipelineCreateInfo>());
}
```

### shader module creation

What this does

- Loads a SPIR-V binary (.spv)
- Creates a VkShaderModule
- Wrapped in RAII

You use one shader module for both vertex and fragment stages later:

This is valid only if: the SPIR-V contains both entry points

- `vertMain`
- `fragMain`

Entry point rule: The entry point must exactly match the name in SPIR-V, including case.

```cpp
raii::ShaderModule VulkanEngine::create_shader_module(const std::vector<char>& code) const {
    const ShaderModuleCreateInfo createInfo{
        .codeSize = code.size() * sizeof(char),
        .pCode    = reinterpret_cast<const uint32_t*>(code.data()),
    };
    raii::ShaderModule shaderModule{this->device, createInfo};
    return shaderModule;
}

raii::ShaderModule shaderModule = create_shader_module(readFile("shaders/shader1.spv"));
PipelineShaderStageCreateInfo vertShaderStageInfo{.stage = ShaderStageFlagBits::eVertex, .module = shaderModule, .pName = "vertMain"};
PipelineShaderStageCreateInfo fragShaderStageInfo{.stage = ShaderStageFlagBits::eFragment, .module = shaderModule, .pName = "fragMain"};
PipelineShaderStageCreateInfo shaderStages[] = {vertShaderStageInfo, fragShaderStageInfo};
```

### vertex input state

This is empty, meaning:

- No vertex bindings
- No vertex attributes

```cpp
PipelineVertexInputStateCreateInfo vertexInputInfo;
```

### input assembly state

What this means

- Each group of 3 vertices → one triangle
- No adjacency
- No primitive restart (not enabled here)

```cpp
PipelineInputAssemblyStateCreateInfo inputAssembly{.topology = PrimitiveTopology::eTriangleList};
```

### viewport & scissor state (dynamic)

Even though viewport and scissor are dynamic, Vulkan still requires:

- how many viewports/scissors exist

Actual values will be set later with:

- `vkCmdSetViewport`
- `vkCmdSetScissor`

```cpp
PipelineViewportStateCreateInfo viewportState{.viewportCount = 1, .scissorCount = 1};
```

### rasterization state

| Field                     | Meaning                           |
|---------------------------|-----------------------------------|
| `polygonMode`             | Fill triangles (not wireframe)    |
| `cullMode`                | Cull back-facing triangles        |
| `frontFace`               | Clockwise winding = front face    |
| `rasterizerDiscardEnable` | Disabled → geometry is rasterized |

:::Important
Most Vulkan tutorials use FrontFace::eCounterClockwise.
:::

```cpp
PipelineRasterizationStateCreateInfo rasterizer{
    .depthClampEnable        = False,
    .rasterizerDiscardEnable = False,
    .polygonMode             = PolygonMode::eFill,
    .cullMode                = CullModeFlagBits::eBack,
    .frontFace               = FrontFace::eClockwise,
    .depthBiasEnable         = False,
    .depthBiasSlopeFactor    = 1.0f,
    .lineWidth               = 1.0f,
};
```

### multisample state

This means:

- No MSAA
- One sample per pixel

This is the simplest and most common starting point.

```cpp
PipelineMultisampleStateCreateInfo multisampling{
    .rasterizationSamples = SampleCountFlagBits::e1,
    .sampleShadingEnable  = False,
};
```

### color blend attachment

What this means

- No blending
- Fragment shader output overwrites the color attachment
- Writes RGBA channels

This is correct for opaque rendering.

```cpp
PipelineColorBlendAttachmentState colorBlendAttachment{
    .blendEnable    = False,
    .colorWriteMask = ColorComponentFlagBits::eR | ColorComponentFlagBits::eG | ColorComponentFlagBits::eB | ColorComponentFlagBits::eA,
};
```

### color blend state

This defines blending per attachment.

Since dynamic rendering uses one color attachment, this matches correctly.

```cpp
PipelineColorBlendStateCreateInfo colorBlending{
    .logicOpEnable   = False,
    .logicOp         = LogicOp::eCopy,
    .attachmentCount = 1,
    .pAttachments    = &colorBlendAttachment,
};
```

### dynamic state

Why dynamic state matters

This tells Vulkan: “Viewport and scissor will be provided at command recording time.”

This avoids pipeline recreation on resize.

```cpp
std::vector dynamicStates = {DynamicState::eViewport, DynamicState::eScissor};
PipelineDynamicStateCreateInfo dynamicState{
    .dynamicStateCount = static_cast<uint32_t>(dynamicStates.size()),
    .pDynamicStates    = dynamicStates.data(),
};
```

### pipeline layout

Meaning

- No descriptor sets
- No push constants

This is valid only if:

- shaders do not reference descriptors or push constants
- Later, when you add uniforms/textures, this will change.

```cpp
PipelineLayoutCreateInfo pipelineLayoutInfo{.setLayoutCount = 0, .pushConstantRangeCount = 0};

this->pipeline_layout = raii::PipelineLayout(device, pipelineLayoutInfo);
```

### graphics pipeline

:::Important[Key Point]

```cpp
.renderPass = nullptr
```
This is required for dynamic rendering.

:::

```cpp
{
    .colorAttachmentCount    = 1,
    .pColorAttachmentFormats = &this->swapchain_surface_format.format,
}
```

This declares:

- number of color attachments
- their formats

This must match:

- the format used in `vkCmdBeginRendering`
- the swapchain image format


```cpp
StructureChain<GraphicsPipelineCreateInfo, PipelineRenderingCreateInfo> pipelineCreateInfoChain = {{
                                                                                                       .stageCount          = 2,
                                                                                                       .pStages             = shaderStages,
                                                                                                       .pVertexInputState   = &vertexInputInfo,
                                                                                                       .pInputAssemblyState = &inputAssembly,
                                                                                                       .pViewportState      = &viewportState,
                                                                                                       .pRasterizationState = &rasterizer,
                                                                                                       .pMultisampleState   = &multisampling,
                                                                                                       .pColorBlendState    = &colorBlending,
                                                                                                       .pDynamicState       = &dynamicState,
                                                                                                       .layout              = this->pipeline_layout,
                                                                                                       .renderPass          = nullptr,
                                                                                                   },
    {
        .colorAttachmentCount    = 1,
        .pColorAttachmentFormats = &this->swapchain_surface_format.format,
    }};

this->graphics_pipeline = raii::Pipeline(device, nullptr, pipelineCreateInfoChain.get<GraphicsPipelineCreateInfo>());
```

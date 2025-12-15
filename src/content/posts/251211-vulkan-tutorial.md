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

## Pick Physical Device RAII

#### What “picking a physical device” really means

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

## Create Logical Device RAII

#### Goal of this function

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

## Create swapchain RAII



```cpp
void VulkanEngine::create_swapchain_raii() {
    auto surfaceCapabilities = this->physical_device.getSurfaceCapabilitiesKHR(*this->surface);

    int width, height;
    glfwGetFramebufferSize(window.get(), &width, &height);
    this->swapchain_extent = surfaceCapabilities.currentExtent.width == 0xFFFFFFFF ? surfaceCapabilities.currentExtent
                                                                                   : Extent2D{
                                                                                         std::clamp<uint32_t>(width, surfaceCapabilities.minImageExtent.width, surfaceCapabilities.maxImageExtent.width),
                                                                                         std::clamp<uint32_t>(height, surfaceCapabilities.minImageExtent.height, surfaceCapabilities.maxImageExtent.height),
                                                                                     };

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
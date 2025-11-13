---
title: C++ Native Thread Pool
published: 2025-11-13
description: ''
image: ''
tags: [Multithreading]
category: 'C++'
draft: false
lang: ''
---

# Motivation

## A. Problems:
```cpp
std::thread([&]{ do_work(); }).detach();
```
1. **Expensive Overhead**: Creating and destroying threads frequently is costly (milliseconds per thread).
2. **Thread Management**: Hard to coordinate and control many short-lived threads and their tasks.
3. **Resource Exhaustion**: Spawning too many threads can exhaust system resources (CPU, memory, handles).


# Minimal Thread Pools from Scratch

```cpp
#include <condition_variable>
#include <functional>
#include <future>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

class MiniPool {
public:
    explicit MiniPool(const size_t n) {
        for (size_t i = 0; i < n; ++i) {
            workers.emplace_back([this] {
                for (;;) {
                    std::function<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(mtx);
                        cv.wait(lock, [this] { return stopping || !tasks.empty(); });
                        if (stopping && tasks.empty()) return;
                        task = std::move(tasks.front());
                        tasks.pop();
                    }
                    task();
                }
            });
        }
    }

    template <typename F>
    auto enqueue(F f) -> std::future<std::invoke_result_t<F>> {
        using R            = std::invoke_result_t<F>;
        auto t             = std::make_shared<std::packaged_task<R()>>(std::move(f));
        std::future<R> res = t->get_future();
        {
            std::lock_guard<std::mutex> lock(mtx);
            tasks.emplace([t] { (*t)(); });
        }
        cv.notify_one();
        return res;
    }

    ~MiniPool() {
        {
            std::lock_guard<std::mutex> lock(mtx);
            stopping = true;
        }
        cv.notify_all();
        for (auto& w : workers) w.join();
    }

private:
    std::vector<std::thread> workers;
    std::queue<std::function<void()>> tasks;
    std::mutex mtx;
    std::condition_variable cv;
    bool stopping = false;
};
```

# A Modern C++ Thread Pool

```cpp
class ThreadPool {
public:
    explicit ThreadPool(std::size_t thread_count = std::thread::hardware_concurrency()) : stop_(false), active_(0) {
        if (thread_count == 0) {
            thread_count = 1;
        }
        workers_.reserve(thread_count);
        for (std::size_t i = 0; i < thread_count; ++i) {
            workers_.emplace_back([this] { worker_loop(); });
        }
    }

    ThreadPool(const ThreadPool&)            = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;
    ThreadPool(ThreadPool&&)                 = delete;
    ThreadPool& operator=(ThreadPool&&)      = delete;

    ~ThreadPool() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto& t : workers_) {
            if (t.joinable()) {
                t.join();
            }
        }
    }

    template <class F, class... Args>
    auto enqueue(F&& f, Args&&... args) -> std::future<std::invoke_result_t<F, Args...>> {
        using R = std::invoke_result_t<F, Args...>;

        auto task = std::make_shared<std::packaged_task<R()>>(make_task_functor(std::forward<F>(f), std::forward<Args>(args)...));

        std::future<R> fut = task->get_future();

        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (stop_) {
                throw std::runtime_error("enqueue on stopped ThreadPool");
            }
            tasks_.emplace_back([task] { (*task)(); });
        }

        cv_.notify_one();
        return fut;
    }

    void wait_idle() {
        std::unique_lock<std::mutex> lock(mutex_);
        idle_cv_.wait(lock, [this] { return tasks_.empty() && active_ == 0; });
    }

    std::size_t size() const noexcept {
        return workers_.size();
    }

private:
    using Task = std::function<void()>;

    template <class F, class... Args>
    static auto make_task_functor(F&& f, Args&&... args) {
        using Fn  = std::decay_t<F>;
        using Tup = std::tuple<std::decay_t<Args>...>;
        return [fn = Fn(std::forward<F>(f)), tup = Tup(std::forward<Args>(args)...)]() mutable { return std::apply(std::move(fn), std::move(tup)); };
    }

    void worker_loop() {
        for (;;) {
            Task task;
            {
                std::unique_lock<std::mutex> lock(mutex_);
                cv_.wait(lock, [this] { return stop_ || !tasks_.empty(); });
                if (stop_ && tasks_.empty()) {
                    return;
                }
                task = std::move(tasks_.front());
                tasks_.pop_front();
                ++active_;
            }

            task();

            {
                std::lock_guard<std::mutex> lock(mutex_);
                --active_;
                if (tasks_.empty() && active_ == 0) {
                    idle_cv_.notify_all();
                }
            }
        }
    }

    std::vector<std::thread> workers_;
    std::deque<Task> tasks_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::condition_variable idle_cv_;
    bool stop_;
    std::size_t active_;
};
```

# Reference

::github{repo="progschj/ThreadPool"}
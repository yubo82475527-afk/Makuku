# 系统架构

## 文档目的

本文记录 Makuku 当前真实技术结构和新增开发应遵循的边界。它不是一次性重构目标，也不表示仓库已经具备严格的 Controller、Service、Repository 分层。

架构调整应围绕具体业务需求渐进实施。不得为了符合文档而进行与当前需求无关的大规模重构。

## 当前技术栈

- Next.js App Router、React 和 TypeScript
- Tailwind CSS 与仓库内基础 UI 组件
- Supabase PostgreSQL、Storage、RLS 和 RPC
- Next.js Route Handler 提供服务端 API
- Vercel Cron 调用内部后台任务
- Node Test 为主的领域和架构边界测试，Playwright 用于需要浏览器验证的流程

具体版本以 `package.json` 和锁文件为准，不在本文重复固定。

## 当前运行结构

```text
Browser / Feishu H5
        |
        v
Next.js Page + Client Component
        |
        +--> Server Component data read
        |
        +--> /api Route Handler
                  |
                  +--> src/lib domain/data functions
                  |
                  +--> Supabase client / RPC
                  |
                  +--> AI, Feishu, Google and other external services

Vercel Cron / internal script
        |
        v
/api/internal Route Handler --> background job domain logic --> Supabase
```

当前部分 Route Handler 会直接访问 Supabase，部分流程已提取到 `src/lib` 领域模块；`src/lib/data.ts` 和 `src/lib/types.ts` 仍承载多个领域。这些属于现状和待渐进收敛的技术债，不能据此继续无限扩张，也不能假设 Repository 层已经存在。

## 目录职责

### `src/app`

- 页面文件负责路由入口、服务端数据装配和页面级布局
- `src/app/api` 负责 HTTP 输入、鉴权、调用领域逻辑和构造响应
- Route Handler 不应长期承载大段业务规则或复杂多表编排
- 页面不应重复实现已有领域计算

### `src/components`

- 放置可复用 UI、领域组件和页面交互组件
- Client Component 负责浏览器状态和交互，不得直接持有 Service Role 能力
- 详细边界见[组件复用规则](../frontend/component-guidelines.md)

### `src/lib`

- 放置领域规则、数据访问、外部服务适配、鉴权、格式化和共享类型
- 新领域优先创建职责明确的文件，不再默认加入 `data.ts` 或 `types.ts`
- 只有被多个领域稳定共享的能力才进入通用模块
- 不要求为简单查询机械创建 Repository；当逻辑被多个入口复用、包含事务/权限/兼容处理或需要独立测试时，应提取领域函数

### `supabase/migrations`

- 是数据库结构演进的唯一事实来源
- 表、索引、RLS、Policy、触发器和 RPC 通过增量迁移维护
- 详细规则见[数据设计原则](data-principles.md)

### `tests`

- 测试文件按业务能力命名并与变更范围对应
- 现有测试既包括行为测试，也包括读取源码验证边界的架构测试
- 新测试优先验证对用户可观察的行为和关键领域规则；源码字符串断言只用于稳定且重要的架构边界

## 请求与权限边界

### 用户请求

- 需要登录的接口使用统一 Session 校验
- 管理能力使用角色校验，不能仅依赖前端隐藏按钮
- 组织和数据范围权限必须在服务端执行
- Route 输入必须解析、清洗并校验，不能直接把请求体传给数据库

### 内部任务

- `/api/internal` 只是命名空间，不是安全边界
- Vercel Cron 和后台脚本必须验证 `CRON_SECRET`、`INTERNAL_JOB_SECRET` 或明确的管理员 Session
- 内部任务应支持幂等、并发保护、失败重试和可观察的处理结果
- 长任务优先使用持久化 Job/Item 状态，而不是依赖单次请求一直运行

### Supabase Client

- Anon Client 用于受 RLS 约束的访问
- Service Client 只能在服务端使用，并且调用前必须完成应用层授权
- 禁止从 Client Component 直接导入包含 Service Role 的模块
- 服务端返回值必须过滤敏感字段，不能直接透传数据库对象

## Server 与 Client 组件

- 页面默认使用 Server Component，只有需要浏览器事件、状态、设备能力或副作用时才使用 `"use client"`
- Server Component 负责初始数据和权限判断，Client Component 负责交互
- 不应仅为复用一个 Client Hook 把整页改成 Client Component
- Client Component 通过受保护 API 完成写入，不直接信任浏览器传来的角色、组织或审核状态
- 国际化沿用当前 locale 路由和字典机制，不在业务组件内新增平行翻译方案

## 外部服务与 AI

- 外部服务调用集中在适配模块中，页面和 Route 不应散落供应商请求细节
- 密钥只从服务端环境变量读取，错误信息和日志不得泄露密钥或完整敏感响应
- 外部请求应设置超时，并根据业务语义设计重试、幂等和降级
- AI 输出是候选分析结果，不直接覆盖原始事实；需要保留输入依据、模型/配置版本、状态和人工审核链路
- AI 能力必须最终服务异常识别或经营动作，不能只生成无法执行的文字报告

## 渐进式收敛规则

触及现有大型模块时遵循“就地改善，不做无关重写”：

1. 新增能力先判断所属领域和复用入口。
2. 单一 Route 的简单查询可以留在 Route，但不得复制已有业务规则。
3. 被多个 Route、页面或任务使用的规则提取到领域模块。
4. 修改 `data.ts`、`types.ts` 或大型组件时，优先把本次涉及的职责移到领域文件；不要求一次拆完整个文件。
5. 拆分必须保持 API、数据口径和用户行为兼容，并用测试保护。

## 明确禁止

- 不得在浏览器代码中使用 Service Role 或内部任务 Secret
- 不得仅依赖前端进行权限控制
- 不得在 Route、组件和数据库中各复制一套相同业务规则
- 不得把缺少配置、权限失败或数据库错误静默伪装为真实数据
- 不得为了形式统一一次性重构所有 API、数据模块或组件
- 不得把目标架构描述成已经完成的实现

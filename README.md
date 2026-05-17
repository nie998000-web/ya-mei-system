# 雅美靓颜门店管理系统

这是一个 React + Vite + Tailwind CSS + Supabase 开发的美容院连锁门店管理系统。当前版本已经从 `localStorage` 单机版升级为云端版，支持登录、角色权限、多门店数据隔离和云数据库保存。

## 已完成能力

- Supabase 登录系统
- 老板、店长、美容师三种角色
- 多门店字段和数据隔离
- 固定 4 家门店：龙泉1店、龙泉2店、龙泉金龙店、郫县1店
- 顾客、跟进记录、每日复盘、员工数据云端保存
- 保留原有今日看板、未到店激活、顾客档案、跟进记录、每日复盘、员工管理页面
- 90 天高风险顾客醒目标记
- 平板友好的大按钮、大输入框交互

## 角色权限

- 老板：查看和管理全部门店数据
- 店长：查看和管理自己门店的顾客、跟进、复盘、员工数据
- 美容师：只能查看自己负责的顾客和自己的跟进任务，重点登记跟进记录和更新顾客跟进状态
- 今日看板：老板可在“全部门店 / 单个门店”之间切换，店长和美容师自动锁定权限范围
- 未到店激活：顶部按门店统计 30 天、60 天、90 天未到店顾客

更严格的权限由 Supabase Row Level Security 控制，前端也会根据角色隐藏部分新增、编辑、删除按钮。

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 创建环境变量

复制 `.env.example` 为 `.env.local`，填写 Supabase 信息：

```bash
VITE_SUPABASE_URL=https://你的项目编号.supabase.co
VITE_SUPABASE_ANON_KEY=你的Supabase匿名公钥
```

3. 初始化 Supabase 数据库

打开 Supabase 后台：

```text
SQL Editor -> New query -> 粘贴 supabase/schema.sql -> Run
```

4. 创建登录账号

在 Supabase 后台：

```text
Authentication -> Users -> Add user
```

创建老板、店长、美容师账号后，到 `profiles` 表新增对应资料。示例：

```sql
insert into public.profiles (id, name, role, store)
values ('auth.users里的用户id', '王总', '老板', null);

insert into public.profiles (id, name, role, store)
values ('auth.users里的用户id', '龙泉1店店长', '店长', '龙泉1店');

insert into public.profiles (id, name, role, store)
values ('auth.users里的用户id', '林娜', '美容师', '龙泉1店');
```

5. 可选：导入演示数据

如果需要把原型里的 44 位模拟顾客、员工、跟进和复盘样例导入 Supabase，先在本机临时设置服务密钥，再运行脚本：

```bash
export VITE_SUPABASE_URL=https://你的项目编号.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=你的Supabase service_role密钥
npm run seed:demo
```

注意：`SUPABASE_SERVICE_ROLE_KEY` 只能在本机或服务器脚本中使用，不能放进 Vercel 前端环境变量。

6. 启动项目

```bash
npm run dev
```

浏览器打开：

```bash
http://localhost:5173
```

## 项目结构

```text
.
├── .env.example
├── index.html
├── package.json
├── README.md
├── vite.config.js
├── supabase
│   └── schema.sql
└── src
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    ├── data
    │   └── seedData.js
    ├── hooks
    │   ├── useCloudData.js
    │   └── useLocalStorage.js
    ├── lib
    │   ├── mappers.js
    │   └── supabase.js
    └── utils
        ├── date.js
        └── format.js
```

`useLocalStorage.js` 目前保留为历史兼容文件，页面已经不再使用它。

## 部署到 Vercel

1. 把项目上传到 GitHub、GitLab 或 Bitbucket。

2. 打开 Vercel，选择：

```text
Add New -> Project -> Import Git Repository
```

3. 构建配置保持默认：

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

4. 在 Vercel 项目中配置环境变量：

```text
Settings -> Environment Variables
```

添加：

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

5. 部署完成后，把 Vercel 域名加入 Supabase 允许跳转地址：

```text
Supabase -> Authentication -> URL Configuration
Site URL: https://你的项目.vercel.app
Redirect URLs: https://你的项目.vercel.app/**
```

6. 重新部署 Vercel 项目。

## 后续可继续升级

- 给老板增加总部经营大屏
- 增加员工只能查看自己顾客的精细权限
- 增加微信提醒、生日提醒、项目消耗提醒
- 增加批量导入顾客 Excel
- 增加手机小程序端
- 增加审计日志，记录谁修改了顾客和跟进状态

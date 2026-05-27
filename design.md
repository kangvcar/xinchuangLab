# Landing Page Design — 信创Linux AI实时陪练实训平台

## Design Reference

完全复刻 [visitors.now](https://visitors.now/) 的浅色主题设计语言和配色体系，适配到 Linux 教育科技场景。

---

## Color Palette（完全复刻 visitors.now）

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#ffffff` | 页面主背景 |
| `background-subtle` | `#fafafa` | 卡片、浮层背景 |
| `bg-1` | `#fff` | 纯白 |
| `bg-2` | `#f5f5f5` | 代码块、次级背景 |
| `bg-3` | `#f0f0f0` | 分割线、边框 |
| `fg-1` | `#b3b3b3` | 最浅文字 |
| `fg-2` | `#999` | 标签、辅助说明 |
| `fg-3` | `#666` | 正文、描述 |
| `fg-4` | `#181925` | 标题、主文字（rgb(24,25,37)） |
| `accent-purple` | `#9580ff` | 主按钮、强调色（rgb(149,128,255)） |
| `accent-blue` | `#2c78fc` | NEW 标签、链接 |
| `accent-green` | `#33c758` | 成功状态、终端命令提示符 |
| `border-default` | `#e0e0e0` | 按钮边框、分割线 |

---

## Typography（完全复刻）

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---------|------|------|--------|-------------|----------------|
| H1 (Hero) | sans-serif | 60px | 600 | 68px | -3px |
| H2 (Section) | sans-serif | 36px | 500 | 1.2 | -1px |
| H3 (Card title) | sans-serif | 24px | 500 | 1.4 | -0.5px |
| Body | sans-serif | 16px | 400 | 1.6 | 0 |
| Caption | sans-serif | 14px | 400 | 1.5 | 0 |
| Label / Nav | sans-serif | 16px | 400 | 1.5 | 0 |
| Badge | sans-serif | 12px | 500 | 1.5 | 0 |

---

## Spacing System

| Token | Value |
|-------|-------|
| `section-py` | `128px` / `8rem` |
| `content-max-w` | `900px` |
| `container-px` | `24px` |
| `card-radius` | `24px` |
| `button-radius` | `9999px` (pill) |
| `grid-gap` | `16px` / `24px` |

---

## Component Design（复刻 visitors.now）

### Announcement Bar
- 高度：40px
- 背景：`#14141f`（深色，与页面形成对比）
- 左侧 NEW badge：`#2c78fc` 背景，白色文字，圆角 pill
- 右侧文字：白色/70% 透明度

### Navbar
- 固定顶部，背景透明（滚动后 `bg-white/80 backdrop-blur`）
- 下方有 1px 分割线（滚动后出现）
- 左侧：Logo + 平台名称（`#181925`，15px，medium）
- 中间/右侧：导航链接（16px，`#666`，hover `#181925`）
- CTA 按钮：`#9580ff` 背景，白色文字，pill 形状

### Hero Section
- 垂直居中，上方预留导航+公告条高度
- 公告 pill：蓝色背景 + 文字
- H1：60px，weight 600，`#181925`，letter-spacing -3px
- 副标题：18px，`#666`
- 主按钮：`#9580ff` pill，白色文字，带图标
- 次按钮：透明背景，`#e0e0e0` 边框，`#666` 文字，pill
- 底部数据条：14px，`#999`，中间用 `·` 分隔

### Product Preview（Tab 切换）
- Tab 按钮：pill 形状，激活态 `bg-[#181925] text-white`，非激活态 `#999`
- 内容卡片：`#fafafa` 背景，24px 圆角
- 左侧文字区 + 右侧深色终端截图（形成对比）

### Trust Strip
- 上方标签：12px，`#999`，uppercase，tracking-widest
- 技术栈图标行：18px 图标 + 14px 文字，`#999`

### Feature Tabs
- 上方标签：12px，`#999`，uppercase
- H2：36px，`#181925`
- 左侧 Tab 列表：圆角按钮，激活态 `#fafafa` 背景
- 右侧内容卡片：`#fafafa`，24px 圆角，大 padding
- 内部标签：pill 形状，白色背景，`#e0e0e0` 边框

### Steps Section
- 上方标签 + H2 + 描述（与 Feature Tabs 一致）
- 3 列卡片：`#fafafa`，24px 圆角
- 序号：大字体，浅灰色 `#e0e0e0`
- 卡片间箭头连接（桌面端）

### Testimonials
- 上方标签 + H2 + 描述
- 3 列卡片：`#fafafa`，24px 圆角
- Quote 图标：`#9580ff`/40
- 头像：`#9580ff`/15 背景，`#9580ff` 文字

### FAQ Section
- 上方标签 + H2 + 描述
- 两列手风琴布局
- 问题：`#181925`，16px，medium
- 答案：`#666`，14px
- 分割线：`#e0e0e0`
- 展开/收起动画

### CTA Section
- 居中大卡片：`#fafafa`，24px 圆角，大 padding
- H2 + 描述 + 双按钮（与 Hero 按钮一致）

### Footer
- 4 列布局：品牌 / 平台 / 资源 / 关于
- 品牌文字：14px，`#181925`
- 链接文字：14px，`#999`，hover `#181925`
- 底部版权行：12px，`#999`，上边框 `#e0e0e0`

---

## Animation & Interaction

| Element | Animation |
|---------|-----------|
| Section enter | `opacity: 0→1, y: 40→0`, duration 0.8s, ease-out |
| Stagger children | delay 0.1s ~ 0.15s 递增 |
| Tab switch | 内容淡入淡出，duration 0.35s |
| FAQ expand | height auto + opacity，duration 0.3s |
| Buttons hover | 主按钮亮度提升，次按钮边框加深 |

---

## Page Structure

```
LandingPage
├── GradientBackground（纯白背景）
├── AnnouncementBar（深色条）
├── Navbar（透明→滚动毛玻璃）
├── HeroSection
├── ProductPreview（Tab 切换终端预览）
├── TrustStrip（技术栈标识）
├── FeatureTabs（左侧 Tab + 右侧卡片）
├── StepsSection（3 步卡片 + 箭头）
├── Testimonials（3 列评价）
├── FAQSection（两列手风琴）
├── CTASection（居中大卡片）
└── FooterSection（4 列 + 版权）
```

---

## Responsive Breakpoints

| Breakpoint | Adjustments |
|------------|-------------|
| `sm` (640px) | 字体缩小，单列布局 |
| `md` (768px) | 2列网格生效 |
| `lg` (1024px) | 完整布局，3列评价 |
| `xl` (1280px) | max-w 容器居中 |

---

## Key Differences from Original Dark Theme

| Aspect | Original | New (visitors.now style) |
|--------|----------|--------------------------|
| Background | `#0a0a0a` dark | `#ffffff` white |
| Card background | `white/[0.02]` | `#fafafa` |
| Text primary | `#ffffff` | `#181925` |
| Text secondary | `#a1a1a1` | `#666` |
| Border | `white/[0.06]` | `#e0e0e0` |
| Button shape | rounded-sm (6px) | rounded-full (pill) |
| Button primary | `bg-white text-[#0a0a0a]` | `bg-[#9580ff] text-white` |
| Font for headings | serif (Lora) | sans-serif (Inter) |
| Shadows/glows | Purple glow on hover | None (clean flat design) |

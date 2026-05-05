# 鸿蒙仓颉应用构建经验

## 主页底栏：禁止满屏叠层抢触摸；改为 Column 常驻底部

- **日期**：2026-05-03
- **错误类型**：运行时触摸 / 布局
- **现象**：（1）底栏用满高 `Stack`/`Column` 叠在内容上时，主体无法点击。（2）去掉满高叠层、仅用 `.align(Bottom)` 时，在部分场景下底栏会跑到顶部或与预期不符。
- **原因分析**：
  1. 高 `zIndex` 且 **宽×高均为 100%** 的容器，在 ArkUI 命中顺序里常常**整面截获触摸**，即使视觉上只有底部一条栏。
  2. 当前 **仓颉 `kit.ArkUI` 绑定里 `Stack`/`Column`/`Blank` 无 `hitTestBehavior`**（编译期即不存在成员），无法按 ArkTS 文档用 `HitTestMode.None` 让满高父容器穿透、子节点仍响应。
  3. 嵌套 `@Builder` 链式修饰仍需 **`Column { this.buildMainBottomBar() }`** 包住；`String` 路径末字符比较用 `Int32(dir[dir.size - 1]) == 47`（`/`）。
- **解决方案（两全）**：**不要**把底栏放在与主体同一层、满屏的 `Stack` 里做叠层；把主页改成 **纵向 `Column`**：
  - **第一子节点**：原「内容 + 顶栏悬浮」的 `Stack`，并设 **`layoutWeight(1)` + `width(100%)`**，占满除底栏外的剩余高度；
  - **第二子节点**：**仅包含底栏**的 `Column`，宽度 `100%`，自然落在屏底（底栏自身可保留 `margin(bottom: … + getBottomSafeHeight())`）。
  - 各 Tab 的 `Scroll` **底部内边距**改为小常量（如 `mainScrollBottomInsetVp()` ≈ 24vp），因不再被底栏叠盖，不必再预留整条导航高度。
- **示例结构**：
  ```cangjie
  Column {
      Stack(alignContent: Alignment.TopStart) {
          Stack { /* HomePage / EditorPage / … */ }
              .width(100.percent)
              .height(100.percent)
          Column { this.buildTopBar() }
              .width(100.percent)
              .padding(...)
              .zIndex(24)
      }
          .layoutWeight(1)
          .width(100.percent)
      Column { this.buildMainBottomBar() }
          .width(100.percent)
  }
      .width(100.percent)
      .height(100.percent)
  ```
- **关键词**：命中测试, zIndex, Stack, Column, layoutWeight, 底栏, buildMainPage, mainScrollBottomInsetVp, hitTestBehavior

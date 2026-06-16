# AI 交付局图文 PLOG 生成器

一个面向小红书/图文内容的 PLOG 生成 Web App。上传封面、填写标题，把正文按 Markdown 写好并插入图片，就可以实时预览并一键导出 1080x1440 的图片。

## 在线使用

GitHub Pages 地址：

https://X-hub-spec.github.io/ai-jiaofuju-plog-web-app/

## 功能

- 封面标题支持 Markdown `**重点**` 着重显示
- 正文支持段落、加粗、引用、列表、代码块和图片
- 支持用 `<!-- pagebreak -->` 强制分页
- 图片插入后默认不显示文件名说明
- 支持「书面阅读感」和「专业黑金」两套风格
- 实时预览 3:4 画幅
- 一键导出所有页面为 ZIP 图片包

## 使用方式

1. 上传第一页封面图，填写标题和作者。
2. 在正文编辑区粘贴 Markdown 内容。
3. 点击「插入图片」把正文图片插入到当前位置。
4. 需要手动另起一页时，点击「强制分页」插入 `<!-- pagebreak -->`。
5. 在右侧实时预览页面效果。
6. 点击「下载全部」导出发布用图片。

## 本地开发

```bash
npm install
npm run dev
```

本地打开：

```text
http://localhost:5177/
```

## 构建

```bash
npm run build
```

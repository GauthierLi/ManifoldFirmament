# DINOv3 UMAP 3D 可视化

使用 DINOv3 提取图片特征，UMAP 降维到 3D，Three.js 前端交互式可视化。

## ✨ 特性

- 🎨 **可拖动窗口布局** - 统计信息、数据集选择、日志面板可自由拖动
- 🧲 **边缘吸附** - 靠近屏幕边缘自动吸附，支持一键自动排版
- 📁 **文件上传** - 支持预设数据集和自定义上传 paths.txt 文件
- 📜 **实时日志** - 处理过程中实时显示日志，支持清空和自动滚动
- 🎯 **固定点大小** - 缩放时点大小保持不变，方便观察密集区域
- 💾 **位置保存** - 面板位置自动保存到浏览器，刷新后保持布局

## 快速开始

### 1. 安装依赖

```bash
cd /home/gauthierli/code/dinov3-umap-viz
pip install -r requirements.txt
```

### 2. 运行处理流水线

**命令行方式：**
```bash
python src/main.py /path/to/image_paths.txt --model dinov2_vitb14
```

**Web 界面方式（推荐）：**
```bash
python src/server/api.py
```
然后访问 http://localhost:8000/view，在界面中选择数据集或上传文件，点击"🚀 加载并处理"

### 3. 可视化操作

- **🖱️ 拖动面板** - 抓住面板标题栏拖动，靠近边缘自动吸附
- **📐 自动排版** - 点击底部控制栏"自动排版"按钮一键整理布局
- **➖ 最小化** - 点击面板右上角"−"按钮最小化/展开
- **🔍 缩放旋转** - 鼠标滚轮缩放，左键拖动旋转，右键拖动平移
- **🏷️ 悬停查看** - 鼠标悬停在点上显示图片路径和索引

## 项目结构

```
dinov3-umap-viz/
├── src/
│   ├── models.py              # 数据契约（修复 numpy 序列化）
│   ├── data/
│   │   └── loader.py          # 图片路径加载
│   ├── features/
│   │   └── extractor.py       # DINOv3 特征提取
│   ├── dimensionality/
│   │   └── reducer.py         # UMAP 降维
│   ├── export/
│   │   └── pipeline.py        # 数据导出
│   ├── server/
│   │   └── api.py             # FastAPI 服务（后台处理 + 日志）
│   ├── frontend/
│   │   ├── index.html         # 可视化页面（可拖动窗口）
│   │   └── viewer.js          # Three.js 渲染 + 窗口管理
│   └── main.py                # 主入口
├── output/                    # 生成的可视化数据（已 gitignore）
├── tests/
│   └── fixtures/
├── doc/
│   └── task_tree.md
├── .gitignore                 # 排除输出、缓存、测试数据
└── requirements.txt
```

## 输入格式

txt 文件，每行一个图片路径：
```
/home/gauthierli/data/subtype/train_images_dir/img_001.jpg
/home/gauthierli/data/subtype/train_images_dir/img_002.jpg
...
```

## 输出

- `output/visualization_*.json` - 包含 3D 坐标和元数据（自动命名）
- Web 界面展示交互式 3D 点云
- 实时处理日志（前端显示 + 后端轮询）

## 配置说明

### 点渲染配置

在 `src/frontend/viewer.js` 中调整：

```javascript
const material = new THREE.PointsMaterial({
    size: 2,                    // 点大小（像素）
    sizeAttenuation: false      // false=固定大小，true=随距离缩放
});
```

### 吸附距离

```javascript
this.snapDistance = 20;  // 边缘吸附距离（像素）
```

## 注意事项

- **数据文件不提交** - `output/`、`*.txt` 测试数据已加入 `.gitignore`
- **后台处理** - 大文件处理在后台线程运行，不会阻塞 UI
- **日志限制** - 最多保留 1000 条日志，避免内存占用过高
